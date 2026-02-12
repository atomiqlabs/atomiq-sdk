"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnchainForGasSwap = exports.isOnchainForGasSwapInit = exports.OnchainForGasSwapState = void 0;
const SwapType_1 = require("../../../enums/SwapType");
const Utils_1 = require("../../../utils/Utils");
const BitcoinUtils_1 = require("../../../utils/BitcoinUtils");
const ISwap_1 = require("../../ISwap");
const TrustedIntermediaryAPI_1 = require("../../../intermediaries/apis/TrustedIntermediaryAPI");
const IBitcoinWallet_1 = require("../../../bitcoin/wallet/IBitcoinWallet");
const btc_signer_1 = require("@scure/btc-signer");
const SingleAddressBitcoinWallet_1 = require("../../../bitcoin/wallet/SingleAddressBitcoinWallet");
const buffer_1 = require("buffer");
const FeeType_1 = require("../../../enums/FeeType");
const PercentagePPM_1 = require("../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../types/TokenAmount");
const Token_1 = require("../../../types/Token");
const Logger_1 = require("../../../utils/Logger");
const TimeoutUtils_1 = require("../../../utils/TimeoutUtils");
const BitcoinWalletUtils_1 = require("../../../utils/BitcoinWalletUtils");
/**
 * State enum for trusted on-chain gas swaps
 *
 * @category Swaps
 */
