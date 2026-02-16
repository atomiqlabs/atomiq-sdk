"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnchainForGasWrapper = void 0;
const ISwapWrapper_1 = require("../../ISwapWrapper");
const TrustedIntermediaryAPI_1 = require("../../../intermediaries/apis/TrustedIntermediaryAPI");
const IntermediaryError_1 = require("../../../errors/IntermediaryError");
const OnchainForGasSwap_1 = require("./OnchainForGasSwap");
const SwapType_1 = require("../../../enums/SwapType");
/**
 * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the
 *  destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps
 */
class OnchainForGasWrapper extends ISwapWrapper_1.ISwapWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param prices Pricing to use
     * @param tokens
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, btcRpc, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, events);
        this.TYPE = SwapType_1.SwapType.TRUSTED_FROM_BTC;
        /**
         * @internal
         */
        this._swapDeserializer = OnchainForGasSwap_1.OnchainForGasSwap;
        /**
         * @internal
         */
        this._pendingSwapStates = [OnchainForGasSwap_1.OnchainForGasSwapState.PR_CREATED];
        /**
         * @internal
         */
        this.tickSwapState = undefined;
        /**
         * @internal
         */
        this.processEvent = undefined;
        this._btcRpc = btcRpc;
    }
    /**
     * Returns a newly created trusted Bitcoin on-chain -> Smart chain swap, receiving
     *  the specified amount of native token on the destination chain.
     *
     * @param recipient Address of the recipient on the smart chain destination chain
     * @param amount Amount of native token to receive in base units
     * @param lpOrUrl Intermediary (LP) to use for the swap
     * @param refundAddress Bitcoin address to receive refund on in case the intermediary (LP) cannot execute the swap
     */
    async create(recipient, amount, lpOrUrl, refundAddress) {
        if (!this.isInitialized)
            throw new Error("Not initialized, call init() first!");
        const lpUrl = typeof (lpOrUrl) === "string" ? lpOrUrl : lpOrUrl.url;
        const token = this._chain.getNativeCurrencyAddress();
        const resp = await TrustedIntermediaryAPI_1.TrustedIntermediaryAPI.initTrustedFromBTC(this.chainIdentifier, lpUrl, {
            address: recipient,
            amount,
            refundAddress,
            token
        }, this._options.getRequestTimeout);
        if (resp.total !== amount)
            throw new IntermediaryError_1.IntermediaryError("Invalid total returned");
        const pricingInfo = await this.verifyReturnedPrice(typeof (lpOrUrl) === "string" || lpOrUrl.services[SwapType_1.SwapType.TRUSTED_FROM_BTC] == null ?
            { swapFeePPM: 10000, swapBaseFee: 10 } :
            lpOrUrl.services[SwapType_1.SwapType.TRUSTED_FROM_BTC], false, resp.amountSats, amount, this._chain.getNativeCurrencyAddress(), {});
        const quote = new OnchainForGasSwap_1.OnchainForGasSwap(this, {
            paymentHash: resp.paymentHash,
            sequence: resp.sequence,
            address: resp.btcAddress,
            inputAmount: resp.amountSats,
            outputAmount: resp.total,
            recipient,
            refundAddress,
            pricingInfo,
            url: lpUrl,
            expiry: resp.expiresAt,
            swapFee: resp.swapFee,
            swapFeeBtc: resp.swapFeeSats,
            exactIn: false,
            token
        });
        await quote._save();
        return quote;
    }
}
exports.OnchainForGasWrapper = OnchainForGasWrapper;
