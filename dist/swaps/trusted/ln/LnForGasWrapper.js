"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LnForGasWrapper = void 0;
const LnForGasSwap_1 = require("./LnForGasSwap");
const ISwapWrapper_1 = require("../../ISwapWrapper");
const TrustedIntermediaryAPI_1 = require("../../../intermediaries/apis/TrustedIntermediaryAPI");
const bolt11_1 = require("@atomiqlabs/bolt11");
const IntermediaryError_1 = require("../../../errors/IntermediaryError");
const SwapType_1 = require("../../../enums/SwapType");
/**
 * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on
 *  the destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
class LnForGasWrapper extends ISwapWrapper_1.ISwapWrapper {
    constructor() {
        super(...arguments);
        this.TYPE = SwapType_1.SwapType.TRUSTED_FROM_BTCLN;
        /**
         * @internal
         */
        this._swapDeserializer = LnForGasSwap_1.LnForGasSwap;
        /**
         * @internal
         */
        this._pendingSwapStates = [LnForGasSwap_1.LnForGasSwapState.PR_CREATED];
        /**
         * @internal
         */
        this.tickSwapState = undefined;
        /**
         * @internal
         */
        this.processEvent = undefined;
    }
    /**
     * Returns a newly created trusted Lightning network -> Smart chain swap, receiving
     *  the specified amount of native token on the destination chain.
     *
     * @param recipient Address of the recipient on the smart chain destination chain
     * @param amount Amount of native token to receive in base units
     * @param lpOrUrl Intermediary (LP) to use for the swap
     */
    async create(recipient, amount, lpOrUrl) {
        if (!this.isInitialized)
            throw new Error("Not initialized, call init() first!");
        const lpUrl = typeof (lpOrUrl) === "string" ? lpOrUrl : lpOrUrl.url;
        const token = this._chain.getNativeCurrencyAddress();
        const resp = await TrustedIntermediaryAPI_1.TrustedIntermediaryAPI.initTrustedFromBTCLN(this.chainIdentifier, lpUrl, {
            address: recipient,
            amount,
            token
        }, this._options.getRequestTimeout);
        const decodedPr = (0, bolt11_1.decode)(resp.pr);
        if (decodedPr.millisatoshis == null)
            throw new Error("Invalid payment request returned, no msat amount value!");
        if (decodedPr.timeExpireDate == null)
            throw new Error("Invalid payment request returned, no time expire date!");
        const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
        if (resp.total !== amount)
            throw new IntermediaryError_1.IntermediaryError("Invalid total returned");
        const pricingInfo = await this.verifyReturnedPrice(typeof (lpOrUrl) === "string" || lpOrUrl.services[SwapType_1.SwapType.TRUSTED_FROM_BTCLN] == null ?
            { swapFeePPM: 10000, swapBaseFee: 10 } :
            lpOrUrl.services[SwapType_1.SwapType.TRUSTED_FROM_BTCLN], false, amountIn, amount, token, {});
        const quoteInit = {
            pr: resp.pr,
            outputAmount: resp.total,
            recipient,
            pricingInfo,
            url: lpUrl,
            expiry: decodedPr.timeExpireDate * 1000,
            swapFee: resp.swapFee,
            swapFeeBtc: resp.swapFeeSats,
            token,
            exactIn: false
        };
        const quote = new LnForGasSwap_1.LnForGasSwap(this, quoteInit);
        await quote._save();
        return quote;
    }
}
exports.LnForGasWrapper = LnForGasWrapper;
