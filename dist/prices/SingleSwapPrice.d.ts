import { IPriceProvider } from "./abstract/IPriceProvider";
import { ICachedSwapPrice } from "./abstract/ICachedSwapPrice";
import { ChainIds, MultiChain } from "../swapper/Swapper";
/**
 * Swap price API using a single price source
 *
 * @category Pricing and LPs
 */
export declare class SingleSwapPrice<T extends MultiChain> extends ICachedSwapPrice<T> {
    priceProvider: IPriceProvider<T>;
    constructor(maxAllowedFeeDiffPPM: bigint, priceProvider: IPriceProvider<T>, cacheTimeout?: number);
    /**
     * Fetch price in uSats (micro sats) for a given token against BTC
     *
     * @param chainIdentifier
     * @param token
     * @param abortSignal
     * @protected
     * @returns token price in uSats (micro sats)
     */
    protected fetchPrice<C extends ChainIds<T>>(chainIdentifier: C, token: string, abortSignal?: AbortSignal): Promise<bigint>;
    /**
     * @inheritDoc
     */
    protected getDecimals<C extends ChainIds<T>>(chainIdentifier: C, token: string): number | null;
    /**
     * Fetches BTC price in USD
     *
     * @param abortSignal
     * @protected
     * @returns token price in uSats (micro sats)
     */
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
}
