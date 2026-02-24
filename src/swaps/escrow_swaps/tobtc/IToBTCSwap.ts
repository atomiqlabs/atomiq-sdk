import {IToBTCDefinition, IToBTCWrapper} from "./IToBTCWrapper";
import {
    ChainType,
    isAbstractSigner,
    SignatureData,
    SignatureVerificationError,
    SwapCommitState,
    SwapCommitStateType,
    SwapData
} from "@atomiqlabs/base";
import {
    IntermediaryAPI,
    RefundAuthorizationResponse,
    RefundAuthorizationResponseCodes
} from "../../../intermediaries/apis/IntermediaryAPI";
import {IntermediaryError} from "../../../errors/IntermediaryError";
import {extendAbortController, toBigInt} from "../../../utils/Utils";
import {Fee} from "../../../types/fees/Fee";
import {IEscrowSelfInitSwap, IEscrowSelfInitSwapInit, isIEscrowSelfInitSwapInit} from "../IEscrowSelfInitSwap";
import {IRefundableSwap} from "../../IRefundableSwap";
import {FeeType} from "../../../enums/FeeType";
import {ppmToPercentage} from "../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../types/TokenAmount";
import {BtcToken, SCToken} from "../../../types/Token";
import {timeoutPromise} from "../../../utils/TimeoutUtils";
import {SwapExecutionActionCommit} from "../../../types/SwapExecutionAction";

export type IToBTCSwapInit<T extends SwapData> = IEscrowSelfInitSwapInit<T> & {
    signatureData?: SignatureData,
    data: T,
    networkFee: bigint,
    networkFeeBtc: bigint
};

export function isIToBTCSwapInit<T extends SwapData>(obj: any): obj is IToBTCSwapInit<T> {
    return typeof(obj.networkFee) === "bigint" &&
        typeof(obj.networkFeeBtc) === "bigint" &&
        (obj.signatureData==null || (
            typeof(obj.signatureData) === 'object' &&
            typeof(obj.signatureData.prefix)==="string" &&
            typeof(obj.signatureData.timeout)==="string" &&
            typeof(obj.signatureData.signature)==="string"
        )) &&
        typeof(obj.data) === 'object' &&
        isIEscrowSelfInitSwapInit<T>(obj);
}

/**
 * State enum for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export enum ToBTCSwapState {
    /**
     * Intermediary (LP) was unable to process the swap and the funds were refunded on the
     *  source chain
     */
    REFUNDED = -3,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -2,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -1,
    /**
     * Swap was created, use the {@link IToBTCSwap.commit} or {@link IToBTCSwap.txsCommit} to
     *  initiate it by creating the swap escrow on the source chain
     */
    CREATED = 0,
    /**
     * Swap escrow was initiated (committed) on the source chain, the intermediary (LP) will
     *  now process the swap. You can wait till that happens with the {@link IToBTCSwap.waitForPayment}
     *  function.
     */
    COMMITED = 1,
    /**
     * The intermediary (LP) has processed the transaction and sent out the funds on the destination chain,
     *  but hasn't yet settled the escrow on the source chain.
     */
    SOFT_CLAIMED = 2,
    /**
     * Swap was successfully settled by the intermediary (LP) on the source chain
     */
    CLAIMED = 3,
    /**
     * Intermediary (LP) was unable to process the swap and the swap escrow on the source chain
     *  is refundable, call {@link IToBTCSwap.refund} or {@link IToBTCSwap.txsRefund} to refund
     */
    REFUNDABLE = 4
}

