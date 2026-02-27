import {SwapType} from "../../../enums/SwapType";
import {ChainType} from "@atomiqlabs/base";
import {toBigInt} from "../../../utils/Utils";
import {parsePsbtTransaction, toOutputScript} from "../../../utils/BitcoinUtils";
import {isISwapInit, ISwap, ISwapInit} from "../../ISwap";
import {AddressStatusResponseCodes, TrustedIntermediaryAPI} from "../../../intermediaries/apis/TrustedIntermediaryAPI";
import {OnchainForGasSwapTypeDefinition, OnchainForGasWrapper} from "./OnchainForGasWrapper";
import {Fee} from "../../../types/fees/Fee";
import {IBitcoinWallet, isIBitcoinWallet} from "../../../bitcoin/wallet/IBitcoinWallet";
import {IAddressSwap} from "../../IAddressSwap";
import {IBTCWalletSwap} from "../../IBTCWalletSwap";
import {Transaction} from "@scure/btc-signer";
import {SingleAddressBitcoinWallet} from "../../../bitcoin/wallet/SingleAddressBitcoinWallet";
import {Buffer} from "buffer";
import {
    MinimalBitcoinWalletInterface,
    MinimalBitcoinWalletInterfaceWithSigner
} from "../../../types/wallets/MinimalBitcoinWalletInterface";
import {FeeType} from "../../../enums/FeeType";
import {ppmToPercentage} from "../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../types/TokenAmount";
import {BitcoinTokens, BtcToken, SCToken} from "../../../types/Token";
import {getLogger, LoggerType} from "../../../utils/Logger";
import {timeoutPromise} from "../../../utils/TimeoutUtils";
import {toBitcoinWallet} from "../../../utils/BitcoinWalletUtils";
import {SwapExecutionAction, SwapExecutionActionBitcoin} from "../../../types/SwapExecutionAction";

/**
 * State enum for trusted on-chain gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export enum OnchainForGasSwapState {
    /**
     * The swap quote expired without user sending in the BTC
     */
    EXPIRED = -3,
    /**
     * The swap has failed after the intermediary already received the BTC on the source chain
     */
    FAILED = -2,
    /**
     * Swap was refunded and BTC returned to the user's refund address
     */
    REFUNDED = -1,
    /**
     * Swap was created, send the BTC to the swap address
     */
    PR_CREATED = 0,
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    FINISHED = 1,
    /**
     * Swap is refundable because the intermediary cannot honor the swap request on the destination chain
     */
    REFUNDABLE = 2
}

const OnchainForGasSwapStateDescription: Record<OnchainForGasSwapState, string> = {
    [OnchainForGasSwapState.EXPIRED]:
        "The swap quote expired without user sending in the BTC",
    [OnchainForGasSwapState.FAILED]:
        "The swap has failed after the intermediary already received the BTC on the source chain",
    [OnchainForGasSwapState.REFUNDED]:
        "Swap was refunded and BTC returned to the user's refund address",
    [OnchainForGasSwapState.PR_CREATED]:
        "Swap was created, send the BTC to the swap address",
    [OnchainForGasSwapState.FINISHED]:
        "The swap is finished after the intermediary sent funds on the destination chain",
    [OnchainForGasSwapState.REFUNDABLE]:
        "Swap is refundable because the intermediary cannot honor the swap request on the destination chain",
};

export type OnchainForGasSwapInit = ISwapInit & {
    paymentHash: string;
    sequence: bigint;
    address: string;
    inputAmount: bigint;
    outputAmount: bigint;
    recipient: string;
    token: string;
    refundAddress?: string;
};

export function isOnchainForGasSwapInit(obj: any): obj is OnchainForGasSwapInit {
    return typeof(obj.paymentHash)==="string" &&
        typeof(obj.sequence)==="bigint" &&
        typeof(obj.address)==="string" &&
        typeof(obj.inputAmount)==="bigint" &&
        typeof(obj.outputAmount)==="bigint" &&
        typeof(obj.recipient)==="string" &&
        typeof(obj.token)==="string" &&
        (obj.refundAddress==null || typeof(obj.refundAddress)==="string") &&
        isISwapInit(obj);
}

