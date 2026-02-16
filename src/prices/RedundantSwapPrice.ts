import {IPriceProvider} from "./abstract/IPriceProvider";
import {BinancePriceProvider} from "./providers/BinancePriceProvider";
import {OKXPriceProvider} from "./providers/OKXPriceProvider";
import {CoinGeckoPriceProvider} from "./providers/CoinGeckoPriceProvider";
import {CoinPaprikaPriceProvider} from "./providers/CoinPaprikaPriceProvider";
import {promiseAny} from "../utils/Utils";
import {ICachedSwapPrice} from "./abstract/ICachedSwapPrice";
import {RequestError} from "../errors/RequestError";
import {ChainIds, MultiChain} from "../swapper/Swapper";
import {KrakenPriceProvider} from "./providers/KrakenPriceProvider";
import {getLogger} from "../utils/Logger";
import {tryWithRetries} from "../utils/RetryUtils";

/**
 * Asset configuration for redundant swap pricing
 *
 * @category Pricing
 */
export type RedundantSwapPriceAssets<T extends MultiChain> = {
    binancePair?: string,
    okxPair?: string,
    coinGeckoCoinId?: string,
    coinPaprikaCoinId?: string,
    krakenPair?: string,
    chains: {
        [chainIdentifier in keyof T]?: {
            address: string,
            decimals: number
        }
    }
}[];

export type CtorCoinDecimals<T extends MultiChain> = {
    chains: {
        [chainIdentifier in keyof T]?: {
            address: string,
            decimals: number
        }
    }
}[];

type CoinDecimals<T extends MultiChain> = {
    [chainIdentifier in keyof T]?: {
        [tokenAddress: string]: number
    }
};

const logger = getLogger("RedundantSwapPrice: ");

/**
 * Swap price API using multiple price sources, handles errors on the APIs and automatically switches between them, such
 *  that there always is a functional API
 *
 * @category Pricing
 */
export class RedundantSwapPrice<T extends MultiChain> extends ICachedSwapPrice<T> {

    /**
     * Creates a new {@link RedundantSwapPrice} instance from an asset list and other data, using all
     *  the available price providers: {@link BinancePriceProvider}, {@link OKXPriceProvider},
     *  {@link CoinGeckoPriceProvider}, {@link CoinPaprikaPriceProvider}, {@link KrakenPriceProvider}
     *
     * @param maxAllowedFeeDiffPPM Maximum allowed price difference between returned swap prices & market prices
     * @param assets Specifications of the assets
     * @param cacheTimeout Timeout of the internal cache holding prices
     */
    static createFromTokenMap<T extends MultiChain>(maxAllowedFeeDiffPPM: bigint, assets: RedundantSwapPriceAssets<T>, cacheTimeout?: number): RedundantSwapPrice<T> {
        const priceApis = [
            new BinancePriceProvider(assets.map(coinData => {
                return {
                    coinId: coinData.binancePair,
                    chains: coinData.chains
                };
            })),
            new OKXPriceProvider(assets.map(coinData => {
                return {
                    coinId: coinData.okxPair,
                    chains: coinData.chains
                };
            })),
            new CoinGeckoPriceProvider(assets.map(coinData => {
                return {
                    coinId: coinData.coinGeckoCoinId,
                    chains: coinData.chains
                };
            })),
            new CoinPaprikaPriceProvider(assets.map(coinData => {
                return {
                    coinId: coinData.coinPaprikaCoinId,
                    chains: coinData.chains
                };
            })),
            new KrakenPriceProvider(assets.map(coinData => {
                return {
                    coinId: coinData.krakenPair,
                    chains: coinData.chains
                };
            }))
        ];

        return new RedundantSwapPrice(maxAllowedFeeDiffPPM, assets, priceApis, cacheTimeout);
    }

    protected coinsDecimals: CoinDecimals<T> = {};
    protected priceApis: {
        priceApi: IPriceProvider<T>,
        operational?: boolean
    }[];

    constructor(maxAllowedFeeDiffPPM: bigint, coinsDecimals: CtorCoinDecimals<T>, priceApis: IPriceProvider<T>[], cacheTimeout?: number) {
        super(maxAllowedFeeDiffPPM, cacheTimeout);
        for(let coinData of coinsDecimals) {
            for(let chainId in coinData.chains) {
                const {address, decimals} = coinData.chains[chainId]!;
                this.coinsDecimals[chainId] ??= {};
                (this.coinsDecimals[chainId] as any)[address.toString()] = decimals;
            }
        }
        this.priceApis = priceApis.map(api => {
            return {
                priceApi: api
            }
        });
    }

    /**
     * Returns price api that should be operational
     *
     * @private
     */
    private getOperationalPriceApi(): {priceApi: IPriceProvider<T>, operational?: boolean} | undefined {
        return this.priceApis.find(e => e.operational===true);
    }

