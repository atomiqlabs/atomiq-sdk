"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToBTCLNSwap = exports.isToBTCLNSwapInit = void 0;
const bolt11_1 = require("@atomiqlabs/bolt11");
const IToBTCSwap_1 = require("../IToBTCSwap");
const SwapType_1 = require("../../../../enums/SwapType");
const buffer_1 = require("buffer");
const sha2_1 = require("@noble/hashes/sha2");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const LNURL_1 = require("../../../../lnurl/LNURL");
const TokenAmount_1 = require("../../../../types/TokenAmount");
const Token_1 = require("../../../../types/Token");
const Logger_1 = require("../../../../utils/Logger");
function isToBTCLNSwapInit(obj) {
    return typeof (obj.confidence) === "number" &&
        (obj.pr == null || typeof (obj.pr) === "string") &&
        (obj.lnurl == null || typeof (obj.lnurl) === "string") &&
        (obj.successAction == null || (0, LNURL_1.isLNURLPaySuccessAction)(obj.successAction)) &&
        (0, IToBTCSwap_1.isIToBTCSwapInit)(obj);
}
exports.isToBTCLNSwapInit = isToBTCLNSwapInit;
//Set of nodes which disallow probing, resulting in 0 confidence reported by the LP
const SNOWFLAKE_LIST = new Set([
    "038f8f113c580048d847d6949371726653e02b928196bad310e3eda39ff61723f6",
    "03a6ce61fcaacd38d31d4e3ce2d506602818e3856b4b44faff1dde9642ba705976"
]);
/**
 * Escrow based (HTLC) swap for Smart chains -> Bitcoin lightning
 *
 * @category Swaps/Smart chain → Lightning
 */
