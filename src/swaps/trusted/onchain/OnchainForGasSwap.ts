import {SwapType} from "../../../enums/SwapType";
import {ChainType} from "@atomiqlabs/base";
import {PaymentAuthError} from "../../../errors/PaymentAuthError";
import {toBigInt} from "../../../utils/Utils";
import {parsePsbtTransaction, toBitcoinWallet, toOutputScript} from "../../../utils/BitcoinUtils";
import {isISwapInit, ISwap, ISwapInit} from "../../ISwap";
import {
    AddressStatusResponseCodes,
    TrustedIntermediaryAPI
} from "../../../intermediaries/apis/TrustedIntermediaryAPI";
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
} from "../../../bitcoin/wallet/MinimalBitcoinWalletInterface";
import {FeeType} from "../../../enums/FeeType";
import {ppmToPercentage} from "../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../types/TokenAmount";
import {BitcoinTokens, BtcToken, SCToken, Token} from "../../../types/Token";
import {getLogger, LoggerType} from "../../../utils/Logger";
import {timeoutPromise} from "../../../utils/TimeoutUtils";

export enum OnchainForGasSwapState {
    EXPIRED = -3,
    FAILED = -2,
    REFUNDED = -1,
    PR_CREATED = 0,
    FINISHED = 1,
    REFUNDABLE = 2
}

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

export class OnchainForGasSwap<T extends ChainType = ChainType> extends ISwap<T, OnchainForGasSwapTypeDefinition<T>> implements IAddressSwap, IBTCWalletSwap {
    getSmartChainNetworkFee = null;
    protected readonly TYPE: SwapType = SwapType.TRUSTED_FROM_BTC;
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
    scTxId?: string;
    txId?: string;

    //State: REFUNDED
    refundTxId?: string;

    wrapper: OnchainForGasWrapper<T>;

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
            this.state = OnchainForGasSwapState.PR_CREATED;
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

    protected upgradeVersion() {
        if(this.version == null) {
            //Noop
            this.version = 1;
        }
    }

