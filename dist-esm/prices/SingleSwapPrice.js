import { ICachedSwapPrice } from "./abstract/ICachedSwapPrice";
/**
 * Swap price API using a single price source
 *
 * @category Pricing
 */
export class SingleSwapPrice extends ICachedSwapPrice {
    constructor(maxAllowedFeeDiffPPM, priceProvider, cacheTimeout) {
        super(maxAllowedFeeDiffPPM, cacheTimeout);
        this.priceProvider = priceProvider;
    }
    /**
     * Fetch price in uSats (micro sats) for a given token against BTC
     *
     * @param chainIdentifier
     * @param token
     * @param abortSignal
     * @protected
     * @returns token price in uSats (micro sats)
     */
    fetchPrice(chainIdentifier, token, abortSignal) {
        return this.priceProvider.getPrice(chainIdentifier, token, abortSignal);
    }
    /**
     * @inheritDoc
     */
    getDecimals(chainIdentifier, token) {
        return this.priceProvider.getDecimals(chainIdentifier, token.toString());
    }
    /**
     * Fetches BTC price in USD
     *
     * @param abortSignal
     * @protected
     * @returns token price in uSats (micro sats)
     */
    fetchUsdPrice(abortSignal) {
        return this.priceProvider.getUsdPrice(abortSignal);
    }
}
