import { HttpPriceProvider } from "./abstract/HttpPriceProvider.js";
import { httpGet } from "../../http/HttpUtils.js";
/**
 * Price provider using CoinGecko API
 * @category Pricing
 */
export class CoinGeckoPriceProvider extends HttpPriceProvider {
    constructor(coinsMap, url = "https://api.coingecko.com/api/v3", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPrice(token, abortSignal) {
        let response = await httpGet(this.url + "/simple/price?ids=" + token.coinId + "&vs_currencies=sats&precision=6", this.httpRequestTimeout, abortSignal);
        return BigInt(response[token.coinId].sats * 1000000);
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        let response = await httpGet(this.url + "/simple/price?ids=bitcoin&vs_currencies=usd&precision=9", this.httpRequestTimeout, abortSignal);
        return response["bitcoin"].usd / 100000000;
    }
}
