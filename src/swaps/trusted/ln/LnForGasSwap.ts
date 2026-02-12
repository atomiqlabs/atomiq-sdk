import {decode as bolt11Decode} from "@atomiqlabs/bolt11";
import {SwapType} from "../../../enums/SwapType";
import {ChainType} from "@atomiqlabs/base";
import {LnForGasSwapTypeDefinition, LnForGasWrapper} from "./LnForGasWrapper";
import {toBigInt} from "../../../utils/Utils";
import {isISwapInit, ISwap, ISwapInit} from "../../ISwap";
import {InvoiceStatusResponseCodes, TrustedIntermediaryAPI} from "../../../intermediaries/apis/TrustedIntermediaryAPI";
import {Fee} from "../../../types/fees/Fee";
import {IAddressSwap} from "../../IAddressSwap";
import {FeeType} from "../../../enums/FeeType";
import {ppmToPercentage} from "../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../types/TokenAmount";
import {BitcoinTokens, BtcToken, SCToken} from "../../../types/Token";
import {getLogger, LoggerType} from "../../../utils/Logger";
import {timeoutPromise} from "../../../utils/TimeoutUtils";
import {SwapExecutionActionLightning} from "../../../types/SwapExecutionAction";

/**
 * State enum for trusted Lightning gas swaps
 *
 * @category Swaps
 */
export enum LnForGasSwapState {
    /**
     * The swap quote expired without user sending in the lightning network payment
     */
    EXPIRED = -2,
    /**
     * The swap has failed after the intermediary already received a lightning network payment on the source
     */
    FAILED = -1,
    /**
     * Swap was created
     */
    PR_CREATED = 0,
    /**
     * User paid the lightning network invoice on the source
     */
    PR_PAID = 1,
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    FINISHED = 2
}

export type LnForGasSwapInit = ISwapInit & {
    pr: string;
    outputAmount: bigint;
    recipient: string;
    token: string;
};

export function isLnForGasSwapInit(obj: any): obj is LnForGasSwapInit {
    return typeof(obj.pr)==="string" &&
        typeof(obj.outputAmount) === "bigint" &&
        typeof(obj.recipient)==="string" &&
        typeof(obj.token)==="string" &&
        isISwapInit(obj);
}

/**
 * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on
 *  the destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps
 */
export class LnForGasSwap<T extends ChainType = ChainType> extends ISwap<T, LnForGasSwapTypeDefinition<T>, LnForGasSwapState> implements IAddressSwap {
    protected readonly TYPE: SwapType.TRUSTED_FROM_BTCLN = SwapType.TRUSTED_FROM_BTCLN;
    /**
     * @internal
     */
    protected readonly currentVersion: number = 2;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;

    //State: PR_CREATED
    private readonly pr: string;
    private readonly outputAmount: bigint;
    private readonly recipient: string;
    private readonly token: string;

    //State: FINISHED
    /**
     * Destination transaction ID on the smart chain side
     * @private
     */
    private scTxId?: string;