class ToBTCLNSwap extends IToBTCSwap_1.IToBTCSwap {
    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl, successAction) {
        this.lnurl = lnurl;
        this.successAction = successAction;
    }
    constructor(wrapper, initOrObj) {
        if (isToBTCLNSwapInit(initOrObj) && initOrObj.url != null)
            initOrObj.url += "/tobtcln";
        super(wrapper, initOrObj);
        this.TYPE = SwapType_1.SwapType.TO_BTCLN;
        /**
         * @internal
         */
        this.outputToken = Token_1.BitcoinTokens.BTCLN;
        if (isToBTCLNSwapInit(initOrObj)) {
            this.confidence = initOrObj.confidence;
            this.pr = initOrObj.pr;
            this.lnurl = initOrObj.lnurl;
            this.successAction = initOrObj.successAction;
            this.usesClaimHashAsId = true;
        }
        else {
            this.confidence = initOrObj.confidence;
            this.pr = initOrObj.pr;
            this.lnurl = initOrObj.lnurl;
            this.successAction = initOrObj.successAction;
            this.secret = initOrObj.secret;
            this.usesClaimHashAsId = initOrObj.usesClaimHashAsId ?? false;
        }
        this.logger = (0, Logger_1.getLogger)("ToBTCLN(" + this.getIdentifierHashString() + "): ");
        this.tryRecomputeSwapPrice();
    }
    /**
     * @inheritDoc
     * @internal
     */
    _setPaymentResult(result, check = false) {
        if (result == null)
            return Promise.resolve(false);
        if (result.secret == null)
            throw new IntermediaryError_1.IntermediaryError("No payment secret returned!");
        const secretBuffer = buffer_1.Buffer.from(result.secret, "hex");
        const hash = buffer_1.Buffer.from((0, sha2_1.sha256)(secretBuffer));
        if (check) {
            const claimHash = this.wrapper._contract.getHashForHtlc(hash);
            const expectedClaimHash = buffer_1.Buffer.from(this.getClaimHash(), "hex");
            if (!claimHash.equals(expectedClaimHash))
                throw new IntermediaryError_1.IntermediaryError("Invalid payment secret returned");
        }
        this.pr ??= hash.toString("hex");
        this.secret = result.secret;
        return Promise.resolve(true);
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * @inheritDoc
     */
    getOutputToken() {
        return Token_1.BitcoinTokens.BTCLN;
    }
    /**
     * @inheritDoc
     */
    getOutput() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return (0, TokenAmount_1.toTokenAmount)(null, this.outputToken, this.wrapper._prices, this.pricingInfo);
        const parsedPR = (0, bolt11_1.decode)(this.pr);
        if (parsedPR.millisatoshis == null)
            throw new Error("Swap invoice has no msat amount field!");
        const amount = (BigInt(parsedPR.millisatoshis) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount, this.outputToken, this.wrapper._prices, this.pricingInfo);
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * @inheritDoc
     */
    getOutputTxId() {
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            return null;
        return paymentHash.toString("hex");
    }
    /**
     * @inheritDoc
     */
    getOutputAddress() {
        return this.lnurl ?? this.pr ?? null;
    }
    /**
     * Returns payment secret (pre-image) as a proof of payment
     */
    getSecret() {
        return this.secret ?? null;
    }
    /**
     * Returns the confidence of the intermediary that this payment will succeed.
     *
     * @returns Decimal value between 0 and 1, where 0 is not likely and 1 is very likely
     */
    getConfidence() {
        return this.confidence;
    }
    /**
     * Checks whether a swap is likely to fail, based on the confidence as reported by the intermediary (LP)
     */
    willLikelyFail() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return false;
        const parsedRequest = (0, bolt11_1.decode)(this.pr);
        if (parsedRequest.tagsObject.routing_info != null) {
            for (let route of parsedRequest.tagsObject.routing_info) {
                if (SNOWFLAKE_LIST.has(route.pubkey)) {
                    return false;
                }
            }
        }
        return this.confidence === 0;
    }
    /**
     * Tries to detect if the target lightning invoice is a non-custodial mobile wallet, extract care must be taken
     *  for such a wallet **to be online** when attempting to make a swap sending to such a wallet
     */
    isPayingToNonCustodialWallet() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return false;
        const parsedRequest = (0, bolt11_1.decode)(this.pr);
        if (parsedRequest.tagsObject.routing_info != null) {
            return parsedRequest.tagsObject.routing_info.length > 0;
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    getIdentifierHash() {
        const idBuffer = this.usesClaimHashAsId
            ? buffer_1.Buffer.from(this.getClaimHash(), "hex")
            : this.getPaymentHash();
        if (this._randomNonce == null)
            return idBuffer;
        return buffer_1.Buffer.concat([idBuffer, buffer_1.Buffer.from(this._randomNonce, "hex")]);
    }
    /**
     * @inheritDoc
     * @internal
     */
    getLpIdentifier() {
        if (this.pr == null)
            return this._data.getEscrowHash();
        if (this.pr.toLowerCase().startsWith("ln")) {
            const parsed = (0, bolt11_1.decode)(this.pr);
            if (parsed.tagsObject.payment_hash == null)
                throw new Error("Swap invoice has no payment hash field!");
            return parsed.tagsObject.payment_hash;
        }
        return this.pr;
    }
    /**
     * Returns the payment hash of the swap, i.e. a payment hash of the lightning network invoice that
     *  is about to be paid
     */
    getPaymentHash() {
        if (this.pr == null)
            return null;
        if (this.pr.toLowerCase().startsWith("ln")) {
            const parsed = (0, bolt11_1.decode)(this.pr);
            if (parsed.tagsObject.payment_hash == null)
                throw new Error("Swap invoice has no payment hash field!");
            return buffer_1.Buffer.from(parsed.tagsObject.payment_hash, "hex");
        }
        return buffer_1.Buffer.from(this.pr, "hex");
    }
    //////////////////////////////
    //// LNURL-pay
    /**
     * Whether this is an LNURL-pay swap
     */
    isLNURL() {
        return this.lnurl != null;
    }
    /**
     * Gets the used LNURL-pay link or `null` if this is not an LNURL-pay swap
     */
    getLNURL() {
        return this.lnurl ?? null;
    }
    /**
     * Checks whether this LNURL-pay payment contains a success action
     */
    hasSuccessAction() {
        return this.successAction != null;
    }
    /**
     * Returns the success action after a successful payment, else `null`
     */
    getSuccessAction() {
        return LNURL_1.LNURL.decodeSuccessAction(this.successAction, this.secret);
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
    serialize() {
        return {
            ...super.serialize(),
            paymentHash: this.getPaymentHash()?.toString("hex"),
            pr: this.pr,
            confidence: this.confidence,
            secret: this.secret,
            lnurl: this.lnurl,
            successAction: this.successAction,
            usesClaimHashAsId: this.usesClaimHashAsId
        };
    }
}
exports.ToBTCLNSwap = ToBTCLNSwap;
