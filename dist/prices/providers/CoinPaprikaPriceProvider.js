"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinPaprikaPriceProvider = void 0;
const HttpPriceProvider_js_1 = require("./abstract/HttpPriceProvider.js");
const HttpUtils_js_1 = require("../../http/HttpUtils.js");
/**
 * Price provider using CoinPaprika API
 * @category Pricing
 */
class CoinPaprikaPriceProvider extends HttpPriceProvider_js_1.HttpPriceProvider {
    constructor(coinsMap, url = "https://api.coinpaprika.com/v1", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPrice(token, abortSignal) {
        const response = await (0, HttpUtils_js_1.httpGet)(this.url + "/tickers/" + token.coinId + "?quotes=BTC", this.httpRequestTimeout, abortSignal);
        return BigInt(Math.floor(response.quotes.BTC.price * 100000000000000));
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const response = await (0, HttpUtils_js_1.httpGet)(this.url + "/tickers/btc-bitcoin?quotes=USD", this.httpRequestTimeout, abortSignal);
        return response.quotes.USD.price / 100000000;
    }
}
exports.CoinPaprikaPriceProvider = CoinPaprikaPriceProvider;
