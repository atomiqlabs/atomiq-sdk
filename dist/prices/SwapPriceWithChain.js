"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapPriceWithChain = void 0;
/**
 * Chain-specific wrapper for swap pricing
 *
 * @category Pricing
 */
class SwapPriceWithChain {
    constructor(swapPrice, chainIdentifier) {
        this.swapPrice = swapPrice;
        this.chainIdentifier = chainIdentifier;
        this.maxAllowedFeeDifferencePPM = swapPrice.maxAllowedFeeDifferencePPM;
    }
    /**
     * Checks whether the swap amounts are valid given the current market rate for a given pair
     *
     * @param amountSats Amount of sats (BTC) to be received from the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param paidToken Amount of token to be paid to the swap
     * @param tokenAddress Token address to be paid
     * @param abortSignal Abort signal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     */
    async isValidAmountSend(amountSats, satsBaseFee, feePPM, paidToken, tokenAddress, abortSignal, preFetchedPrice) {
        return this.swapPrice.isValidAmountSend(this.chainIdentifier, amountSats, satsBaseFee, feePPM, paidToken, tokenAddress, abortSignal, preFetchedPrice);
    }
    /**
     * Checks whether the swap amounts are valid given the current market rate for a given pair
     *
     * @param amountSats Amount of sats (BTC) to be paid to the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param receiveToken Amount of token to be received from the swap
     * @param tokenAddress Token address to be received
     * @param abortSignal Abort signal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     */
    async isValidAmountReceive(amountSats, satsBaseFee, feePPM, receiveToken, tokenAddress, abortSignal, preFetchedPrice) {
        return this.swapPrice.isValidAmountReceive(this.chainIdentifier, amountSats, satsBaseFee, feePPM, receiveToken, tokenAddress, abortSignal, preFetchedPrice);
    }
    /**
     * Pre-fetches the pricing data for a given token, such that further calls to {@link isValidAmountReceive} or
     *  {@link isValidAmountSend} are quicker and don't need to wait for the price fetch
     *
     * @param tokenAddress Token address
     * @param abortSignal Abort signal
     */
    preFetchPrice(tokenAddress, abortSignal) {
        return this.swapPrice.preFetchPrice(this.chainIdentifier, tokenAddress, abortSignal);
    }
    /**
     * Pre-fetches the Bitcoin USD price data, such that further calls to {@link getBtcUsdValue},
     *  {@link getTokenUsdValue} or {@link getUsdValue} are quicker and don't need to wait for the price fetch
     *
     * @param abortSignal
     */
    preFetchUsdPrice(abortSignal) {
        return this.swapPrice.preFetchUsdPrice(abortSignal);
    }
    /**
     * Returns amount of `toToken` that is equivalent to `fromAmount` satoshis
     *
     * @param fromAmount Amount of satoshis
     * @param toToken Token address
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     * @throws {Error} when token is not found
     */
    async getFromBtcSwapAmount(fromAmount, toToken, abortSignal, preFetchedPrice) {
        return this.swapPrice.getFromBtcSwapAmount(this.chainIdentifier, fromAmount, toToken, abortSignal, preFetchedPrice);
    }
    /**
     * Returns amount of satoshis that are equivalent to `fromAmount` of `fromToken`
     *
     * @param fromAmount Amount of the token
     * @param fromToken Token address
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     * @throws {Error} when token is not found
     */
    async getToBtcSwapAmount(fromAmount, fromToken, abortSignal, preFetchedPrice) {
        return this.swapPrice.getToBtcSwapAmount(this.chainIdentifier, fromAmount, fromToken, abortSignal, preFetchedPrice);
    }
    /**
     * Returns whether the token should be ignored and pricing for it not calculated
     *
     * @param tokenAddress Token address
     * @throws {Error} if token is not found
     */
    shouldIgnore(tokenAddress) {
        return this.swapPrice.shouldIgnore(this.chainIdentifier, tokenAddress);
    }
    /**
     * Returns the USD value of the bitcoin amount
     *
     * @param btcSats Bitcoin amount in satoshis
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    async getBtcUsdValue(btcSats, abortSignal, preFetchedUsdPrice) {
        return this.swapPrice.getBtcUsdValue(btcSats, abortSignal, preFetchedUsdPrice);
    }
    /**
     * Returns the USD value of the smart chain token amount
     *
     * @param tokenAmount Amount of the token in base units
     * @param tokenAddress Token address
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    async getTokenUsdValue(tokenAmount, tokenAddress, abortSignal, preFetchedUsdPrice) {
        return this.swapPrice.getTokenUsdValue(this.chainIdentifier, tokenAmount, tokenAddress, abortSignal, preFetchedUsdPrice);
    }
    /**
     * Returns the USD value of the token amount
     *
     * @param amount Amount in base units of the token
     * @param token Token to fetch the usd price for
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    getUsdValue(amount, token, abortSignal, preFetchedUsdPrice) {
        return this.swapPrice.getUsdValue(amount, token, abortSignal, preFetchedUsdPrice);
    }
}
exports.SwapPriceWithChain = SwapPriceWithChain;
