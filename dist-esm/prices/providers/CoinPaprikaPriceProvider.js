import { HttpPriceProvider } from "./abstract/HttpPriceProvider";
import { httpGet } from "../../http/HttpUtils";
/**
 * Price provider using CoinPaprika API
 * @category Pricing
 */
export class CoinPaprikaPriceProvider extends HttpPriceProvider {
    constructor(coinsMap, url = "https://api.coinpaprika.com/v1", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPrice(token, abortSignal) {
        const response = await httpGet(this.url + "/tickers/" + token.coinId + "?quotes=BTC", this.httpRequestTimeout, abortSignal);
        return BigInt(Math.floor(response.quotes.BTC.price * 100000000000000));
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const response = await httpGet(this.url + "/tickers/btc-bitcoin?quotes=USD", this.httpRequestTimeout, abortSignal);
        return response.quotes.USD.price / 100000000;
    }
}
