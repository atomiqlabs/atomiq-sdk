import { IPriceProvider } from "./abstract/IPriceProvider";
import { ICachedSwapPrice } from "./abstract/ICachedSwapPrice";
import { ChainIds, MultiChain } from "../swapper/Swapper";
/**
 * Asset configuration for redundant swap pricing
 *
 * @category Pricing and LPs
 */
export type RedundantSwapPriceAssets<T extends MultiChain> = {
    binancePair?: string;
    okxPair?: string;
    coinGeckoCoinId?: string;
    coinPaprikaCoinId?: string;
    krakenPair?: string;
    chains: {
        [chainIdentifier in keyof T]?: {
            address: string;
            decimals: number;
        };
    };
}[];
export type CtorCoinDecimals<T extends MultiChain> = {
    chains: {
        [chainIdentifier in keyof T]?: {
            address: string;
            decimals: number;
        };
    };
}[];
type CoinDecimals<T extends MultiChain> = {
    [chainIdentifier in keyof T]?: {
        [tokenAddress: string]: number;
    };
};
/**
 * Swap price API using multiple price sources, handles errors on the APIs and automatically switches between them, such
 *  that there always is a functional API
 *
 * @category Pricing and LPs
 */
export declare class RedundantSwapPrice<T extends MultiChain> extends ICachedSwapPrice<T> {
    /**
     * Creates a new {@link RedundantSwapPrice} instance from an asset list and other data, using all
     *  the available price providers: {@link BinancePriceProvider}, {@link OKXPriceProvider},
     *  {@link CoinGeckoPriceProvider}, {@link CoinPaprikaPriceProvider}, {@link KrakenPriceProvider}
     *
     * @param maxAllowedFeeDiffPPM Maximum allowed price difference between returned swap prices & market prices
     * @param assets Specifications of the assets
     * @param cacheTimeout Timeout of the internal cache holding prices
     */
    static createFromTokenMap<T extends MultiChain>(maxAllowedFeeDiffPPM: bigint, assets: RedundantSwapPriceAssets<T>, cacheTimeout?: number): RedundantSwapPrice<T>;
    protected coinsDecimals: CoinDecimals<T>;
    protected priceApis: {
        priceApi: IPriceProvider<T>;
        operational?: boolean;
    }[];
    constructor(maxAllowedFeeDiffPPM: bigint, coinsDecimals: CtorCoinDecimals<T>, priceApis: IPriceProvider<T>[], cacheTimeout?: number);
    /**
     * Returns price api that should be operational
     *
     * @private
     */
    private getOperationalPriceApi;
    /**
     * Returns price apis that are maybe operational, in case none is considered operational returns all of the price
     *  apis such that they can be tested again whether they are operational
     *
     * @private
     */
    private getMaybeOperationalPriceApis;
    /**
     * Fetches price in parallel from multiple maybe operational price APIs
     *
     * @param chainIdentifier
     * @param token
     * @param abortSignal
     * @private
     */
    private fetchPriceFromMaybeOperationalPriceApis;
    /**
     * Fetches the prices, first tries to use the operational price API (if any) and if that fails it falls back
     *  to using maybe operational price APIs
     *
     * @param chainIdentifier
     * @param token
     * @param abortSignal
     * @protected
     */
    protected fetchPrice<C extends ChainIds<T>>(chainIdentifier: C, token: string, abortSignal?: AbortSignal): Promise<bigint>;
    /**
     * @inheritDoc
     */
    protected getDecimals<C extends ChainIds<T>>(chainIdentifier: C, token: string): number | null;
    /**
     * Fetches BTC price in USD in parallel from multiple maybe operational price APIs
     *
     * @param abortSignal
     * @private
     */
    private fetchUsdPriceFromMaybeOperationalPriceApis;
    /**
     * Fetches the USD prices, first tries to use the operational price API (if any) and if that fails it falls back
     *  to using maybe operational price APIs
     *
     * @param abortSignal
     * @protected
     */
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
}
export {};