    /**
     * Returns price apis that are maybe operational, in case none is considered operational returns all of the price
     *  apis such that they can be tested again whether they are operational
     *
     * @private
     */
    private getMaybeOperationalPriceApis(): {priceApi: IPriceProvider<T>, operational?: boolean}[] {
        let operational = this.priceApis.filter(e => e.operational===true || e.operational===undefined);
        if(operational.length===0) {
            this.priceApis.forEach(e => e.operational=undefined);
            operational = this.priceApis;
        }
        return operational;
    }

    /**
     * Fetches price in parallel from multiple maybe operational price APIs
     *
     * @param chainIdentifier
     * @param token
     * @param abortSignal
     * @private
     */
    private async fetchPriceFromMaybeOperationalPriceApis<C extends ChainIds<T>>(chainIdentifier: C, token: string, abortSignal?: AbortSignal) {
        try {
            return await promiseAny<bigint>(this.getMaybeOperationalPriceApis().map(
                obj => (async () => {
                    try {
                        const price = await obj.priceApi.getPrice(chainIdentifier, token, abortSignal);
                        logger.debug("fetchPrice(): Price from "+obj.priceApi.constructor.name+": ", price.toString(10));
                        obj.operational = true;
                        return price;
                    } catch (e) {
                        if(abortSignal!=null) abortSignal.throwIfAborted();
                        obj.operational = false;
                        throw e;
                    }
                })()
            ))
        } catch (_e: any) {
            const e = _e as any[];
            if(abortSignal!=null) abortSignal.throwIfAborted();
            throw e.find(err => !(err instanceof RequestError)) || e[0];
        }
    }

    /**
     * Fetches the prices, first tries to use the operational price API (if any) and if that fails it falls back
     *  to using maybe operational price APIs
     *
     * @param chainIdentifier
     * @param token
     * @param abortSignal
     * @protected
     */
    protected fetchPrice<C extends ChainIds<T>>(chainIdentifier: C, token: string, abortSignal?: AbortSignal): Promise<bigint> {
        return tryWithRetries(async () => {
            const operationalPriceApi = this.getOperationalPriceApi();
            if (operationalPriceApi != null) {
                try {
                    return await operationalPriceApi.priceApi.getPrice(chainIdentifier, token, abortSignal);
                } catch (err) {
                    if (abortSignal != null)
                        abortSignal.throwIfAborted();
                    operationalPriceApi.operational = false;
                    return await this.fetchPriceFromMaybeOperationalPriceApis(chainIdentifier, token, abortSignal);
                }
            }
            return await this.fetchPriceFromMaybeOperationalPriceApis(chainIdentifier, token, abortSignal);
        }, undefined, RequestError, abortSignal);
    }

    /**
     * @inheritDoc
     */
    protected getDecimals<C extends ChainIds<T>>(chainIdentifier: C, token: string): number | null {
        if(this.coinsDecimals[chainIdentifier]==null) return null;
        return this.coinsDecimals[chainIdentifier]?.[token.toString()] ?? null;
    }

    /**
     * Fetches BTC price in USD in parallel from multiple maybe operational price APIs
     *
     * @param abortSignal
     * @private
     */
    private async fetchUsdPriceFromMaybeOperationalPriceApis(abortSignal?: AbortSignal): Promise<number> {
        try {
            return await promiseAny<number>(this.getMaybeOperationalPriceApis().map(
                obj => (async () => {
                    try {
                        const price = await obj.priceApi.getUsdPrice(abortSignal);
                        logger.debug("fetchPrice(): USD price from "+obj.priceApi.constructor.name+": ", price.toString(10));
                        obj.operational = true;
                        return price;
                    } catch (e) {
                        if(abortSignal!=null) abortSignal.throwIfAborted();
                        obj.operational = false;
                        throw e;
                    }
                })()
            ))
        } catch (_e: any) {
            const e = _e as any[];
            if(abortSignal!=null) abortSignal.throwIfAborted();
            throw e.find(err => !(err instanceof RequestError)) || e[0];
        }
    }

    /**
     * Fetches the USD prices, first tries to use the operational price API (if any) and if that fails it falls back
     *  to using maybe operational price APIs
     *
     * @param abortSignal
     * @protected
     */
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number> {
        return tryWithRetries(() => {
            const operationalPriceApi = this.getOperationalPriceApi();
            if(operationalPriceApi!=null) {
                return operationalPriceApi.priceApi.getUsdPrice(abortSignal).catch(err => {
                    if(abortSignal!=null) abortSignal.throwIfAborted();
                    operationalPriceApi.operational = false;
                    return this.fetchUsdPriceFromMaybeOperationalPriceApis(abortSignal);
                });
            }
            return this.fetchUsdPriceFromMaybeOperationalPriceApis(abortSignal);
        }, undefined, RequestError, abortSignal);
    }

}