    /**
     * In case swapFee in BTC is not supplied it recalculates it based on swap price
     * @protected
     */
    protected tryRecomputeSwapPrice() {
        if(this.swapFeeBtc==null && this.swapFee!=null) {
            this.swapFeeBtc = this.swapFee * this.getInput().rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }


    //////////////////////////////
    //// Getters & utils

    _getEscrowHash(): string {
        return this.paymentHash;
    }

    getOutputAddress(): string | null {
        return this.recipient;
    }

    getInputAddress(): string | null {
        //TODO: Fuck this, it's not used anyway
        return null;
    }

    getInputTxId(): string | null {
        return this.txId ?? null;
    }

    getOutputTxId(): string | null {
        return this.scTxId ?? null;
    }

    getId(): string {
        return this.paymentHash;
    }

    getAddress(): string {
        return this.address;
    }

    getHyperlink(): string {
        return "bitcoin:"+this.address+"?amount="+encodeURIComponent((Number(this.inputAmount)/100000000).toString(10));
    }

    requiresAction(): boolean {
        return this.state===OnchainForGasSwapState.REFUNDABLE;
    }

    isFinished(): boolean {
        return this.state===OnchainForGasSwapState.FINISHED || this.state===OnchainForGasSwapState.FAILED || this.state===OnchainForGasSwapState.EXPIRED || this.state===OnchainForGasSwapState.REFUNDED;
    }

    isQuoteExpired(): boolean {
        return this.state===OnchainForGasSwapState.EXPIRED;
    }

    isQuoteSoftExpired(): boolean {
        return this.expiry<Date.now();
    }

    isFailed(): boolean {
        return this.state===OnchainForGasSwapState.FAILED;
    }

    isSuccessful(): boolean {
        return this.state===OnchainForGasSwapState.FINISHED;
    }

    verifyQuoteValid(): Promise<boolean> {
        return Promise.resolve(this.expiry>Date.now());
    }


    //////////////////////////////
    //// Amounts & fees

    protected getOutAmountWithoutFee(): bigint {
        return this.outputAmount + (this.swapFee ?? 0n);
    }

    getOutputToken(): SCToken<T["ChainId"]> {
        return this.wrapper.tokens[this.wrapper.chain.getNativeCurrencyAddress()];
    }

    getOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>> {
        return toTokenAmount(
            this.outputAmount, this.wrapper.tokens[this.wrapper.chain.getNativeCurrencyAddress()],
            this.wrapper.prices, this.pricingInfo
        );
    }

    getInputToken(): BtcToken<false> {
        return BitcoinTokens.BTC;
    }

    getInput(): TokenAmount<T["ChainId"], BtcToken<false>> {
        return toTokenAmount(this.inputAmount, BitcoinTokens.BTC, this.wrapper.prices, this.pricingInfo);
    }

    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<false>> {
        return toTokenAmount(
            this.inputAmount - (this.swapFeeBtc ?? 0n), BitcoinTokens.BTC,
            this.wrapper.prices, this.pricingInfo
        );
    }

    protected getSwapFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known!");
        const feeWithoutBaseFee = this.swapFeeBtc==null ? 0n : this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;

        const amountInSrcToken = toTokenAmount(
            this.swapFeeBtc ?? 0n, BitcoinTokens.BTC, this.wrapper.prices, this.pricingInfo
        );
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(
                this.swapFee ?? 0n, this.wrapper.tokens[this.wrapper.chain.getNativeCurrencyAddress()],
                this.wrapper.prices, this.pricingInfo
            ),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, BitcoinTokens.BTC, this.wrapper.prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    getFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> {
        return this.getSwapFee();
    }

    getFeeBreakdown(): [{type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>}] {
        return [{
            type: FeeType.SWAP,
            fee: this.getSwapFee()
        }];
    }

    getRequiredConfirmationsCount(): number {
        return 1;
    }

    /**
     * Returns the PSBT that is already funded with wallet's UTXOs (runs a coin-selection algorithm to choose UTXOs to use),
     *  also returns inputs indices that need to be signed by the wallet before submitting the PSBT back to the SDK with
     *  `swap.submitPsbt()`
     *
     * @param _bitcoinWallet Sender's bitcoin wallet
     * @param feeRate Optional fee rate for the transaction, needs to be at least as big as {minimumBtcFeeRate} field
     * @param additionalOutputs additional outputs to add to the PSBT - can be used to collect fees from users
     */
    async getFundedPsbt(
        _bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface,
        feeRate?: number,
        additionalOutputs?: ({amount: bigint, outputScript: Uint8Array} | {amount: bigint, address: string})[]
    ): Promise<{psbt: Transaction, psbtHex: string, psbtBase64: string, signInputs: number[]}> {
        if(this.state!==OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");

        let bitcoinWallet: IBitcoinWallet;
        if(isIBitcoinWallet(_bitcoinWallet)) {
            bitcoinWallet = _bitcoinWallet;
        } else {
            bitcoinWallet = new SingleAddressBitcoinWallet(this.wrapper.btcRpc, this.wrapper.options.bitcoinNetwork, _bitcoinWallet);
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
            script: toOutputScript(this.wrapper.options.bitcoinNetwork, this.address)
        });
        if(additionalOutputs!=null) additionalOutputs.forEach(output => {
            basePsbt.addOutput({
                amount: output.amount,
                script: (output as {outputScript: Uint8Array}).outputScript ?? toOutputScript(this.wrapper.options.bitcoinNetwork, (output as {address: string}).address)
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
     * Submits a PSBT signed by the wallet back to the SDK
     *
     * @param _psbt A psbt - either a Transaction object or a hex or base64 encoded PSBT string
     */
    async submitPsbt(_psbt: Transaction | string): Promise<string> {
        const psbt = parsePsbtTransaction(_psbt);
        if(this.state!==OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");

        //Ensure not expired
        if(this.expiry<Date.now()) {
            throw new Error("Swap expired!");
        }

        const output0 = psbt.getOutput(0);
        if(output0.amount!==this.outputAmount)
            throw new Error("PSBT output amount invalid, expected: "+this.outputAmount+" got: "+output0.amount);
        const expectedOutputScript = toOutputScript(this.wrapper.options.bitcoinNetwork, this.address);
        if(output0.script==null || !expectedOutputScript.equals(output0.script))
            throw new Error("PSBT output script invalid!");

        if(!psbt.isFinal) psbt.finalize();

        return await this.wrapper.btcRpc.sendRawTransaction(Buffer.from(psbt.toBytes(true, true)).toString("hex"));
    }

    async estimateBitcoinFee(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number): Promise<TokenAmount<any, BtcToken<false>> | null> {
        const bitcoinWallet: IBitcoinWallet = toBitcoinWallet(_bitcoinWallet, this.wrapper.btcRpc, this.wrapper.options.bitcoinNetwork);
        const txFee = await bitcoinWallet.getTransactionFee(this.address, this.inputAmount, feeRate);
        if(txFee==null) return null;
        return toTokenAmount(BigInt(txFee), BitcoinTokens.BTC, this.wrapper.prices, this.pricingInfo);
    }

    async sendBitcoinTransaction(wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner, feeRate?: number): Promise<string> {
        if(this.state!==OnchainForGasSwapState.PR_CREATED)
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

    async txsExecute(options?: {
        bitcoinWallet?: MinimalBitcoinWalletInterface
    }) {
        if(this.state===OnchainForGasSwapState.PR_CREATED) {
            if(!await this.verifyQuoteValid()) throw new Error("Quote already expired or close to expiry!");
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


    //////////////////////////////
    //// Payment

    protected async checkAddress(save: boolean = true): Promise<boolean | null> {
        if(
            this.state===OnchainForGasSwapState.FAILED ||
            this.state===OnchainForGasSwapState.EXPIRED ||
            this.state===OnchainForGasSwapState.REFUNDED
        ) return false;
        if(this.state===OnchainForGasSwapState.FINISHED) return false;
        if(this.url==null) return false;

        const response = await TrustedIntermediaryAPI.getAddressStatus(
            this.url, this.paymentHash, this.sequence, this.wrapper.options.getRequestTimeout
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
                const txStatus = await this.wrapper.chain.getTxIdStatus(response.data.txId);
                if(txStatus==="success") {
                    this.state = OnchainForGasSwapState.FINISHED;
                    this.scTxId = response.data.txId;
                    if(save) await this._saveAndEmit();
                    return true;
                }
                return false;
            case AddressStatusResponseCodes.EXPIRED:
                this.state = OnchainForGasSwapState.EXPIRED;
                if(save) await this._saveAndEmit();
                return true;
            case AddressStatusResponseCodes.REFUNDABLE:
                if(this.state===OnchainForGasSwapState.REFUNDABLE) return null;
                this.state = OnchainForGasSwapState.REFUNDABLE;
                if(save) await this._saveAndEmit();
                return true;
            case AddressStatusResponseCodes.REFUNDED:
                this.state = OnchainForGasSwapState.REFUNDED;
                this.refundTxId = response.data.txId;
                if(save) await this._saveAndEmit();
                return true;
            default:
                this.state = OnchainForGasSwapState.FAILED;
                if(save) await this._saveAndEmit();
                return true;
        }
    }

    protected async setRefundAddress(refundAddress: string): Promise<void> {
        if(this.refundAddress!=null) {
            if(this.refundAddress!==refundAddress) throw new Error("Different refund address already set!");
            return;
        }
        if(this.url==null) throw new Error("LP URL not known, cannot set refund address!");
        await TrustedIntermediaryAPI.setRefundAddress(
            this.url, this.paymentHash, this.sequence, refundAddress, this.wrapper.options.getRequestTimeout
        );
        this.refundAddress = refundAddress;
    }

    /**
     * A blocking promise resolving when payment was received by the intermediary and client can continue
     * rejecting in case of failure
     *
     * @param abortSignal Abort signal
     * @param checkIntervalSeconds How often to poll the intermediary for answer
     * @param updateCallback Callback called when txId is found, and also called with subsequent confirmations
     * @throws {PaymentAuthError} If swap expired or failed
     * @throws {Error} When in invalid state (not PR_CREATED)
     */
    async waitForBitcoinTransaction(
        updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void,
        checkIntervalSeconds: number = 5,
        abortSignal?: AbortSignal
    ): Promise<string> {
        if(this.state!==OnchainForGasSwapState.PR_CREATED) throw new Error("Must be in PR_CREATED state!");

        if(!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }

        while(
            !abortSignal?.aborted &&
            this.state===OnchainForGasSwapState.PR_CREATED
        ) {
            await this.checkAddress(true);
            if(this.txId!=null && updateCallback!=null) {
                const res = await this.wrapper.btcRpc.getTransaction(this.txId);
                if(res==null) {
                    updateCallback();
                } else if(res.confirmations!=null && res.confirmations>0) {
                    updateCallback(res.txid, res.confirmations, 1, 0);
                } else {
                    const delay = await this.wrapper.btcRpc.getConfirmationDelay(res, 1);
                    updateCallback(res.txid, 0, 1, delay ?? undefined);
                }
            }
            if(this.state===OnchainForGasSwapState.PR_CREATED)
                await timeoutPromise(checkIntervalSeconds*1000, abortSignal);
        }

        if(
            (this.state as OnchainForGasSwapState)===OnchainForGasSwapState.REFUNDABLE ||
            (this.state as OnchainForGasSwapState)===OnchainForGasSwapState.REFUNDED
        ) return this.txId!;
        if(this.isQuoteExpired()) throw new PaymentAuthError("Swap expired");
        if(this.isFailed()) throw new PaymentAuthError("Swap failed");
        return this.txId!;
    }

    async waitTillRefunded(
        checkIntervalSeconds?: number,
        abortSignal?: AbortSignal
    ): Promise<void> {
        checkIntervalSeconds ??= 5;
        if(this.state===OnchainForGasSwapState.REFUNDED) return;
        if(this.state!==OnchainForGasSwapState.REFUNDABLE) throw new Error("Must be in REFUNDABLE state!");

        while(
            !abortSignal?.aborted &&
            this.state===OnchainForGasSwapState.REFUNDABLE
        ) {
            await this.checkAddress(true);
            if(this.state===OnchainForGasSwapState.REFUNDABLE)
                await timeoutPromise(checkIntervalSeconds*1000, abortSignal);
        }
        if(this.isQuoteExpired()) throw new PaymentAuthError("Swap expired");
        if(this.isFailed()) throw new PaymentAuthError("Swap failed");
    }

    async requestRefund(refundAddress?: string, abortSignal?: AbortSignal): Promise<void> {
        if(refundAddress!=null) await this.setRefundAddress(refundAddress);
        await this.waitTillRefunded(undefined, abortSignal);
    }


    //////////////////////////////
    //// Storage

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

    _getInitiator(): string {
        return this.recipient;
    }


    //////////////////////////////
    //// Swap ticks & sync

    async _sync(save?: boolean): Promise<boolean> {
        if(this.state===OnchainForGasSwapState.PR_CREATED) {
            //Check if it's maybe already paid
            const result = await this.checkAddress(false);
            if(result) {
                if(save) await this._saveAndEmit();
                return true;
            }
        }
        return false;
    }

    _tick(save?: boolean): Promise<boolean> {
        return Promise.resolve(false);
    }

}
