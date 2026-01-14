"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LnForGasSwap = exports.isLnForGasSwapInit = exports.LnForGasSwapState = void 0;
const bolt11_1 = require("@atomiqlabs/bolt11");
const SwapType_1 = require("../../../enums/SwapType");
const PaymentAuthError_1 = require("../../../errors/PaymentAuthError");
const Utils_1 = require("../../../utils/Utils");
const ISwap_1 = require("../../ISwap");
const TrustedIntermediaryAPI_1 = require("../../../intermediaries/apis/TrustedIntermediaryAPI");
const FeeType_1 = require("../../../enums/FeeType");
const PercentagePPM_1 = require("../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../types/TokenAmount");
const Token_1 = require("../../../types/Token");
const Logger_1 = require("../../../utils/Logger");
const TimeoutUtils_1 = require("../../../utils/TimeoutUtils");
var LnForGasSwapState;
(function (LnForGasSwapState) {
    LnForGasSwapState[LnForGasSwapState["EXPIRED"] = -2] = "EXPIRED";
    LnForGasSwapState[LnForGasSwapState["FAILED"] = -1] = "FAILED";
    LnForGasSwapState[LnForGasSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    LnForGasSwapState[LnForGasSwapState["PR_PAID"] = 1] = "PR_PAID";
    LnForGasSwapState[LnForGasSwapState["FINISHED"] = 2] = "FINISHED";
})(LnForGasSwapState = exports.LnForGasSwapState || (exports.LnForGasSwapState = {}));
function isLnForGasSwapInit(obj) {
    return typeof (obj.pr) === "string" &&
        typeof (obj.outputAmount) === "bigint" &&
        typeof (obj.recipient) === "string" &&
        typeof (obj.token) === "string" &&
        (0, ISwap_1.isISwapInit)(obj);
}
exports.isLnForGasSwapInit = isLnForGasSwapInit;
class LnForGasSwap extends ISwap_1.ISwap {
    constructor(wrapper, initOrObj) {
        if (isLnForGasSwapInit(initOrObj) && initOrObj.url != null)
            initOrObj.url += "/lnforgas";
        super(wrapper, initOrObj);
        this.currentVersion = 2;
        this.TYPE = SwapType_1.SwapType.TRUSTED_FROM_BTCLN;
        if (isLnForGasSwapInit(initOrObj)) {
            this.pr = initOrObj.pr;
            this.outputAmount = initOrObj.outputAmount;
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.state = LnForGasSwapState.PR_CREATED;
        }
        else {
            this.pr = initOrObj.pr;
            this.outputAmount = (0, Utils_1.toBigInt)(initOrObj.outputAmount);
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this.scTxId = initOrObj.scTxId;
        }
        this.tryRecomputeSwapPrice();
        if (this.pr != null) {
            const decoded = (0, bolt11_1.decode)(this.pr);
            if (decoded.timeExpireDate != null)
                this.expiry = decoded.timeExpireDate * 1000;
        }
        this.logger = (0, Logger_1.getLogger)("LnForGas(" + this.getId() + "): ");
    }
    upgradeVersion() {
        if (this.version == 1) {
            if (this.state === 1)
                this.state = LnForGasSwapState.FINISHED;
            this.version = 2;
        }
        if (this.version == null) {
            //Noop
            this.version = 1;
        }
    }
    /**
     * In case swapFee in BTC is not supplied it recalculates it based on swap price
     * @protected
     */
    tryRecomputeSwapPrice() {
        if (this.swapFeeBtc == null && this.swapFee != null) {
            this.swapFeeBtc = this.swapFee * this.getInput().rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }
    //////////////////////////////
    //// Getters & utils
    _getEscrowHash() {
        return this.getId();
    }
    getOutputAddress() {
        return this.recipient;
    }
    getInputAddress() {
        return this.pr;
    }
    getInputTxId() {
        return this.getId();
    }
    getOutputTxId() {
        return this.scTxId ?? null;
    }
    getId() {
        if (this.pr == null)
            throw new Error("No payment request assigned to this swap!");
        const decodedPR = (0, bolt11_1.decode)(this.pr);
        if (decodedPR.tagsObject.payment_hash == null)
            throw new Error("Lightning invoice has no payment hash!");
        return decodedPR.tagsObject.payment_hash;
    }
    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress() {
        return this.pr;
    }
    /**
     * Returns a string that can be displayed as QR code representation of the lightning invoice (with lightning: prefix)
     */
    getHyperlink() {
        return "lightning:" + this.pr.toUpperCase();
    }
    requiresAction() {
        return false;
    }
    isFinished() {
        return this.state === LnForGasSwapState.FINISHED || this.state === LnForGasSwapState.FAILED || this.state === LnForGasSwapState.EXPIRED;
    }
    isQuoteExpired() {
        return this.state === LnForGasSwapState.EXPIRED;
    }
    isQuoteSoftExpired() {
        return this.expiry < Date.now();
    }
    isFailed() {
        return this.state === LnForGasSwapState.FAILED;
    }
    isSuccessful() {
        return this.state === LnForGasSwapState.FINISHED;
    }
    verifyQuoteValid() {
        return Promise.resolve(this.expiry > Date.now());
    }
    //////////////////////////////
    //// Amounts & fees
    getOutAmountWithoutFee() {
        return this.outputAmount + (this.swapFee ?? 0n);
    }
    getOutputToken() {
        return this.wrapper.tokens[this.wrapper.chain.getNativeCurrencyAddress()];
    }
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.outputAmount, this.wrapper.tokens[this.wrapper.chain.getNativeCurrencyAddress()], this.wrapper.prices, this.pricingInfo);
    }
    getInputToken() {
        return Token_1.BitcoinTokens.BTCLN;
    }
    getInput() {
        const parsed = (0, bolt11_1.decode)(this.pr);
        const msats = parsed.millisatoshis;
        if (msats == null)
            throw new Error("Swap lightning invoice has no msat amount field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount, Token_1.BitcoinTokens.BTCLN, this.wrapper.prices, this.pricingInfo);
    }
    getInputWithoutFee() {
        const parsed = (0, bolt11_1.decode)(this.pr);
        const msats = parsed.millisatoshis;
        if (msats == null)
            throw new Error("Swap lightning invoice has no msat amount field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount - (this.swapFeeBtc ?? 0n), Token_1.BitcoinTokens.BTCLN, this.wrapper.prices, this.pricingInfo);
    }
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate swap fee!");
        const feeWithoutBaseFee = this.swapFeeBtc == null ? 0n : this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc ?? 0n, Token_1.BitcoinTokens.BTCLN, this.wrapper.prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee ?? 0n, this.wrapper.tokens[this.wrapper.chain.getNativeCurrencyAddress()], this.wrapper.prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, Token_1.BitcoinTokens.BTCLN, this.wrapper.prices, this.pricingInfo),
                percentage: (0, PercentagePPM_1.ppmToPercentage)(swapFeePPM)
            }
        };
    }
    getFee() {
        return this.getSwapFee();
    }
    getFeeBreakdown() {
        return [{
                type: FeeType_1.FeeType.SWAP,
                fee: this.getSwapFee()
            }];
    }
    //////////////////////////////
    //// Payment
    async txsExecute() {
        if (this.state === LnForGasSwapState.PR_CREATED) {
            if (!await this.verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment",
                    description: "Initiates the swap by paying up the lightning network invoice",
                    chain: "LIGHTNING",
                    txs: [
                        {
                            address: this.pr,
                            hyperlink: this.getHyperlink()
                        }
                    ]
                }
            ];
        }
        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED");
    }
    async checkInvoicePaid(save = true) {
        if (this.state === LnForGasSwapState.FAILED || this.state === LnForGasSwapState.EXPIRED)
            return false;
        if (this.state === LnForGasSwapState.FINISHED)
            return true;
        if (this.url == null)
            return false;
        const decodedPR = (0, bolt11_1.decode)(this.pr);
        const paymentHash = decodedPR.tagsObject.payment_hash;
        if (paymentHash == null)
            throw new Error("Invalid swap invoice, payment hash not found!");
        const response = await TrustedIntermediaryAPI_1.TrustedIntermediaryAPI.getInvoiceStatus(this.url, paymentHash, this.wrapper.options.getRequestTimeout);
        this.logger.debug("checkInvoicePaid(): LP response: ", response);
        switch (response.code) {
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.PAID:
                this.scTxId = response.data.txId;
                const txStatus = await this.wrapper.chain.getTxIdStatus(this.scTxId);
                if (txStatus === "success") {
                    this.state = LnForGasSwapState.FINISHED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                return null;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.EXPIRED:
                if (this.state === LnForGasSwapState.PR_CREATED) {
                    this.state = LnForGasSwapState.EXPIRED;
                }
                else {
                    this.state = LnForGasSwapState.FAILED;
                }
                if (save)
                    await this._saveAndEmit();
                return false;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.TX_SENT:
                this.scTxId = response.data.txId;
                if (this.state === LnForGasSwapState.PR_CREATED) {
                    this.state = LnForGasSwapState.PR_PAID;
                    if (save)
                        await this._saveAndEmit();
                }
                return null;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.PENDING:
                if (this.state === LnForGasSwapState.PR_CREATED) {
                    this.state = LnForGasSwapState.PR_PAID;
                    if (save)
                        await this._saveAndEmit();
                }
                return null;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.AWAIT_PAYMENT:
                return null;
            default:
                this.state = LnForGasSwapState.FAILED;
                if (save)
                    await this._saveAndEmit();
                return false;
        }
    }
    /**
     * A blocking promise resolving when payment was received by the intermediary and client can continue
     * rejecting in case of failure
     *
     * @param checkIntervalSeconds How often to poll the intermediary for answer (default 5 seconds)
     * @param abortSignal Abort signal
     * @throws {PaymentAuthError} If swap expired or failed
     * @throws {Error} When in invalid state (not PR_CREATED)
     */
    async waitForPayment(checkIntervalSeconds, abortSignal) {
        if (this.state !== LnForGasSwapState.PR_CREATED)
            throw new Error("Must be in PR_CREATED state!");
        if (!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }
        while (!abortSignal?.aborted && (this.state === LnForGasSwapState.PR_CREATED || this.state === LnForGasSwapState.PR_PAID)) {
            await this.checkInvoicePaid(true);
            if (this.state === LnForGasSwapState.PR_CREATED || this.state === LnForGasSwapState.PR_PAID)
                await (0, TimeoutUtils_1.timeoutPromise)((checkIntervalSeconds ?? 5) * 1000, abortSignal);
        }
        if (this.isFailed())
            throw new PaymentAuthError_1.PaymentAuthError("Swap failed");
        return !this.isQuoteExpired();
    }
    //////////////////////////////
    //// Storage
    serialize() {
        return {
            ...super.serialize(),
            pr: this.pr,
            outputAmount: this.outputAmount == null ? null : this.outputAmount.toString(10),
            recipient: this.recipient,
            token: this.token,
            scTxId: this.scTxId
        };
    }
    _getInitiator() {
        return this.recipient;
    }
    //////////////////////////////
    //// Swap ticks & sync
    async _sync(save) {
        if (this.state === LnForGasSwapState.PR_CREATED) {
            //Check if it's maybe already paid
            const res = await this.checkInvoicePaid(false);
            if (res !== null) {
                if (save)
                    await this._saveAndEmit();
                return true;
            }
        }
        return false;
    }
    _tick(save) {
        return Promise.resolve(false);
    }
}
exports.LnForGasSwap = LnForGasSwap;