    constructor(wrapper: LnForGasWrapper<T>, init: LnForGasSwapInit);
    constructor(wrapper: LnForGasWrapper<T>, obj: any);
    constructor(
        wrapper: LnForGasWrapper<T>,
        initOrObj: LnForGasSwapInit | any
    ) {
        if(isLnForGasSwapInit(initOrObj) && initOrObj.url!=null) initOrObj.url += "/lnforgas";
        super(wrapper, initOrObj);
        if(isLnForGasSwapInit(initOrObj)) {
            this.pr = initOrObj.pr;
            this.outputAmount = initOrObj.outputAmount;
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this._state = LnForGasSwapState.PR_CREATED;
        } else {
            this.pr = initOrObj.pr;
            this.outputAmount = toBigInt(initOrObj.outputAmount);
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.scTxId = initOrObj.scTxId;
        }
        this.tryRecomputeSwapPrice();
        if(this.pr!=null) {
            const decoded = bolt11Decode(this.pr);
            if(decoded.timeExpireDate!=null) this.expiry = decoded.timeExpireDate*1000;
        }
        this.logger = getLogger("LnForGas("+this.getId()+"): ");
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion() {
        if(this.version == 1) {
            if(this._state===1) this._state = LnForGasSwapState.FINISHED;
            this.version = 2;
        }
        if(this.version == null) {
            //Noop
            this.version = 1;
        }
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected tryRecomputeSwapPrice() {
        if(this.swapFeeBtc==null && this.swapFee!=null) {
            this.swapFeeBtc = this.swapFee * this.getInput().rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash(): string {
        return this.getId();
    }

    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null {
        return this.recipient;
    }

    /**
     * @inheritDoc
     */
    getInputAddress(): string | null {
        return this.pr;
    }

    /**
     * @inheritDoc
     */
    getInputTxId(): string | null {
        return this.getId();
    }

    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null {
        return this.scTxId ?? null;
    }

    /**
     * @inheritDoc
     */
    getId(): string {
        if(this.pr==null) throw new Error("No payment request assigned to this swap!");
        const decodedPR = bolt11Decode(this.pr);
        if(decodedPR.tagsObject.payment_hash==null) throw new Error("Lightning invoice has no payment hash!");
        return decodedPR.tagsObject.payment_hash;
    }

    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress(): string {
        return this.pr;
    }

    /**
     * Returns a string that can be displayed as QR code representation of the lightning invoice (with lightning: prefix)
     */
    getHyperlink(): string {
        return "lightning:"+this.pr.toUpperCase();
    }

    /**
     * @inheritDoc
     */
    requiresAction(): boolean {
        return false;
    }

    /**
     * @inheritDoc
     */
    isFinished(): boolean {
        return this._state===LnForGasSwapState.FINISHED || this._state===LnForGasSwapState.FAILED || this._state===LnForGasSwapState.EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean {
        return this._state===LnForGasSwapState.EXPIRED;
    }

    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean {
        return this.expiry<Date.now();
    }

    /**
     * @inheritDoc
     */
    isFailed(): boolean {
        return this._state===LnForGasSwapState.FAILED;
    }

    /**
     * @inheritDoc
     */
    isSuccessful(): boolean {
        return this._state===LnForGasSwapState.FINISHED;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteDefinitelyExpired(): Promise<boolean> {
        return Promise.resolve(this.expiry<Date.now());
    }

    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteValid(): Promise<boolean> {
        return Promise.resolve(this.expiry>Date.now());
    }

    //////////////////////////////
    //// Amounts & fees

    /**
     * Returns an output amount in base units without a swap fee included, hence this value
     *  is larger than the actual output amount
     *
     * @internal
     */
    protected getOutAmountWithoutFee(): bigint {
        return this.outputAmount + (this.swapFee ?? 0n);
    }

    /**
     * @inheritDoc
     */
    getOutputToken(): SCToken<T["ChainId"]> {
        return this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()];
    }

    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(
            this.outputAmount, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()],
            this.wrapper._prices, this.pricingInfo
        );
    }

    /**
     * @inheritDoc
     */
    getInputToken(): BtcToken<true> {
        return BitcoinTokens.BTCLN;
    }

    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<true>, true> {
        const parsed = bolt11Decode(this.pr);
        const msats = parsed.millisatoshis;
        if(msats==null) throw new Error("Swap lightning invoice has no msat amount field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        return toTokenAmount(amount, BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<true>, true> {
        const parsed = bolt11Decode(this.pr);
        const msats = parsed.millisatoshis;
        if(msats==null) throw new Error("Swap lightning invoice has no msat amount field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        return toTokenAmount(
            amount - (this.swapFeeBtc ?? 0n), BitcoinTokens.BTCLN,
            this.wrapper._prices, this.pricingInfo
        );
    }

    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate swap fee!");
        const feeWithoutBaseFee = this.swapFeeBtc==null ? 0n : this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;

        const amountInSrcToken = toTokenAmount(this.swapFeeBtc ?? 0n, BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(this.swapFee ?? 0n, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>> {
        return this.getSwapFee();
    }

    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [{type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>}] {
        return [{
            type: FeeType.SWAP,
            fee: this.getSwapFee()
        }];
    }


    //////////////////////////////
    //// Payment

    /**
     * @inheritDoc
     */
    async txsExecute(): Promise<[SwapExecutionActionLightning]> {
        if(this._state===LnForGasSwapState.PR_CREATED) {
            if (!await this._verifyQuoteValid()) throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment" as const,
                    description: "Initiates the swap by paying up the lightning network invoice",
                    chain: "LIGHTNING",
                    txs: [
                        {
                            type: "BOLT11_PAYMENT_REQUEST",
                            address: this.pr,
                            hyperlink: this.getHyperlink()
                        }
                    ]
                }
            ];
        }

        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED");
    }

    /**
     * Queries the intermediary (LP) node for the state of the swap
     *
     * @param save Whether the save the result or not
     *
     * @returns Whether the swap was successful as `boolean` or `null` if the swap is still pending
     * @internal
     */
    protected async checkInvoicePaid(save: boolean = true): Promise<boolean | null> {
        if(this._state===LnForGasSwapState.FAILED || this._state===LnForGasSwapState.EXPIRED) return false;
        if(this._state===LnForGasSwapState.FINISHED) return true;
        if(this.url==null) return false;

        const decodedPR = bolt11Decode(this.pr);
        const paymentHash = decodedPR.tagsObject.payment_hash;
        if(paymentHash==null) throw new Error("Invalid swap invoice, payment hash not found!");

        const response = await TrustedIntermediaryAPI.getInvoiceStatus(
            this.url, paymentHash, this.wrapper._options.getRequestTimeout
        );
        this.logger.debug("checkInvoicePaid(): LP response: ", response);
        switch(response.code) {
            case InvoiceStatusResponseCodes.PAID:
                this.scTxId = response.data.txId;
                const txStatus = await this.wrapper._chain.getTxIdStatus(this.scTxId);
                if(txStatus==="success") {
                    this._state = LnForGasSwapState.FINISHED;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                return null;
            case InvoiceStatusResponseCodes.EXPIRED:
                if(this._state===LnForGasSwapState.PR_CREATED) {
                    this._state = LnForGasSwapState.EXPIRED;
                } else {
                    this._state = LnForGasSwapState.FAILED;
                }
                if(save) await this._saveAndEmit();
                return false;
            case InvoiceStatusResponseCodes.TX_SENT:
                this.scTxId = response.data.txId;
                if(this._state===LnForGasSwapState.PR_CREATED) {
                    this._state = LnForGasSwapState.PR_PAID;
                    if(save) await this._saveAndEmit();
                }
                return null;
            case InvoiceStatusResponseCodes.PENDING:
                if(this._state===LnForGasSwapState.PR_CREATED) {
                    this._state = LnForGasSwapState.PR_PAID;
                    if(save) await this._saveAndEmit();
                }
                return null;
            case InvoiceStatusResponseCodes.AWAIT_PAYMENT:
                return null;
            default:
                this._state = LnForGasSwapState.FAILED;
                if(save) await this._saveAndEmit();
                return false;
        }
    }

    /**
     * A blocking promise resolving when payment was received by the intermediary and client can continue,
     *  rejecting in case of failure. The swap must be in {@link LnForGasSwapState.PR_CREATED} state!
     *
     * @param checkIntervalSeconds How often to poll the intermediary for answer (default 5 seconds)
     * @param abortSignal Abort signal
     * @throws {Error} When in invalid state (not PR_CREATED)
     */
    async waitForPayment(checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean> {
        if(this._state!==LnForGasSwapState.PR_CREATED) throw new Error("Must be in PR_CREATED state!");

        if(!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }

        while(!abortSignal?.aborted && (this._state===LnForGasSwapState.PR_CREATED || this._state===LnForGasSwapState.PR_PAID)) {
            await this.checkInvoicePaid(true);
            if(this._state===LnForGasSwapState.PR_CREATED || this._state===LnForGasSwapState.PR_PAID) await timeoutPromise((checkIntervalSeconds ?? 5)*1000, abortSignal);
        }

        if(this.isFailed()) throw new Error("Swap failed");
        return !this.isQuoteExpired();

    }


    //////////////////////////////
    //// Storage

    /**
     * @inheritDoc
     */
    serialize(): any{
        return {
            ...super.serialize(),
            pr: this.pr,
            outputAmount: this.outputAmount==null ? null : this.outputAmount.toString(10),
            recipient: this.recipient,
            token: this.token,
            scTxId: this.scTxId
        };
    }

    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string {
        return this.recipient;
    }


    //////////////////////////////
    //// Swap ticks & sync

    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save?: boolean): Promise<boolean> {
        if(this._state===LnForGasSwapState.PR_CREATED) {
            //Check if it's maybe already paid
            const res = await this.checkInvoicePaid(false);
            if(res!==null) {
                if(save) await this._saveAndEmit();
                return true;
            }
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    _tick(save?: boolean): Promise<boolean> {
        return Promise.resolve(false);
    }

}