var OnchainForGasSwapState;
(function (OnchainForGasSwapState) {
    /**
     * The swap quote expired without user sending in the BTC
     */
    OnchainForGasSwapState[OnchainForGasSwapState["EXPIRED"] = -3] = "EXPIRED";
    /**
     * The swap has failed after the intermediary already received the BTC on the source chain
     */
    OnchainForGasSwapState[OnchainForGasSwapState["FAILED"] = -2] = "FAILED";
    /**
     * Swap was refunded and BTC returned to the user's refund address
     */
    OnchainForGasSwapState[OnchainForGasSwapState["REFUNDED"] = -1] = "REFUNDED";
    /**
     * Swap was created
     */
    OnchainForGasSwapState[OnchainForGasSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    OnchainForGasSwapState[OnchainForGasSwapState["FINISHED"] = 1] = "FINISHED";
    /**
     * Swap is refundable because the intermediary cannot honor the swap request on the destination chain
     */
    OnchainForGasSwapState[OnchainForGasSwapState["REFUNDABLE"] = 2] = "REFUNDABLE";
})(OnchainForGasSwapState = exports.OnchainForGasSwapState || (exports.OnchainForGasSwapState = {}));
function isOnchainForGasSwapInit(obj) {
    return typeof (obj.paymentHash) === "string" &&
        typeof (obj.sequence) === "bigint" &&
        typeof (obj.address) === "string" &&
        typeof (obj.inputAmount) === "bigint" &&
        typeof (obj.outputAmount) === "bigint" &&
        typeof (obj.recipient) === "string" &&
        typeof (obj.token) === "string" &&
        (obj.refundAddress == null || typeof (obj.refundAddress) === "string") &&
        (0, ISwap_1.isISwapInit)(obj);
}
exports.isOnchainForGasSwapInit = isOnchainForGasSwapInit;
/**
 * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the
 *  destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps
 */
class OnchainForGasSwap extends ISwap_1.ISwap {
    constructor(wrapper, initOrObj) {
        if (isOnchainForGasSwapInit(initOrObj) && initOrObj.url != null)
            initOrObj.url += "/frombtc_trusted";
        super(wrapper, initOrObj);
        this.TYPE = SwapType_1.SwapType.TRUSTED_FROM_BTC;
        this.wrapper = wrapper;
        if (isOnchainForGasSwapInit(initOrObj)) {
            this.paymentHash = initOrObj.paymentHash;
            this.sequence = initOrObj.sequence;
            this.address = initOrObj.address;
            this.inputAmount = initOrObj.inputAmount;
            this.outputAmount = initOrObj.outputAmount;
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.refundAddress = initOrObj.refundAddress;
            this._state = OnchainForGasSwapState.PR_CREATED;
        }
        else {
            this.paymentHash = initOrObj.paymentHash;
            this.sequence = (0, Utils_1.toBigInt)(initOrObj.sequence);
            this.address = initOrObj.address;
            this.inputAmount = (0, Utils_1.toBigInt)(initOrObj.inputAmount);
            this.outputAmount = (0, Utils_1.toBigInt)(initOrObj.outputAmount);
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.refundAddress = initOrObj.refundAddress;
            this.scTxId = initOrObj.scTxId;
            this.txId = initOrObj.txId;
            this.refundTxId = initOrObj.refundTxId;
        }
        this.logger = (0, Logger_1.getLogger)("OnchainForGas(" + this.getId() + "): ");
        this.tryRecomputeSwapPrice();
    }
    /**
     * @inheritDoc
     * @internal
     */
    upgradeVersion() {
        if (this.version == null) {
            //Noop
            this.version = 1;
        }
    }
    /**
     * @inheritDoc
     * @internal
     */
    tryRecomputeSwapPrice() {
        if (this.swapFeeBtc == null && this.swapFee != null) {
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
    _getEscrowHash() {
        return this.paymentHash;
    }
    /**
     * @inheritDoc
     */
    getOutputAddress() {
        return this.recipient;
    }
    /**
     * @inheritDoc
     */
    getInputAddress() {
        //TODO: Fuck this, it's not used anyway
        return null;
    }
    /**
     * @inheritDoc
     */
    getInputTxId() {
        return this.txId ?? null;
    }
    /**
     * @inheritDoc
     */
    getOutputTxId() {
        return this.scTxId ?? null;
    }
    /**
     * @inheritDoc
     */
    getId() {
        return this.paymentHash;
    }
    /**
     * @inheritDoc
     */
    getAddress() {
        return this.address;
    }
    /**
     * @inheritDoc
     */
    getHyperlink() {
        return "bitcoin:" + this.address + "?amount=" + encodeURIComponent((Number(this.inputAmount) / 100000000).toString(10));
    }
    /**
     * @inheritDoc
     */
    requiresAction() {
        return this._state === OnchainForGasSwapState.REFUNDABLE;
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === OnchainForGasSwapState.FINISHED || this._state === OnchainForGasSwapState.FAILED || this._state === OnchainForGasSwapState.EXPIRED || this._state === OnchainForGasSwapState.REFUNDED;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === OnchainForGasSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired() {
        return this.expiry < Date.now();
    }
    /**
     * @inheritDoc
     */
    isFailed() {
        return this._state === OnchainForGasSwapState.FAILED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === OnchainForGasSwapState.FINISHED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteDefinitelyExpired() {
        return Promise.resolve(this.expiry < Date.now());
    }
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteValid() {
        return Promise.resolve(this.expiry > Date.now());
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * Returns an output amount in base units without a swap fee included, hence this value
     *  is larger than the actual output amount
     *
     * @internal
     */
    getOutAmountWithoutFee() {
        return this.outputAmount + (this.swapFee ?? 0n);
    }
    /**
     * @inheritDoc
     */
    getOutputToken() {
        return this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()];
    }
    /**
     * @inheritDoc
     */
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.outputAmount, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputToken() {
        return Token_1.BitcoinTokens.BTC;
    }
    /**
     * @inheritDoc
     */
    getInput() {
        return (0, TokenAmount_1.toTokenAmount)(this.inputAmount, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputWithoutFee() {
        return (0, TokenAmount_1.toTokenAmount)(this.inputAmount - (this.swapFeeBtc ?? 0n), Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known!");
        const feeWithoutBaseFee = this.swapFeeBtc == null ? 0n : this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc ?? 0n, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee ?? 0n, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
                percentage: (0, PercentagePPM_1.ppmToPercentage)(swapFeePPM)
            }
        };
    }
    /**
     * @inheritDoc
     */
    getFee() {
        return this.getSwapFee();
    }
    /**
     * @inheritDoc
     */
    getFeeBreakdown() {
        return [{
                type: FeeType_1.FeeType.SWAP,
                fee: this.getSwapFee()
            }];
    }
    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount() {
        return 1;
    }
    /**
     * @inheritDoc
     */
    async getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs) {
        if (this._state !== OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");
        let bitcoinWallet;
        if ((0, IBitcoinWallet_1.isIBitcoinWallet)(_bitcoinWallet)) {
            bitcoinWallet = _bitcoinWallet;
        }
        else {
            bitcoinWallet = new SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, _bitcoinWallet);
        }
        //TODO: Maybe re-introduce fee rate check here if passed from the user
        if (feeRate == null) {
            feeRate = await bitcoinWallet.getFeeRate();
        }
        const basePsbt = new btc_signer_1.Transaction({
            allowUnknownOutputs: true,
            allowLegacyWitnessUtxo: true
        });
        basePsbt.addOutput({
            amount: this.outputAmount,
            script: (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.address)
        });
        if (additionalOutputs != null)
            additionalOutputs.forEach(output => {
                basePsbt.addOutput({
                    amount: output.amount,
                    script: output.outputScript ?? (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, output.address)
                });
            });
        const psbt = await bitcoinWallet.fundPsbt(basePsbt, feeRate);
        //Sign every input
        const signInputs = [];
        for (let i = 0; i < psbt.inputsLength; i++) {
            signInputs.push(i);
        }
        const serializedPsbt = buffer_1.Buffer.from(psbt.toPSBT());
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
    async submitPsbt(_psbt) {
        const psbt = (0, BitcoinUtils_1.parsePsbtTransaction)(_psbt);
        if (this._state !== OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");
        //Ensure not expired
        if (this.expiry < Date.now()) {
            throw new Error("Swap expired!");
        }
        const output0 = psbt.getOutput(0);
        if (output0.amount !== this.outputAmount)
            throw new Error("PSBT output amount invalid, expected: " + this.outputAmount + " got: " + output0.amount);
        const expectedOutputScript = (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.address);
        if (output0.script == null || !expectedOutputScript.equals(output0.script))
            throw new Error("PSBT output script invalid!");
        if (!psbt.isFinal)
            psbt.finalize();
        return await this.wrapper._btcRpc.sendRawTransaction(buffer_1.Buffer.from(psbt.toBytes(true, true)).toString("hex"));
    }
    /**
     * @inheritDoc
     */
    async estimateBitcoinFee(_bitcoinWallet, feeRate) {
        const bitcoinWallet = (0, BitcoinWalletUtils_1.toBitcoinWallet)(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const txFee = await bitcoinWallet.getTransactionFee(this.address, this.inputAmount, feeRate);
        if (txFee == null)
            return null;
        return (0, TokenAmount_1.toTokenAmount)(BigInt(txFee), Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    async sendBitcoinTransaction(wallet, feeRate) {
        if (this._state !== OnchainForGasSwapState.PR_CREATED)
            throw new Error("Swap already paid for!");
        //Ensure not expired
        if (this.expiry < Date.now()) {
            throw new Error("Swap expired!");
        }
        if ((0, IBitcoinWallet_1.isIBitcoinWallet)(wallet)) {
            return await wallet.sendTransaction(this.address, this.inputAmount, feeRate);
        }
        else {
            const { psbt, psbtHex, psbtBase64, signInputs } = await this.getFundedPsbt(wallet, feeRate);
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
    async txsExecute(options) {
        if (this._state === OnchainForGasSwapState.PR_CREATED) {
            if (!await this._verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment",
                    description: "Send funds to the bitcoin swap address",
                    chain: "BITCOIN",
                    txs: [
                        options?.bitcoinWallet == null ? {
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
    /**
     * Queries the intermediary (LP) node for the state of the swap
     *
     * @param save Whether the save the result or not
     *
     * @returns Whether the swap was successful as `boolean` or `null` if the swap is still pending
     * @internal
     */
    async checkAddress(save = true) {
        if (this._state === OnchainForGasSwapState.FAILED ||
            this._state === OnchainForGasSwapState.EXPIRED ||
            this._state === OnchainForGasSwapState.REFUNDED)
            return false;
        if (this._state === OnchainForGasSwapState.FINISHED)
            return false;
        if (this.url == null)
            return false;
        const response = await TrustedIntermediaryAPI_1.TrustedIntermediaryAPI.getAddressStatus(this.url, this.paymentHash, this.sequence, this.wrapper._options.getRequestTimeout);
        switch (response.code) {
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.AWAIT_PAYMENT:
                if (this.txId != null) {
                    this.txId = undefined;
                    if (save)
                        await this._save();
                    return true;
                }
                return false;
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.AWAIT_CONFIRMATION:
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.PENDING:
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.TX_SENT:
                const inputAmount = BigInt(response.data.adjustedAmount);
                const outputAmount = BigInt(response.data.adjustedTotal);
                const adjustedFee = response.data.adjustedFee == null ? null : BigInt(response.data.adjustedFee);
                const adjustedFeeSats = response.data.adjustedFeeSats == null ? null : BigInt(response.data.adjustedFeeSats);
                const txId = response.data.txId;
                if (this.txId != txId ||
                    this.inputAmount !== inputAmount ||
                    this.outputAmount !== outputAmount) {
                    this.txId = txId;
                    this.inputAmount = inputAmount;
                    this.outputAmount = outputAmount;
                    if (adjustedFee != null)
                        this.swapFee = adjustedFee;
                    if (adjustedFeeSats != null)
                        this.swapFeeBtc = adjustedFeeSats;
                    if (save)
                        await this._save();
                    return true;
                }
                return false;
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.PAID:
                const txStatus = await this.wrapper._chain.getTxIdStatus(response.data.txId);
                if (txStatus === "success") {
                    this._state = OnchainForGasSwapState.FINISHED;
                    this.scTxId = response.data.txId;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                return false;
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.EXPIRED:
                this._state = OnchainForGasSwapState.EXPIRED;
                if (save)
                    await this._saveAndEmit();
                return true;
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.REFUNDABLE:
                if (this._state === OnchainForGasSwapState.REFUNDABLE)
                    return null;
                this._state = OnchainForGasSwapState.REFUNDABLE;
                if (save)
                    await this._saveAndEmit();
                return true;
            case TrustedIntermediaryAPI_1.AddressStatusResponseCodes.REFUNDED:
                this._state = OnchainForGasSwapState.REFUNDED;
                this.refundTxId = response.data.txId;
                if (save)
                    await this._saveAndEmit();
                return true;
            default:
                this._state = OnchainForGasSwapState.FAILED;
                if (save)
                    await this._saveAndEmit();
                return true;
        }
    }
    /**
     * Sets the bitcoin address used for possible refunds in case something goes wrong with the swap
     *
     * @param refundAddress Bitcoin address to receive the refund to
     * @internal
     */
    async setRefundAddress(refundAddress) {
        if (this.refundAddress != null) {
            if (this.refundAddress !== refundAddress)
                throw new Error("Different refund address already set!");
            return;
        }
        if (this.url == null)
            throw new Error("LP URL not known, cannot set refund address!");
        await TrustedIntermediaryAPI_1.TrustedIntermediaryAPI.setRefundAddress(this.url, this.paymentHash, this.sequence, refundAddress, this.wrapper._options.getRequestTimeout);
        this.refundAddress = refundAddress;
    }
    /**
     * @inheritDoc
     */
    async waitForBitcoinTransaction(updateCallback, checkIntervalSeconds = 5, abortSignal) {
        if (this._state !== OnchainForGasSwapState.PR_CREATED)
            throw new Error("Must be in PR_CREATED state!");
        if (!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }
        while (!abortSignal?.aborted &&
            this._state === OnchainForGasSwapState.PR_CREATED) {
            await this.checkAddress(true);
            if (this.txId != null && updateCallback != null) {
                const res = await this.wrapper._btcRpc.getTransaction(this.txId);
                if (res == null) {
                    updateCallback();
                }
                else if (res.confirmations != null && res.confirmations > 0) {
                    updateCallback(res.txid, res.confirmations, 1, 0);
                }
                else {
                    const delay = await this.wrapper._btcRpc.getConfirmationDelay(res, 1);
                    updateCallback(res.txid, 0, 1, delay ?? undefined);
                }
            }
            if (this._state === OnchainForGasSwapState.PR_CREATED)
                await (0, TimeoutUtils_1.timeoutPromise)(checkIntervalSeconds * 1000, abortSignal);
        }
        if (this._state === OnchainForGasSwapState.REFUNDABLE ||
            this._state === OnchainForGasSwapState.REFUNDED)
            return this.txId;
        if (this.isQuoteExpired())
            throw new Error("Swap expired");
        if (this.isFailed())
            throw new Error("Swap failed");
        return this.txId;
    }
    /**
     * Waits till the LP processes a refund for a failed swap. The swap must be in
     *  {@link OnchainForGasSwapState.REFUNDABLE} state
     *
     * @param checkIntervalSeconds How often to check (default 5 seconds)
     * @param abortSignal Abort signal
     */
    async waitTillRefunded(checkIntervalSeconds, abortSignal) {
        checkIntervalSeconds ??= 5;
        if (this._state === OnchainForGasSwapState.REFUNDED)
            return;
        if (this._state !== OnchainForGasSwapState.REFUNDABLE)
            throw new Error("Must be in REFUNDABLE state!");
        while (!abortSignal?.aborted &&
            this._state === OnchainForGasSwapState.REFUNDABLE) {
            await this.checkAddress(true);
            if (this._state === OnchainForGasSwapState.REFUNDABLE)
                await (0, TimeoutUtils_1.timeoutPromise)(checkIntervalSeconds * 1000, abortSignal);
        }
        if (this.isQuoteExpired())
            throw new Error("Swap expired");
        if (this.isFailed())
            throw new Error("Swap failed");
    }
    /**
     * Requests a refund after the swap failed, this also waits till the refund is actually sent by the
     *  intermediary (LP). The swap must be in {@link OnchainForGasSwapState.REFUNDABLE} state
     *
     * @param refundAddress Bitcoin address to receive the refund to
     * @param abortSignal Abort signal
     */
    async requestRefund(refundAddress, abortSignal) {
        if (refundAddress != null)
            await this.setRefundAddress(refundAddress);
        await this.waitTillRefunded(undefined, abortSignal);
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
    serialize() {
        return {
            ...super.serialize(),
            paymentHash: this.paymentHash,
            sequence: this.sequence == null ? null : this.sequence.toString(10),
            address: this.address,
            inputAmount: this.inputAmount == null ? null : this.inputAmount.toString(10),
            outputAmount: this.outputAmount == null ? null : this.outputAmount.toString(10),
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
    _getInitiator() {
        return this.recipient;
    }
    //////////////////////////////
    //// Swap ticks & sync
    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save) {
        if (this._state === OnchainForGasSwapState.PR_CREATED) {
            //Check if it's maybe already paid
            const result = await this.checkAddress(false);
            if (result) {
                if (save)
                    await this._saveAndEmit();
                return true;
            }
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _tick(save) {
        return Promise.resolve(false);
    }
}
exports.OnchainForGasSwap = OnchainForGasSwap;
