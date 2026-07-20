import { IPriceProvider } from "../abstract/IPriceProvider";
/**
 * Price provider using custom pricing function
 *
 * @category Pricing
 */
export class CustomPriceProvider extends IPriceProvider {
    /**
     * @param coinsMap Mapping of token tickers to token addresses
     * @param getUsdPriceFn Pricing function, used to retrieve USD prices of the tokens
     */
    constructor(coinsMap, getUsdPriceFn) {
        super(coinsMap);
        this.getUsdPriceFn = getUsdPriceFn;
    }
    /**
     * @inheritDoc
     */
    async fetchPrice(token, abortSignal) {
        const [btcPrice, tokenPrice] = await this.getUsdPriceFn(["BTC", token.coinId], abortSignal);
        const priceInBtc = tokenPrice / btcPrice;
        return BigInt(Math.floor(priceInBtc * 100000000 * 1000000));
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const [btcPrice] = await this.getUsdPriceFn(["BTC"], abortSignal);
        return btcPrice / 100000000;
    }
}
