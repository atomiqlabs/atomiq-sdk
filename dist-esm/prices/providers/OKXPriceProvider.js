import { ExchangePriceProvider } from "./abstract/ExchangePriceProvider";
import { httpGet } from "../../http/HttpUtils";
/**
 * Price provider using OKX exchange API
 * @category Pricing
 */
export class OKXPriceProvider extends ExchangePriceProvider {
    constructor(coinsMap, url = "https://www.okx.com/api/v5", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPair(pair, abortSignal) {
        const response = await httpGet(this.url + "/market/index-tickers?instId=" + pair, this.httpRequestTimeout, abortSignal);
        return parseFloat(response.data[0].idxPx);
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const response = await httpGet(this.url + "/market/index-tickers?instId=BTC-USD", this.httpRequestTimeout, abortSignal);
        return parseFloat(response.data[0].idxPx) / 100000000;
    }
}
