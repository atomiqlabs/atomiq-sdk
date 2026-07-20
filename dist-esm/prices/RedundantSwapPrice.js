import { BinancePriceProvider } from "./providers/BinancePriceProvider";
import { OKXPriceProvider } from "./providers/OKXPriceProvider";
import { CoinGeckoPriceProvider } from "./providers/CoinGeckoPriceProvider";
import { CoinPaprikaPriceProvider } from "./providers/CoinPaprikaPriceProvider";
import { promiseAny } from "../utils/Utils";
import { ICachedSwapPrice } from "./abstract/ICachedSwapPrice";
import { RequestError } from "../errors/RequestError";
import { KrakenPriceProvider } from "./providers/KrakenPriceProvider";
import { getLogger } from "../utils/Logger";
import { tryWithRetries } from "../utils/RetryUtils";
const logger = getLogger("RedundantSwapPrice: ");
/**
 * Swap price API using multiple price sources, handles errors on the APIs and automatically switches between them, such
 *  that there always is a functional API
 *
 * @category Pricing
 */
export class RedundantSwapPrice extends ICachedSwapPrice {
    /**
     * Creates a new {@link RedundantSwapPrice} instance from an asset list and other data, using all
     *  the available price providers: {@link BinancePriceProvider}, {@link OKXPriceProvider},
     *  {@link CoinGeckoPriceProvider}, {@link CoinPaprikaPriceProvider}, {@link KrakenPriceProvider}
     *
     * @param maxAllowedFeeDiffPPM Maximum allowed price difference between returned swap prices & market prices
     * @param assets Specifications of the assets
     * @param cacheTimeout Timeout of the internal cache holding prices
     */
    static createFromTokenMap(maxAllowedFeeDiffPPM, assets, cacheTimeout) {
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
    constructor(maxAllowedFeeDiffPPM, coinsDecimals, priceApis, cacheTimeout) {
        super(maxAllowedFeeDiffPPM, cacheTimeout);
        this.coinsDecimals = {};
        for (let coinData of coinsDecimals) {
            for (let chainId in coinData.chains) {
                const { address, decimals } = coinData.chains[chainId];
                this.coinsDecimals[chainId] ??= {};
                this.coinsDecimals[chainId][address.toString()] = decimals;
            }
        }
        this.priceApis = priceApis.map(api => {
            return {
                priceApi: api
            };
        });
    }
    /**
     * Returns price api that should be operational
     *
     * @private
     */
    getOperationalPriceApi() {
        return this.priceApis.find(e => e.operational === true);
    }
    /**
     * Returns price apis that are maybe operational, in case none is considered operational returns all of the price
     *  apis such that they can be tested again whether they are operational
     *
     * @private
     */
    getMaybeOperationalPriceApis() {
        let operational = this.priceApis.filter(e => e.operational === true || e.operational === undefined);
        if (operational.length === 0) {
            this.priceApis.forEach(e => e.operational = undefined);
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
    async fetchPriceFromMaybeOperationalPriceApis(chainIdentifier, token, abortSignal) {
        try {
            return await promiseAny(this.getMaybeOperationalPriceApis().map(obj => (async () => {
                try {
                    const price = await obj.priceApi.getPrice(chainIdentifier, token, abortSignal);
                    logger.debug("fetchPrice(): Price from " + obj.priceApi.constructor.name + ": ", price.toString(10));
                    obj.operational = true;
                    return price;
                }
                catch (e) {
                    if (abortSignal != null)
                        abortSignal.throwIfAborted();
                    obj.operational = false;
                    throw e;
                }
            })()));
        }
        catch (_e) {
            const e = _e;
            if (abortSignal != null)
                abortSignal.throwIfAborted();
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
    fetchPrice(chainIdentifier, token, abortSignal) {
        return tryWithRetries(async () => {
            const operationalPriceApi = this.getOperationalPriceApi();
            if (operationalPriceApi != null) {
                try {
                    return await operationalPriceApi.priceApi.getPrice(chainIdentifier, token, abortSignal);
                }
                catch (err) {
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
    getDecimals(chainIdentifier, token) {
        if (this.coinsDecimals[chainIdentifier] == null)
            return null;
        return this.coinsDecimals[chainIdentifier]?.[token.toString()] ?? null;
    }
    /**
     * Fetches BTC price in USD in parallel from multiple maybe operational price APIs
     *
     * @param abortSignal
     * @private
     */
    async fetchUsdPriceFromMaybeOperationalPriceApis(abortSignal) {
        try {
            return await promiseAny(this.getMaybeOperationalPriceApis().map(obj => (async () => {
                try {
                    const price = await obj.priceApi.getUsdPrice(abortSignal);
                    logger.debug("fetchPrice(): USD price from " + obj.priceApi.constructor.name + ": ", price.toString(10));
                    obj.operational = true;
                    return price;
                }
                catch (e) {
                    if (abortSignal != null)
                        abortSignal.throwIfAborted();
                    obj.operational = false;
                    throw e;
                }
            })()));
        }
        catch (_e) {
            const e = _e;
            if (abortSignal != null)
                abortSignal.throwIfAborted();
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
    fetchUsdPrice(abortSignal) {
        return tryWithRetries(() => {
            const operationalPriceApi = this.getOperationalPriceApi();
            if (operationalPriceApi != null) {
                return operationalPriceApi.priceApi.getUsdPrice(abortSignal).catch(err => {
                    if (abortSignal != null)
                        abortSignal.throwIfAborted();
                    operationalPriceApi.operational = false;
                    return this.fetchUsdPriceFromMaybeOperationalPriceApis(abortSignal);
                });
            }
            return this.fetchUsdPriceFromMaybeOperationalPriceApis(abortSignal);
        }, undefined, RequestError, abortSignal);
    }
}