/**
 * Base class for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export abstract class IToBTCSwap<
    T extends ChainType = ChainType,
    D extends IToBTCDefinition<T, IToBTCWrapper<T, D>, IToBTCSwap<T, D>> = IToBTCDefinition<T, IToBTCWrapper<T, any>, IToBTCSwap<T, any>>,
> extends IEscrowSelfInitSwap<T, D, ToBTCSwapState> implements IRefundableSwap<T, D, ToBTCSwapState> {
    /**
     * @internal
     */
    protected readonly abstract outputToken: BtcToken;
    /**
     * @internal
     */
    protected readonly networkFee: bigint;
    /**
     * @internal
     */
    protected networkFeeBtc: bigint;

    /**
     * @internal
     */
    readonly _data!: T["Data"];

    protected constructor(wrapper: D["Wrapper"], serializedObject: any);
    protected constructor(wrapper: D["Wrapper"], init: IToBTCSwapInit<T["Data"]>);
    protected constructor(
        wrapper: D["Wrapper"],
        initOrObject: IToBTCSwapInit<T["Data"]> | any
    ) {
        super(wrapper, initOrObject);
        if(isIToBTCSwapInit<T["Data"]>(initOrObject)) {
            this._state = ToBTCSwapState.CREATED;
            this.networkFee = initOrObject.networkFee;
            this.networkFeeBtc = initOrObject.networkFeeBtc;
            this._data = initOrObject.data;
            this.signatureData = initOrObject.signatureData;
        } else {
            this.networkFee = toBigInt(initOrObject.networkFee);
            this.networkFeeBtc = toBigInt(initOrObject.networkFeeBtc);
        }
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected getSwapData(): T["Data"] {
        return this._data;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion() {
        if(this.version == null) {
            switch(this._state) {
                case -2:
                    this._state = ToBTCSwapState.REFUNDED
                    break;
                case -1:
                    this._state = ToBTCSwapState.QUOTE_EXPIRED
                    break;
                case 0:
                    this._state = ToBTCSwapState.CREATED
                    break;
                case 1:
                    this._state = ToBTCSwapState.COMMITED
                    break;
                case 2:
                    this._state = ToBTCSwapState.CLAIMED
                    break;
                case 3:
                    this._state = ToBTCSwapState.REFUNDABLE
                    break;
            }
            this.version = 1;
        }
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected tryRecomputeSwapPrice() {
        const output = this.getOutput();
        if(output.rawAmount!=null) {
            if(this.swapFeeBtc==null) {
                this.swapFeeBtc = this.swapFee * output.rawAmount / this.getInputWithoutFee().rawAmount;
            }
            if(this.networkFeeBtc==null) {
                this.networkFeeBtc = this.networkFee * output.rawAmount / this.getInputWithoutFee().rawAmount;
            }
        }
        super.tryRecomputeSwapPrice();
    }

    /**
     * Returns the payment hash identifier to be sent to the LP for getStatus and getRefund
     * @internal
     */
    protected getLpIdentifier(): string {
        return this.getClaimHash();
    }

    /**
     * Sets the payment result for the swap, optionally also checking it (checking that tx exist or swap secret is valid)
     *
     * @param result Result returned by the LP
     * @param check Whether to check the passed result
     * @returns true if check passed, false if check failed with a soft error (e.g. tx not yet found in the mempool)
     * @throws {IntermediaryError} When the data returned by the intermediary isn't valid
     *
     * @internal
     */
    abstract _setPaymentResult(result: {secret?: string, txId?: string}, check?: boolean): Promise<boolean>;


    //////////////////////////////
    //// Getters & utils

    /**
     * @inheritDoc
     */
    getInputAddress(): string | null {
        return this._getInitiator();
    }

    /**
     * @inheritDoc
     */
    getInputTxId(): string | null {
        return this._commitTxId ?? null;
    }

    /**
     * @inheritDoc
     */
    requiresAction(): boolean {
        return this.isRefundable();
    }

    /**
     * @inheritDoc
     */
    isFinished(): boolean {
        return this._state===ToBTCSwapState.CLAIMED || this._state===ToBTCSwapState.REFUNDED || this._state===ToBTCSwapState.QUOTE_EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isRefundable(): boolean {
        return this._state===ToBTCSwapState.REFUNDABLE;
    }

    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean {
        return this._state===ToBTCSwapState.QUOTE_EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean {
        return this._state===ToBTCSwapState.QUOTE_EXPIRED || this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isSuccessful(): boolean {
        return this._state===ToBTCSwapState.CLAIMED;
    }

    /**
     * @inheritDoc
     */
    isFailed(): boolean {
        return this._state===ToBTCSwapState.REFUNDED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string {
        return this._data.getOfferer();
    }


    //////////////////////////////
    //// Amounts & fees

    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken> {
        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate fee!");

        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const output = this.getOutput();
        const swapFeePPM = output.rawAmount==null ? 0n : feeWithoutBaseFee * 1000000n / output.rawAmount;

        const amountInDstToken = toTokenAmount(
            this.swapFeeBtc, this.outputToken, this.wrapper._prices, this.pricingInfo
        );
        return {
            amountInSrcToken: toTokenAmount(this.swapFee, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo),
            amountInDstToken,
            currentUsdValue: amountInDstToken.currentUsdValue,
            usdValue: amountInDstToken.usdValue,
            pastUsdValue: amountInDstToken.pastUsdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, this.outputToken, this.wrapper._prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    /**
     * Returns network fee for on the destination chain for the swap
     *
     * @internal
     */
    protected getNetworkFee(): Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken> {
        const amountInDstToken = toTokenAmount(
            this.networkFeeBtc, this.outputToken, this.wrapper._prices, this.pricingInfo
        );
        return {
            amountInSrcToken: toTokenAmount(
                this.networkFee, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo
            ),
            amountInDstToken,
            currentUsdValue: amountInDstToken.currentUsdValue,
            usdValue: amountInDstToken.usdValue,
            pastUsdValue: amountInDstToken.pastUsdValue
        };
    }

    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken> {
        const amountInDstToken = toTokenAmount(
            this.swapFeeBtc + this.networkFeeBtc, this.outputToken, this.wrapper._prices, this.pricingInfo
        );
        return {
            amountInSrcToken: toTokenAmount(
                this.swapFee + this.networkFee, this.wrapper._tokens[this._data.getToken()],
                this.wrapper._prices, this.pricingInfo
            ),
            amountInDstToken,
            currentUsdValue: amountInDstToken.currentUsdValue,
            usdValue: amountInDstToken.usdValue,
            pastUsdValue: amountInDstToken.pastUsdValue
        }
    }

    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [
        {type: FeeType.SWAP, fee: Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>},
        {type: FeeType.NETWORK_OUTPUT, fee: Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>},
    ] {
        return [
            {
                type: FeeType.SWAP,
                fee: this.getSwapFee()
            },
            {
                type: FeeType.NETWORK_OUTPUT,
                fee: this.getNetworkFee()
            }
        ];
    }

    /**
     * @inheritDoc
     */
    getInputToken(): SCToken<T["ChainId"]> {
        return this.wrapper._tokens[this._data.getToken()];
    }

    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(
            this._data.getAmount(), this.wrapper._tokens[this._data.getToken()],
            this.wrapper._prices, this.pricingInfo
        );
    }

    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(
            this._data.getAmount() - (this.swapFee + this.networkFee),
            this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo
        );
    }

    /**
     * Checks if the initiator/sender on the source chain has enough balance to go through with the swap
     */
    async hasEnoughBalance(): Promise<{
        enoughBalance: boolean,
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>,
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>
    }> {
        const [balance, commitFee] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this._data.getToken(), false),
            this._data.getToken()===this.wrapper._chain.getNativeCurrencyAddress() ? this.getCommitFee() : Promise.resolve(null)
        ]);
        let required = this._data.getAmount();
        if(commitFee!=null) required = required + commitFee;
        return {
            enoughBalance: balance >= required,
            balance: toTokenAmount(balance, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo),
            required: toTokenAmount(required, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo)
        };
    }

    /**
     * Checks if the initiator/sender on the source chain has enough native token balance
     *  to cover the transaction fee of initiating the swap
     */
    async hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean,
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>,
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>
    }> {
        const [balance, commitFee] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this.wrapper._chain.getNativeCurrencyAddress(), false),
            this.getCommitFee()
        ]);
        return {
            enoughBalance: balance >= commitFee,
            balance: toTokenAmount(balance, this.wrapper._getNativeToken(), this.wrapper._prices),
            required: toTokenAmount(commitFee, this.wrapper._getNativeToken(), this.wrapper._prices)
        };
    }


    //////////////////////////////
    //// Execution

    /**
     * Executes the swap with the provided smart chain wallet/signer
     *
     * @param signer Smart chain wallet/signer to use to sign the transaction on the source chain
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether the swap was successfully processed by the LP, in case `false` is returned
     *  the user can refund their funds back on the source chain by calling {@link refund}
     */
    async execute(
        signer: T["Signer"] | T["NativeSigner"],
        callbacks?: {
            onSourceTransactionSent?: (sourceTxId: string) => void,
            onSourceTransactionConfirmed?: (sourceTxId: string) => void,
            onSwapSettled?: (destinationTxId: string) => void
        },
        options?: {
            abortSignal?: AbortSignal,
            paymentCheckIntervalSeconds?: number,
            maxWaitTillSwapProcessedSeconds?: number
        }
    ): Promise<boolean> {
        if(this._state===ToBTCSwapState.QUOTE_EXPIRED || this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED) throw new Error("Quote expired");
        if(this._state===ToBTCSwapState.REFUNDED) throw new Error("Swap already refunded");
        if(this._state===ToBTCSwapState.REFUNDABLE) throw new Error("Swap refundable, refund with swap.refund()");
        if(this._state===ToBTCSwapState.SOFT_CLAIMED || this._state===ToBTCSwapState.CLAIMED) throw new Error("Swap already settled!");

        if(this._state===ToBTCSwapState.CREATED) {
            const txId = await this.commit(signer, options?.abortSignal, false, callbacks?.onSourceTransactionSent);
            if(callbacks?.onSourceTransactionConfirmed!=null) callbacks.onSourceTransactionConfirmed(txId);
        }

        // @ts-ignore
        if(this._state===ToBTCSwapState.CLAIMED || this._state===ToBTCSwapState.SOFT_CLAIMED) return true;

        if(this._state===ToBTCSwapState.COMMITED) {
            const success = await this.waitForPayment(options?.maxWaitTillSwapProcessedSeconds ?? 120, options?.paymentCheckIntervalSeconds, options?.abortSignal);
            if(success) {
                if(callbacks?.onSwapSettled!=null) callbacks.onSwapSettled(this.getOutputTxId()!);
                return true;
            } else {
                return false;
            }
        }

        throw new Error("Unexpected state reached!");
    }

    /**
     * @inheritDoc
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     */
    async txsExecute(options?: {
        skipChecks?: boolean
    }): Promise<[
        SwapExecutionActionCommit<T>
    ]> {
        if(this._state!==ToBTCSwapState.CREATED) throw new Error("Invalid swap state, needs to be CREATED!");
        const txsCommit = await this.txsCommit(options?.skipChecks);
        return [
            {
                name: "Commit" as const,
                description: `Initiates the swap by commiting the funds to the escrow on the ${this.chainIdentifier} side`,
                chain: this.chainIdentifier,
                txs: txsCommit
            }
        ];
    }


    //////////////////////////////
    //// Commit

    /**
     * @inheritDoc
     *
     * @throws {Error} When in invalid state (not {@link ToBTCSwapState.CREATED})
     */
    async txsCommit(skipChecks?: boolean): Promise<T["TX"][]> {
        if(this._state!==ToBTCSwapState.CREATED) throw new Error("Must be in CREATED state!");
        if(this.signatureData==null) throw new Error("Init signature data not known, cannot commit!");

        if(!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }

        return await this.wrapper._contract.txsInit(
            this._getInitiator(), this._data, this.signatureData, skipChecks, this.feeRate
        ).catch(e => Promise.reject(e instanceof SignatureVerificationError ? new Error("Request timed out") : e));
    }

    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commit(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean, onBeforeTxSent?: (txId: string) => void): Promise<string> {
        const signer = isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        this.checkSigner(signer);
        const txs = await this.txsCommit(skipChecks);
        let txCount = 0;
        const result = await this.wrapper._chain.sendAndConfirm(
            signer, txs, true, abortSignal, false, (txId, rawTx) => {
                txCount++;
                if(onBeforeTxSent!=null && txCount===txs.length) onBeforeTxSent(txId);
                return Promise.resolve();
            }
        );

        this._commitTxId = result[result.length-1];
        if(this._state===ToBTCSwapState.CREATED || this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED || this._state===ToBTCSwapState.QUOTE_EXPIRED) {
            await this._saveAndEmit(ToBTCSwapState.COMMITED);
        }
        return this._commitTxId;
    }

    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is not in the correct state (must be {@link ToBTCSwapState.CREATED})
     */
    async waitTillCommited(abortSignal?: AbortSignal): Promise<void> {
        if(this._state===ToBTCSwapState.COMMITED || this._state===ToBTCSwapState.CLAIMED) return Promise.resolve();
        if(this._state!==ToBTCSwapState.CREATED && this._state!==ToBTCSwapState.QUOTE_SOFT_EXPIRED) throw new Error("Invalid state (not CREATED)");

        const abortController = extendAbortController(abortSignal);
        let result: number | boolean;
        try {
            result = await Promise.race([
                this.watchdogWaitTillCommited(undefined, abortController.signal),
                this.waitTillState(ToBTCSwapState.COMMITED, "gte", abortController.signal).then(() => 0)
            ]);
            abortController.abort();
        } catch (e) {
            abortController.abort();
            throw e;
        }

        if(result===0) this.logger.debug("waitTillCommited(): Resolved from state change");
        if(result===true) this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
        if(result===false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - signature expiry");
            if(this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED || this._state===ToBTCSwapState.CREATED) {
                await this._saveAndEmit(ToBTCSwapState.QUOTE_EXPIRED);
            }
            throw new Error("Quote expired while waiting for transaction confirmation!");
        }

        if(this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED || this._state===ToBTCSwapState.CREATED || this._state===ToBTCSwapState.QUOTE_EXPIRED) {
            await this._saveAndEmit(ToBTCSwapState.COMMITED);
        }
    }


    //////////////////////////////
    //// Payment

    /**
     * Waits till the swap is processed by the intermediary (LP)
     *
     * @param checkIntervalSeconds How often to poll the intermediary for status (5 seconds default)
     * @param abortSignal Abort signal
     * @internal
     */
    protected async waitTillIntermediarySwapProcessed(
        checkIntervalSeconds?: number,
        abortSignal?: AbortSignal
    ): Promise<RefundAuthorizationResponse> {
        if(this.url==null) throw new Error("LP URL not specified!");
        checkIntervalSeconds ??= 5;
        let resp: RefundAuthorizationResponse = {code: RefundAuthorizationResponseCodes.PENDING, msg: ""};
        while(!abortSignal?.aborted && (
            resp.code===RefundAuthorizationResponseCodes.PENDING || resp.code===RefundAuthorizationResponseCodes.NOT_FOUND
        )) {
            resp = await IntermediaryAPI.getRefundAuthorization(this.url, this.getLpIdentifier(), this._data.getSequence());
            if(resp.code===RefundAuthorizationResponseCodes.PAID) {
                const validResponse = await this._setPaymentResult(resp.data, true);
                if(validResponse) {
                    if(this._state===ToBTCSwapState.COMMITED || this._state===ToBTCSwapState.REFUNDABLE) {
                        await this._saveAndEmit(ToBTCSwapState.SOFT_CLAIMED);
                    }
                } else {
                    resp = {code: RefundAuthorizationResponseCodes.PENDING, msg: ""};
                }
            }
            if(
                resp.code===RefundAuthorizationResponseCodes.PENDING ||
                resp.code===RefundAuthorizationResponseCodes.NOT_FOUND
            ) await timeoutPromise(checkIntervalSeconds*1000, abortSignal);
        }
        return resp;
    }

    /**
     * Checks whether the swap was already processed by the LP and is either successful (requires proof which is
     *  either a HTLC pre-image for LN swaps or valid txId for on-chain swap) or failed and we can cooperatively
     *  refund.
     *
     * @param save whether to save the data
     * @returns `true` if swap is processed, `false` if the swap is still ongoing
     *
     * @internal
     */
    protected async checkIntermediarySwapProcessed(save: boolean = true): Promise<boolean> {
        if(this._state===ToBTCSwapState.CREATED || this._state==ToBTCSwapState.QUOTE_EXPIRED || this.url==null) return false;
        if(this.isFinished() || this.isRefundable()) return true;
        //Check if that maybe already concluded according to the LP
        const resp = await IntermediaryAPI.getRefundAuthorization(this.url, this.getLpIdentifier(), this._data.getSequence());
        switch(resp.code) {
            case RefundAuthorizationResponseCodes.PAID:
                const processed = await this._setPaymentResult(resp.data, true);
                if(processed) {
                    this._state = ToBTCSwapState.SOFT_CLAIMED;
                    if(save) await this._saveAndEmit();
                }
                return processed;
            case RefundAuthorizationResponseCodes.REFUND_DATA:
                await this.wrapper._contract.isValidRefundAuthorization(this._data, resp.data);
                this._state = ToBTCSwapState.REFUNDABLE;
                if(save) await this._saveAndEmit();
                return true;
            default:
                return false;
        }
    }

    /**
     * A blocking promise resolving when swap was concluded by the intermediary (LP),
     *  rejecting in case of failure
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled, an error is thrown if the
     *  swap is taking too long to claim
     * @param checkIntervalSeconds How often to poll the intermediary for answer
     * @param abortSignal Abort signal
     * @returns `true` if swap was successful, `false` if swap failed and we can refund
     *
     * @throws {IntermediaryError} If a swap is determined expired by the intermediary, but it is actually still valid
     * @throws {SignatureVerificationError} If the swap should be cooperatively refundable but the intermediary returned
     *  invalid refund signature
     * @throws {Error} When swap expires or if the swap has invalid state (must be {@link ToBTCSwapState.COMMITED})
     */
    async waitForPayment(maxWaitTimeSeconds?: number, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean> {
        if(this._state===ToBTCSwapState.CLAIMED) return Promise.resolve(true);
        if(this._state!==ToBTCSwapState.COMMITED && this._state!==ToBTCSwapState.SOFT_CLAIMED) throw new Error("Invalid state (not COMMITED)");

        const abortController = extendAbortController(abortSignal);

        let timedOut: boolean = false;
        if(maxWaitTimeSeconds!=null) {
            const timeout = setTimeout(() => {
                timedOut = true;
                abortController.abort();
            }, maxWaitTimeSeconds * 1000);
            abortController.signal.addEventListener("abort", () => clearTimeout(timeout));
        }

        let result: void | RefundAuthorizationResponse;
        try {
            result = await Promise.race([
                this.waitTillState(ToBTCSwapState.CLAIMED, "gte", abortController.signal),
                this.waitTillIntermediarySwapProcessed(checkIntervalSeconds, abortController.signal)
            ]);
            abortController.abort();
        } catch (e) {
            abortController.abort();
            if(timedOut) {
                throw new Error("Timed out while waiting for LP to process the swap, the LP might be unresponsive or offline!" +
                    ` Please check later or wait till ${new Date(Number(this._data.getExpiry())*1000).toLocaleString()} to refund unilaterally!`);
            }
            throw e;
        }

        if(typeof result !== "object") {
            if((this._state as ToBTCSwapState)===ToBTCSwapState.REFUNDABLE) throw new Error("Swap expired");
            this.logger.debug("waitTillRefunded(): Resolved from state change");
            return true;
        }
        this.logger.debug("waitTillRefunded(): Resolved from intermediary response");

        switch(result.code) {
            case RefundAuthorizationResponseCodes.PAID:
                return true;
            case RefundAuthorizationResponseCodes.REFUND_DATA:
                const resultData = result.data;
                await this.wrapper._contract.isValidRefundAuthorization(
                    this._data,
                    resultData
                );
                await this._saveAndEmit(ToBTCSwapState.REFUNDABLE);
                return false;
            case RefundAuthorizationResponseCodes.EXPIRED:
                if(await this.wrapper._contract.isExpired(this._getInitiator(), this._data)) throw new Error("Swap expired");
                throw new IntermediaryError("Swap expired");
            case RefundAuthorizationResponseCodes.NOT_FOUND:
                if((this._state as ToBTCSwapState)===ToBTCSwapState.CLAIMED) return true;
                throw new Error("LP swap not found");
        }

        throw new Error("Invalid response code returned by the LP");
    }


    //////////////////////////////
    //// Refund

    /**
     * Get the estimated smart chain transaction fee of the refund transaction
     */
    async getRefundNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>> {
        const swapContract: T["Contract"] = this.wrapper._contract;
        return toTokenAmount(
            await swapContract.getRefundFee(this._getInitiator(), this._data),
            this.wrapper._getNativeToken(),
            this.wrapper._prices
        );
    }

    /**
     * @inheritDoc
     *
     * @throws {IntermediaryError} If intermediary returns invalid response in case cooperative refund should be used
     * @throws {SignatureVerificationError} If intermediary returned invalid cooperative refund signature
     * @throws {Error} When state is not refundable
     */
    async txsRefund(signer?: string): Promise<T["TX"][]> {
        if(!this.isRefundable()) throw new Error("Must be in REFUNDABLE state or expired!");

        signer ??= this._getInitiator();

        if(await this.wrapper._contract.isExpired(this._getInitiator(), this._data)) {
            return await this.wrapper._contract.txsRefund(signer, this._data, true, true);
        } else {
            if(this.url==null) throw new Error("LP URL not known, cannot get cooperative refund message, wait till expiry to refund!");
            const res = await IntermediaryAPI.getRefundAuthorization(this.url, this.getLpIdentifier(), this._data.getSequence());
            if(res.code===RefundAuthorizationResponseCodes.REFUND_DATA) {
                return await this.wrapper._contract.txsRefundWithAuthorization(
                    signer,
                    this._data,
                    res.data,
                    true,
                    true
                );
            }
            throw new IntermediaryError("Invalid intermediary cooperative message returned");
        }
    }

    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async refund(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string> {
        const signer = isAbstractSigner(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        const result = await this.wrapper._chain.sendAndConfirm(signer, await this.txsRefund(signer.getAddress()), true, abortSignal)

        this._refundTxId = result[0];
        if(this._state===ToBTCSwapState.COMMITED || this._state===ToBTCSwapState.REFUNDABLE || this._state===ToBTCSwapState.SOFT_CLAIMED) {
            await this._saveAndEmit(ToBTCSwapState.REFUNDED);
        }
        return result[0];
    }

    /**
     * @inheritDoc
     *
     * @throws {Error} When swap is not in a valid state (must be {@link ToBTCSwapState.COMMITED} or
     *  {@link ToBTCSwapState.REFUNDABLE})
     * @throws {Error} If we tried to refund but claimer was able to claim first
     */
    async waitTillRefunded(abortSignal?: AbortSignal): Promise<void> {
        if(this._state===ToBTCSwapState.REFUNDED) return Promise.resolve();
        if(
            this._state!==ToBTCSwapState.COMMITED &&
            this._state!==ToBTCSwapState.SOFT_CLAIMED &&
            this._state!==ToBTCSwapState.REFUNDABLE
        ) throw new Error("Invalid state (not COMMITED)");

        const abortController = new AbortController();
        if(abortSignal!=null) abortSignal.addEventListener("abort", () => abortController.abort(abortSignal.reason));
        const res = await Promise.race([
            this.watchdogWaitTillResult(undefined, abortController.signal),
            this.waitTillState(ToBTCSwapState.REFUNDED, "eq", abortController.signal).then(() => 0 as const),
            this.waitTillState(ToBTCSwapState.CLAIMED, "eq", abortController.signal).then(() => 1 as const),
        ]);
        abortController.abort();

        if(res===0) {
            this.logger.debug("waitTillRefunded(): Resolved from state change (REFUNDED)");
            return;
        }
        if(res===1) {
            this.logger.debug("waitTillRefunded(): Resolved from state change (CLAIMED)");
            throw new Error("Tried to refund swap, but claimer claimed it in the meantime!");
        }
        this.logger.debug("waitTillRefunded(): Resolved from watchdog");

        if(res?.type===SwapCommitStateType.PAID) {
            if(this._claimTxId==null) this._claimTxId = await res.getClaimTxId();
            await this._saveAndEmit(ToBTCSwapState.CLAIMED);
            throw new Error("Tried to refund swap, but claimer claimed it in the meantime!");
        }
        if(res?.type===SwapCommitStateType.NOT_COMMITED) {
            if(this._refundTxId==null && res.getRefundTxId!=null) this._refundTxId = await res.getRefundTxId();
            await this._saveAndEmit(ToBTCSwapState.REFUNDED);
        }
    }


    //////////////////////////////
    //// Storage

    /**
     * @inheritDoc
     */
    serialize(): any {
        const obj = super.serialize();
        return {
            ...obj,
            networkFee: this.networkFee==null ? null : this.networkFee.toString(10),
            networkFeeBtc: this.networkFeeBtc==null ? null : this.networkFeeBtc.toString(10)
        };
    }


    //////////////////////////////
    //// Swap ticks & sync

    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     *
     * @private
     */
    private async syncStateFromChain(quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState): Promise<boolean> {
        if(
            this._state===ToBTCSwapState.CREATED ||
            this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state===ToBTCSwapState.COMMITED ||
            this._state===ToBTCSwapState.SOFT_CLAIMED ||
            this._state===ToBTCSwapState.REFUNDABLE
        ) {
            let quoteExpired = false;
            if(this._state===ToBTCSwapState.CREATED || this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED) {
                //Check if quote is still valid
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }

            commitStatus ??= await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            if(commitStatus!=null && await this._forciblySetOnchainState(commitStatus)) return true;

            if((this._state===ToBTCSwapState.CREATED || this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED)) {
                if(quoteExpired) {
                    this._state = ToBTCSwapState.QUOTE_EXPIRED;
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState(): boolean {
        return this._state===ToBTCSwapState.CREATED ||
            this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state===ToBTCSwapState.COMMITED ||
            this._state===ToBTCSwapState.SOFT_CLAIMED ||
            this._state===ToBTCSwapState.REFUNDABLE;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus(): boolean {
        return this._state===ToBTCSwapState.CREATED || this._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState): Promise<boolean> {
        let changed = await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus);

        if(this._state===ToBTCSwapState.COMMITED || this._state===ToBTCSwapState.SOFT_CLAIMED) {
            //Check if that maybe already concluded
            try {
                if(await this.checkIntermediarySwapProcessed(false)) changed = true;
            } catch (e) {
                this.logger.error("_sync(): Failed to synchronize swap, error: ", e);
            }
        }

        if(save && changed) await this._saveAndEmit();

        return changed;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _forciblySetOnchainState(commitStatus: SwapCommitState): Promise<boolean> {
        switch(commitStatus.type) {
            case SwapCommitStateType.PAID:
                if(this._claimTxId==null && commitStatus.getClaimTxId) this._claimTxId = await commitStatus.getClaimTxId();
                const eventResult = await commitStatus.getClaimResult();
                try {
                    await this._setPaymentResult({secret: eventResult, txId: Buffer.from(eventResult, "hex").reverse().toString("hex")});
                } catch (e) {
                    this.logger.error(`Failed to set payment result ${eventResult} on the swap!`);
                }
                this._state = ToBTCSwapState.CLAIMED;
                return true;
            case SwapCommitStateType.REFUNDABLE:
                this._state = ToBTCSwapState.REFUNDABLE;
                return true;
            case SwapCommitStateType.EXPIRED:
                if(this._refundTxId==null && commitStatus.getRefundTxId) this._refundTxId = await commitStatus.getRefundTxId();
                this._state = this._refundTxId==null ? ToBTCSwapState.QUOTE_EXPIRED : ToBTCSwapState.REFUNDED;
                return true;
            case SwapCommitStateType.NOT_COMMITED:
                if(this._refundTxId==null && commitStatus.getRefundTxId) this._refundTxId = await commitStatus.getRefundTxId();
                if(this._refundTxId!=null) {
                    this._state = ToBTCSwapState.REFUNDED;
                    return true;
                }
                break;
            case SwapCommitStateType.COMMITED:
                if(this._state!==ToBTCSwapState.COMMITED && this._state!==ToBTCSwapState.REFUNDABLE && this._state!==ToBTCSwapState.SOFT_CLAIMED) {
                    this._state = ToBTCSwapState.COMMITED;
                    return true;
                }
                break;
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save?: boolean): Promise<boolean> {
        switch(this._state) {
            case ToBTCSwapState.CREATED:
                if(this.expiry<Date.now()) {
                    this._state = ToBTCSwapState.QUOTE_SOFT_EXPIRED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                break;
            case ToBTCSwapState.COMMITED:
            case ToBTCSwapState.SOFT_CLAIMED:
                const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data);
                if(expired) {
                    this._state = ToBTCSwapState.REFUNDABLE;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                break;
        }
        return false;
    }
}