/**
 * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the
 *  destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export class OnchainForGasSwap<T extends ChainType = ChainType> extends ISwap<T, OnchainForGasSwapTypeDefinition<T>, OnchainForGasSwapState> implements IAddressSwap, IBTCWalletSwap {
    protected readonly TYPE: SwapType.TRUSTED_FROM_BTC = SwapType.TRUSTED_FROM_BTC;

    /**
     * @internal
     */
    protected readonly swapStateDescription = OnchainForGasSwapStateDescription;
    /**
     * @internal
     */
    protected readonly swapStateName = (state: number) => OnchainForGasSwapState[state];

    /**
     * @internal
     */
    protected readonly logger: LoggerType;

    //State: PR_CREATED
    private readonly paymentHash: string;
    private readonly sequence: bigint;
    private readonly address: string;
    private readonly recipient: string;
    private readonly token: string;
    private inputAmount: bigint;
    private outputAmount: bigint;
    private refundAddress?: string;

    //State: FINISHED
    /**
     * Destination transaction ID on the smart chain side
     * @private
     */
    private scTxId?: string;
    /**
     * Source transaction ID on the source (bitcoin) side
     * @private
     */
    private txId?: string;

    //State: REFUNDED
    /**
     * Transaction ID on the source (bitcoin) side used for refunding the funds back to the user
     * @private
     */
    private refundTxId?: string;

    /**
     * @internal
     */
    protected readonly wrapper: OnchainForGasWrapper<T>;

    constructor(wrapper: OnchainForGasWrapper<T>, init: OnchainForGasSwapInit);
    constructor(wrapper: OnchainForGasWrapper<T>, obj: any);
    constructor(
        wrapper: OnchainForGasWrapper<T>,
        initOrObj: OnchainForGasSwapInit | any
    ) {
        if(isOnchainForGasSwapInit(initOrObj) && initOrObj.url!=null) initOrObj.url += "/frombtc_trusted";
        super(wrapper, initOrObj);
        this.wrapper = wrapper;
        if(isOnchainForGasSwapInit(initOrObj)) {
            this.paymentHash = initOrObj.paymentHash;
            this.sequence = initOrObj.sequence;
            this.address = initOrObj.address;
            this.inputAmount = initOrObj.inputAmount;
            this.outputAmount = initOrObj.outputAmount;
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.refundAddress = initOrObj.refundAddress;
            this._state = OnchainForGasSwapState.PR_CREATED;
        } else {
            this.paymentHash = initOrObj.paymentHash;
            this.sequence = toBigInt(initOrObj.sequence);
            this.address = initOrObj.address;
            this.inputAmount = toBigInt(initOrObj.inputAmount);
            this.outputAmount = toBigInt(initOrObj.outputAmount);
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.refundAddress = initOrObj.refundAddress;
            this.scTxId = initOrObj.scTxId;
            this.txId = initOrObj.txId;
            this.refundTxId = initOrObj.refundTxId;
        }
        this.logger = getLogger("OnchainForGas("+this.getId()+"): ");
        this.tryRecomputeSwapPrice();
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion() {
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
        return this.paymentHash;
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
        //TODO: Fuck this, it's not used anyway
        return null;
    }

    /**
     * @inheritDoc
     */
    getInputTxId(): string | null {
        return this.txId ?? null;
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
        return this.paymentHash;
    }

    /**
     * @inheritDoc
     */
    getAddress(): string {
        return this.address;
    }

    /**
     * @inheritDoc
     */
    getHyperlink(): string {
        return "bitcoin:"+this.address+"?amount="+encodeURIComponent((Number(this.inputAmount)/100000000).toString(10));
    }

    /**
     * @inheritDoc
     */
    requiresAction(): boolean {
        return this._state===OnchainForGasSwapState.REFUNDABLE;
    }

    /**
     * @inheritDoc
     */
    isFinished(): boolean {
        return this._state===OnchainForGasSwapState.FINISHED || this._state===OnchainForGasSwapState.FAILED || this._state===OnchainForGasSwapState.EXPIRED || this._state===OnchainForGasSwapState.REFUNDED;
    }

    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean {
        return this._state===OnchainForGasSwapState.EXPIRED;
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
        return this._state===OnchainForGasSwapState.FAILED;
    }

    /**
     * @inheritDoc
     */
    isSuccessful(): boolean {
        return this._state===OnchainForGasSwapState.FINISHED;
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
    getOutput(): TokenAmount<SCToken<T["ChainId"]>, true> {
        return toTokenAmount(
            this.outputAmount, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()],
            this.wrapper._prices, this.pricingInfo
        );
    }

    /**
     * @inheritDoc
     */
    getInputToken(): BtcToken<false> {
        return BitcoinTokens.BTC;
    }

    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<BtcToken<false>, true> {
        return toTokenAmount(this.inputAmount, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<BtcToken<false>, true> {
        return toTokenAmount(
            this.inputAmount - (this.swapFeeBtc ?? 0n), BitcoinTokens.BTC,
            this.wrapper._prices, this.pricingInfo
        );
    }

    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known!");
        const feeWithoutBaseFee = this.swapFeeBtc==null ? 0n : this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;

        const amountInSrcToken = toTokenAmount(
            this.swapFeeBtc ?? 0n, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo
        );
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(
                this.swapFee ?? 0n, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()],
                this.wrapper._prices, this.pricingInfo
            ),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> {
        return this.getSwapFee();
    }

    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [{type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>}] {
        return [{
            type: FeeType.SWAP,
            fee: this.getSwapFee()
        }];
    }

    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount(): number {
        return 1;
    }

    /**
     * @inheritDoc
     */
    async getFundedPsbt(
        _bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface,
        feeRate?: number,
        additionalOutputs?: ({amount: bigint, outputScript: Uint8Array} | {amount: bigint, address: string})[]
    ): Promise<{psbt: Transaction, psbtHex: string, psbtBase64: string, signInputs: number[]}> {
        if(this._state!==OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");

        let bitcoinWallet: IBitcoinWallet;
        if(isIBitcoinWallet(_bitcoinWallet)) {
            bitcoinWallet = _bitcoinWallet;
        } else {
            bitcoinWallet = new SingleAddressBitcoinWallet(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, _bitcoinWallet);
        }
        //TODO: Maybe re-introduce fee rate check here if passed from the user
        if(feeRate==null) {
            feeRate = await bitcoinWallet.getFeeRate();
        }

        const basePsbt = new Transaction({
            allowUnknownOutputs: true,
            allowLegacyWitnessUtxo: true
        });
        basePsbt.addOutput({
            amount: this.outputAmount,
            script: toOutputScript(this.wrapper._options.bitcoinNetwork, this.address)
        });
        if(additionalOutputs!=null) additionalOutputs.forEach(output => {
            basePsbt.addOutput({
                amount: output.amount,
                script: (output as {outputScript: Uint8Array}).outputScript ?? toOutputScript(this.wrapper._options.bitcoinNetwork, (output as {address: string}).address)
            });
        });

        const psbt = await bitcoinWallet.fundPsbt(basePsbt, feeRate);
        //Sign every input
        const signInputs: number[] = [];
        for(let i=0;i<psbt.inputsLength;i++) {
            signInputs.push(i);
        }
        const serializedPsbt = Buffer.from(psbt.toPSBT());
        return {
            psbt,
            psbtHex: serializedPsbt.toString("hex"),
            psbtBase64: serializedPsbt.toString("base64"),
            signInputs
        };
    }

    /**
     * @inheritDoc
     */
    async submitPsbt(_psbt: Transaction | string): Promise<string> {
        const psbt = parsePsbtTransaction(_psbt);
        if(this._state!==OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");

        //Ensure not expired
        if(this.expiry<Date.now()) {
            throw new Error("Swap expired!");
        }

        const output0 = psbt.getOutput(0);
        if(output0.amount!==this.outputAmount)
            throw new Error("PSBT output amount invalid, expected: "+this.outputAmount+" got: "+output0.amount);
        const expectedOutputScript = toOutputScript(this.wrapper._options.bitcoinNetwork, this.address);
        if(output0.script==null || !expectedOutputScript.equals(output0.script))
            throw new Error("PSBT output script invalid!");

        if(!psbt.isFinal) psbt.finalize();

        return await this.wrapper._btcRpc.sendRawTransaction(Buffer.from(psbt.toBytes(true, true)).toString("hex"));
    }

    /**
     * @inheritDoc
     */
    async estimateBitcoinFee(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number): Promise<TokenAmount<BtcToken<false>, true> | null> {
        const bitcoinWallet: IBitcoinWallet = toBitcoinWallet(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const txFee = await bitcoinWallet.getTransactionFee(this.address, this.inputAmount, feeRate);
        if(txFee==null) return null;
        return toTokenAmount(BigInt(txFee), BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    async sendBitcoinTransaction(wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner, feeRate?: number): Promise<string> {
        if(this._state!==OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");

        //Ensure not expired
        if(this.expiry<Date.now()) {
            throw new Error("Swap expired!");
        }

        if(isIBitcoinWallet(wallet)) {
            return await wallet.sendTransaction(this.address, this.inputAmount, feeRate);
        } else {
            const {psbt, psbtHex, psbtBase64, signInputs} = await this.getFundedPsbt(wallet, feeRate);
            const signedPsbt = await wallet.signPsbt({
                psbt, psbtHex, psbtBase64
            }, signInputs);
            return await this.submitPsbt(signedPsbt);
        }
    }

    /**
     * @inheritDoc
     *
     * @param options.bitcoinWallet Optional bitcoin wallet address specification to return a funded PSBT,
     *  if not provided an address is returned instead.
     */
    async txsExecute(options?: {
        bitcoinWallet?: MinimalBitcoinWalletInterface
    }): Promise<[
        SwapExecutionActionBitcoin<"ADDRESS" | "FUNDED_PSBT">
    ]> {
        if(this._state===OnchainForGasSwapState.PR_CREATED) {
            if(!await this._verifyQuoteValid()) throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment" as const,
                    description: "Send funds to the bitcoin swap address",
                    chain: "BITCOIN",
                    txs: [
                        options?.bitcoinWallet==null ? {
                            address: this.address,
                            amount: Number(this.inputAmount),
                            hyperlink: this.getHyperlink(),
                            type: "ADDRESS"
                        } : {
                            ...await this.getFundedPsbt(options.bitcoinWallet),
                            type: "FUNDED_PSBT"
                        }
                    ]
                }
            ];
        }

        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED or CLAIM_COMMITED");
    }

    /**
     * @inheritDoc
     *
     * @param options.bitcoinWallet Optional bitcoin wallet address specification to return a funded PSBT,
     *  if not provided an address is returned instead.
     */
    async getCurrentActions(options?: {
        bitcoinWallet?: MinimalBitcoinWalletInterface
    }): Promise<SwapExecutionAction<T>[]> {
        try {
            return await this.txsExecute(options);
        } catch (e) {
            return [];
        }
    }

    //////////////////////////////
    //// Payment

    /**
     * Queries the intermediary (LP) node for the state of the swap
     *
     * @param save Whether the save the result or not
     *
     * @returns Whether the swap was successful as `boolean` or `null` if the swap is still pending
     * @internal
     */
    protected async checkAddress(save: boolean = true): Promise<boolean | null> {
        if(
            this._state===OnchainForGasSwapState.FAILED ||
            this._state===OnchainForGasSwapState.EXPIRED ||
            this._state===OnchainForGasSwapState.REFUNDED
        ) return false;
        if(this._state===OnchainForGasSwapState.FINISHED) return false;
        if(this.url==null) return false;

        const response = await TrustedIntermediaryAPI.getAddressStatus(
            this.url, this.paymentHash, this.sequence, this.wrapper._options.getRequestTimeout
        );
        switch(response.code) {
            case AddressStatusResponseCodes.AWAIT_PAYMENT:
                if(this.txId!=null) {
                    this.txId = undefined;
                    if(save) await this._save();
                    return true;
                }
                return false;
            case AddressStatusResponseCodes.AWAIT_CONFIRMATION:
            case AddressStatusResponseCodes.PENDING:
            case AddressStatusResponseCodes.TX_SENT:
                const inputAmount = BigInt(response.data.adjustedAmount);
                const outputAmount = BigInt(response.data.adjustedTotal);
                const adjustedFee = response.data.adjustedFee==null ? null : BigInt(response.data.adjustedFee);
                const adjustedFeeSats = response.data.adjustedFeeSats==null ? null : BigInt(response.data.adjustedFeeSats);
                const txId = response.data.txId;
                if(
                    this.txId!=txId ||
                    this.inputAmount !== inputAmount ||
                    this.outputAmount !== outputAmount
                ) {
                    this.txId = txId;
                    this.inputAmount = inputAmount;
                    this.outputAmount = outputAmount;
                    if(adjustedFee!=null) this.swapFee = adjustedFee;
                    if(adjustedFeeSats!=null) this.swapFeeBtc = adjustedFeeSats;
                    if(save) await this._save();
                    return true;
                }
                return false;
            case AddressStatusResponseCodes.PAID:
                const txStatus = await this.wrapper._chain.getTxIdStatus(response.data.txId);
                if(txStatus==="success") {
                    this._state = OnchainForGasSwapState.FINISHED;
                    this.scTxId = response.data.txId;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                return false;
            case AddressStatusResponseCodes.EXPIRED:
                this._state = OnchainForGasSwapState.EXPIRED;
                if(save) await this._saveAndEmit();
                return true;
            case AddressStatusResponseCodes.REFUNDABLE:
                if(this._state===OnchainForGasSwapState.REFUNDABLE) return null;
                this._state = OnchainForGasSwapState.REFUNDABLE;
                if(save) await this._saveAndEmit();
                return true;
            case AddressStatusResponseCodes.REFUNDED:
                this._state = OnchainForGasSwapState.REFUNDED;
                this.refundTxId = response.data.txId;
                if(save) await this._saveAndEmit();
                return true;
            default:
                this._state = OnchainForGasSwapState.FAILED;
                if(save) await this._saveAndEmit();
                return true;
        }
    }

    /**
     * Sets the bitcoin address used for possible refunds in case something goes wrong with the swap
     *
     * @param refundAddress Bitcoin address to receive the refund to
     * @internal
     */
    protected async setRefundAddress(refundAddress: string): Promise<void> {
        if(this.refundAddress!=null) {
            if(this.refundAddress!==refundAddress) throw new Error("Different refund address already set!");
            return;
        }
        if(this.url==null) throw new Error("LP URL not known, cannot set refund address!");
        await TrustedIntermediaryAPI.setRefundAddress(
            this.url, this.paymentHash, this.sequence, refundAddress, this.wrapper._options.getRequestTimeout
        );
        this.refundAddress = refundAddress;
    }

    /**
     * @inheritDoc
     */
    async waitForBitcoinTransaction(
        updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void,
        checkIntervalSeconds: number = 5,
        abortSignal?: AbortSignal
    ): Promise<string> {
        if(this._state!==OnchainForGasSwapState.PR_CREATED) throw new Error("Must be in PR_CREATED state!");

        if(!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }

        while(
            !abortSignal?.aborted &&
            this._state===OnchainForGasSwapState.PR_CREATED
        ) {
            await this.checkAddress(true);
            if(this.txId!=null && updateCallback!=null) {
                const res = await this.wrapper._btcRpc.getTransaction(this.txId);
                if(res==null) {
                    updateCallback();
                } else if(res.confirmations!=null && res.confirmations>0) {
                    updateCallback(res.txid, res.confirmations, 1, 0);
                } else {
                    const delay = await this.wrapper._btcRpc.getConfirmationDelay(res, 1);
                    updateCallback(res.txid, 0, 1, delay ?? undefined);
                }
            }
            if(this._state===OnchainForGasSwapState.PR_CREATED)
                await timeoutPromise(checkIntervalSeconds*1000, abortSignal);
        }

        if(
            (this._state as OnchainForGasSwapState)===OnchainForGasSwapState.REFUNDABLE ||
            (this._state as OnchainForGasSwapState)===OnchainForGasSwapState.REFUNDED
        ) return this.txId!;
        if(this.isQuoteExpired()) throw new Error("Swap expired");
        if(this.isFailed()) throw new Error("Swap failed");
        return this.txId!;
    }

    /**
     * Waits till the LP processes a refund for a failed swap. The swap must be in
     *  {@link OnchainForGasSwapState.REFUNDABLE} state
     *
     * @param checkIntervalSeconds How often to check (default 5 seconds)
     * @param abortSignal Abort signal
     */
    async waitTillRefunded(
        checkIntervalSeconds?: number,
        abortSignal?: AbortSignal
    ): Promise<void> {
        checkIntervalSeconds ??= 5;
        if(this._state===OnchainForGasSwapState.REFUNDED) return;
        if(this._state!==OnchainForGasSwapState.REFUNDABLE) throw new Error("Must be in REFUNDABLE state!");

        while(
            !abortSignal?.aborted &&
            this._state===OnchainForGasSwapState.REFUNDABLE
        ) {
            await this.checkAddress(true);
            if(this._state===OnchainForGasSwapState.REFUNDABLE)
                await timeoutPromise(checkIntervalSeconds*1000, abortSignal);
        }
        if(this.isQuoteExpired()) throw new Error("Swap expired");
        if(this.isFailed()) throw new Error("Swap failed");
    }

    /**
     * Requests a refund after the swap failed, this also waits till the refund is actually sent by the
     *  intermediary (LP). The swap must be in {@link OnchainForGasSwapState.REFUNDABLE} state
     *
     * @param refundAddress Bitcoin address to receive the refund to
     * @param abortSignal Abort signal
     */
    async requestRefund(refundAddress?: string, abortSignal?: AbortSignal): Promise<void> {
        if(refundAddress!=null) await this.setRefundAddress(refundAddress);
        await this.waitTillRefunded(undefined, abortSignal);
    }


    //////////////////////////////
    //// Storage

    /**
     * @inheritDoc
     */
    serialize(): any{
        return {
            ...super.serialize(),
            paymentHash: this.paymentHash,
            sequence: this.sequence==null ? null : this.sequence.toString(10),
            address: this.address,
            inputAmount: this.inputAmount==null ? null : this.inputAmount.toString(10),
            outputAmount: this.outputAmount==null ? null : this.outputAmount.toString(10),
            recipient: this.recipient,
            token: this.token,
            refundAddress: this.refundAddress,
            scTxId: this.scTxId,
            txId: this.txId,
            refundTxId: this.refundTxId,
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
        if(this._state===OnchainForGasSwapState.PR_CREATED) {
            //Check if it's maybe already paid
            const result = await this.checkAddress(false);
            if(result) {
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
