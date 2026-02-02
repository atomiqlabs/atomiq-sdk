"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IEscrowSelfInitSwap = exports.isIEscrowSelfInitSwapInit = void 0;
const IEscrowSwap_1 = require("./IEscrowSwap");
const base_1 = require("@atomiqlabs/base");
const TokenAmount_1 = require("../../types/TokenAmount");
const TimeoutUtils_1 = require("../../utils/TimeoutUtils");
function isIEscrowSelfInitSwapInit(obj) {
    return typeof obj === "object" &&
        typeof (obj.feeRate) === "string" &&
        (obj.signatureData == null || (typeof (obj.signatureData) === "object" &&
            typeof (obj.signatureData.prefix) === "string" &&
            typeof (obj.signatureData.timeout) === "string" &&
            typeof (obj.signatureData.signature) === "string")) &&
        (0, IEscrowSwap_1.isIEscrowSwapInit)(obj);
}
exports.isIEscrowSelfInitSwapInit = isIEscrowSelfInitSwapInit;
class IEscrowSelfInitSwap extends IEscrowSwap_1.IEscrowSwap {
    constructor(wrapper, swapInitOrObj) {
        super(wrapper, swapInitOrObj);
        if (isIEscrowSelfInitSwapInit(swapInitOrObj)) {
            this.feeRate = swapInitOrObj.feeRate;
            this.signatureData = swapInitOrObj.signatureData;
        }
        else {
            if (swapInitOrObj.signature != null)
                this.signatureData = {
                    prefix: swapInitOrObj.prefix,
                    timeout: swapInitOrObj.timeout,
                    signature: swapInitOrObj.signature
                };
            this.feeRate = swapInitOrObj.feeRate;
        }
    }
    //////////////////////////////
    //// Watchdogs
    /**
     * Periodically checks for init signature's expiry
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @protected
     */
    async watchdogWaitTillSignatureExpiry(intervalSeconds, abortSignal) {
        if (this.data == null || this.signatureData == null)
            throw new Error("Tried to await signature expiry but data or signature is null, invalid state?");
        intervalSeconds ??= 5;
        let expired = false;
        while (!expired) {
            await (0, TimeoutUtils_1.timeoutPromise)(intervalSeconds * 1000, abortSignal);
            try {
                expired = await this.wrapper.contract.isInitAuthorizationExpired(this.data, this.signatureData);
            }
            catch (e) {
                this.logger.error("watchdogWaitTillSignatureExpiry(): Error when checking signature expiry: ", e);
            }
        }
        if (abortSignal != null)
            abortSignal.throwIfAborted();
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * Get the estimated smart chain fee of the commit transaction
     */
    getCommitFee() {
        return this.wrapper.contract.getCommitFee(this._getInitiator(), this.getSwapData(), this.feeRate);
    }
    /**
     * Returns the transaction fee paid on the smart chain
     */
    async getSmartChainNetworkFee() {
        const swapContract = this.wrapper.contract;
        return (0, TokenAmount_1.toTokenAmount)(await (swapContract.getRawCommitFee != null ?
            swapContract.getRawCommitFee(this._getInitiator(), this.getSwapData(), this.feeRate) :
            swapContract.getCommitFee(this._getInitiator(), this.getSwapData(), this.feeRate)), this.wrapper.getNativeToken(), this.wrapper.prices);
    }
    //////////////////////////////
    //// Quote verification
    /**
     * Checks if the swap's quote is expired for good (i.e. the swap strictly cannot be committed on-chain anymore)
     */
    async _verifyQuoteDefinitelyExpired() {
        if (this.data == null || this.signatureData == null)
            throw new Error("data or signature data are null!");
        return this.wrapper.contract.isInitAuthorizationExpired(this.data, this.signatureData);
    }
    /**
     * Checks if the swap's quote is still valid
     */
    async verifyQuoteValid() {
        if (this.data == null || this.signatureData == null)
            throw new Error("data or signature data are null!");
        try {
            await this.wrapper.contract.isValidInitAuthorization(this._getInitiator(), this.data, this.signatureData, this.feeRate);
            return true;
        }
        catch (e) {
            if (e instanceof base_1.SignatureVerificationError) {
                return false;
            }
            throw e;
        }
    }
    serialize() {
        return {
            ...super.serialize(),
            prefix: this.signatureData?.prefix,
            timeout: this.signatureData?.timeout,
            signature: this.signatureData?.signature,
            feeRate: this.feeRate == null ? null : this.feeRate.toString(),
        };
    }
    ;
}
exports.IEscrowSelfInitSwap = IEscrowSelfInitSwap;
