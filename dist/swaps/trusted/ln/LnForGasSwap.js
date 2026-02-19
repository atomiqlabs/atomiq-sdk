"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LnForGasSwap = exports.isLnForGasSwapInit = exports.LnForGasSwapState = void 0;
const bolt11_1 = require("@atomiqlabs/bolt11");
const SwapType_1 = require("../../../enums/SwapType");
const Utils_1 = require("../../../utils/Utils");
const ISwap_1 = require("../../ISwap");
const TrustedIntermediaryAPI_1 = require("../../../intermediaries/apis/TrustedIntermediaryAPI");
const FeeType_1 = require("../../../enums/FeeType");
const PercentagePPM_1 = require("../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../types/TokenAmount");
const Token_1 = require("../../../types/Token");
const Logger_1 = require("../../../utils/Logger");
const TimeoutUtils_1 = require("../../../utils/TimeoutUtils");
/**
 * State enum for trusted Lightning gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
var LnForGasSwapState;
(function (LnForGasSwapState) {
    /**
     * The swap quote expired without user sending in the lightning network payment
     */
    LnForGasSwapState[LnForGasSwapState["EXPIRED"] = -2] = "EXPIRED";
    /**
     * The swap has failed after the intermediary already received a lightning network payment on the source
     */
    LnForGasSwapState[LnForGasSwapState["FAILED"] = -1] = "FAILED";
    /**
     * Swap was created, pay the provided lightning network invoice
     */
    LnForGasSwapState[LnForGasSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * User paid the lightning network invoice on the source
     */
    LnForGasSwapState[LnForGasSwapState["PR_PAID"] = 1] = "PR_PAID";
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    LnForGasSwapState[LnForGasSwapState["FINISHED"] = 2] = "FINISHED";
})(LnForGasSwapState = exports.LnForGasSwapState || (exports.LnForGasSwapState = {}));
const LnForGasSwapStateDescription = {
    [LnForGasSwapState.EXPIRED]: "The swap quote expired without user sending in the lightning network payment",
    [LnForGasSwapState.FAILED]: "The swap has failed after the intermediary already received a lightning network payment on the source",
    [LnForGasSwapState.PR_CREATED]: "Swap was created, pay the provided lightning network invoice",
    [LnForGasSwapState.PR_PAID]: "User paid the lightning network invoice on the source",
    [LnForGasSwapState.FINISHED]: "The swap is finished after the intermediary sent funds on the destination chain"
};
function isLnForGasSwapInit(obj) {
    return typeof (obj.pr) === "string" &&
        typeof (obj.outputAmount) === "bigint" &&
        typeof (obj.recipient) === "string" &&
        typeof (obj.token) === "string" &&
        (0, ISwap_1.isISwapInit)(obj);
}
exports.isLnForGasSwapInit = isLnForGasSwapInit;
/**
 * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on
 *  the destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
class LnForGasSwap extends ISwap_1.ISwap {
    constructor(wrapper, initOrObj) {
        if (isLnForGasSwapInit(initOrObj) && initOrObj.url != null)
            initOrObj.url += "/lnforgas";
        super(wrapper, initOrObj);
        this.TYPE = SwapType_1.SwapType.TRUSTED_FROM_BTCLN;
        /**
         * @internal
         */
        this.swapStateDescription = LnForGasSwapStateDescription;
        /**
         * @internal
         */
        this.swapStateName = (state) => LnForGasSwapState[state];
        /**
         * @internal
         */
        this.currentVersion = 2;
        if (isLnForGasSwapInit(initOrObj)) {
            this.pr = initOrObj.pr;
            this.outputAmount = initOrObj.outputAmount;
            this.recipient = initOrObj.recipient;
            this.token = initOrObj.token;
            this._state = LnForGasSwapState.PR_CREATED;
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
    /**
     * @inheritDoc
     * @internal
     */
    upgradeVersion() {
        if (this.version == 1) {
            if (this._state === 1)
                this._state = LnForGasSwapState.FINISHED;
            this.version = 2;
        }
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
        return this.getId();
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
        return this.pr;
    }
    /**
     * @inheritDoc
     */
    getInputTxId() {
        return this.getId();
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
    /**
     * @inheritDoc
     */
    requiresAction() {
        return false;
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === LnForGasSwapState.FINISHED || this._state === LnForGasSwapState.FAILED || this._state === LnForGasSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === LnForGasSwapState.EXPIRED;
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
        return this._state === LnForGasSwapState.FAILED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === LnForGasSwapState.FINISHED;
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
        return Token_1.BitcoinTokens.BTCLN;
    }
    /**
     * @inheritDoc
     */
    getInput() {
        const parsed = (0, bolt11_1.decode)(this.pr);
        const msats = parsed.millisatoshis;
        if (msats == null)
            throw new Error("Swap lightning invoice has no msat amount field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputWithoutFee() {
        const parsed = (0, bolt11_1.decode)(this.pr);
        const msats = parsed.millisatoshis;
        if (msats == null)
            throw new Error("Swap lightning invoice has no msat amount field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount - (this.swapFeeBtc ?? 0n), Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate swap fee!");
        const feeWithoutBaseFee = this.swapFeeBtc == null ? 0n : this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc ?? 0n, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee ?? 0n, this.wrapper._tokens[this.wrapper._chain.getNativeCurrencyAddress()], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo),
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
    //////////////////////////////
    //// Payment
    /**
     * @inheritDoc
     */
    async txsExecute() {
        if (this._state === LnForGasSwapState.PR_CREATED) {
            if (!await this._verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment",
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
     * @inheritDoc
     */
    async getCurrentActions() {
        try {
            return await this.txsExecute();
        }
        catch (e) {
            return [];
        }
    }
    /**
     * Queries the intermediary (LP) node for the state of the swap
     *
     * @param save Whether the save the result or not
     *
     * @returns Whether the swap was successful as `boolean` or `null` if the swap is still pending
     * @internal
     */
    async checkInvoicePaid(save = true) {
        if (this._state === LnForGasSwapState.FAILED || this._state === LnForGasSwapState.EXPIRED)
            return false;
        if (this._state === LnForGasSwapState.FINISHED)
            return true;
        if (this.url == null)
            return false;
        const decodedPR = (0, bolt11_1.decode)(this.pr);
        const paymentHash = decodedPR.tagsObject.payment_hash;
        if (paymentHash == null)
            throw new Error("Invalid swap invoice, payment hash not found!");
        const response = await TrustedIntermediaryAPI_1.TrustedIntermediaryAPI.getInvoiceStatus(this.url, paymentHash, this.wrapper._options.getRequestTimeout);
        this.logger.debug("checkInvoicePaid(): LP response: ", response);
        switch (response.code) {
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.PAID:
                this.scTxId = response.data.txId;
                const txStatus = await this.wrapper._chain.getTxIdStatus(this.scTxId);
                if (txStatus === "success") {
                    this._state = LnForGasSwapState.FINISHED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                return null;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.EXPIRED:
                if (this._state === LnForGasSwapState.PR_CREATED) {
                    this._state = LnForGasSwapState.EXPIRED;
                }
                else {
                    this._state = LnForGasSwapState.FAILED;
                }
                if (save)
                    await this._saveAndEmit();
                return false;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.TX_SENT:
                this.scTxId = response.data.txId;
                if (this._state === LnForGasSwapState.PR_CREATED) {
                    this._state = LnForGasSwapState.PR_PAID;
                    if (save)
                        await this._saveAndEmit();
                }
                return null;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.PENDING:
                if (this._state === LnForGasSwapState.PR_CREATED) {
                    this._state = LnForGasSwapState.PR_PAID;
                    if (save)
                        await this._saveAndEmit();
                }
                return null;
            case TrustedIntermediaryAPI_1.InvoiceStatusResponseCodes.AWAIT_PAYMENT:
                return null;
            default:
                this._state = LnForGasSwapState.FAILED;
                if (save)
                    await this._saveAndEmit();
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
    async waitForPayment(checkIntervalSeconds, abortSignal) {
        if (this._state !== LnForGasSwapState.PR_CREATED)
            throw new Error("Must be in PR_CREATED state!");
        if (!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }
        while (!abortSignal?.aborted && (this._state === LnForGasSwapState.PR_CREATED || this._state === LnForGasSwapState.PR_PAID)) {
            await this.checkInvoicePaid(true);
            if (this._state === LnForGasSwapState.PR_CREATED || this._state === LnForGasSwapState.PR_PAID)
                await (0, TimeoutUtils_1.timeoutPromise)((checkIntervalSeconds ?? 5) * 1000, abortSignal);
        }
        if (this.isFailed())
            throw new Error("Swap failed");
        return !this.isQuoteExpired();
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
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
        if (this._state === LnForGasSwapState.PR_CREATED) {
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
    /**
     * @inheritDoc
     * @internal
     */
    _tick(save) {
        return Promise.resolve(false);
    }
}
exports.LnForGasSwap = LnForGasSwap;
