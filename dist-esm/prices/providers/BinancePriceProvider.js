import { ExchangePriceProvider } from "./abstract/ExchangePriceProvider.js";
import { httpGet } from "../../http/HttpUtils.js";
/**
 * Price provider using Binance exchange API
 *
 * @category Pricing
 */
export class BinancePriceProvider extends ExchangePriceProvider {
    constructor(coinsMap, url = "https://api.binance.com/api/v3", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPair(pair, abortSignal) {
        const response = await httpGet(this.url + "/ticker/price?symbol=" + pair, this.httpRequestTimeout, abortSignal);
        return parseFloat(response.price);
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const response = await httpGet(this.url + "/ticker/price?symbol=BTCUSDC", this.httpRequestTimeout, abortSignal);
        return parseFloat(response.price) / 100000000;
    }
}
