"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinGeckoPriceProvider = void 0;
const HttpPriceProvider_js_1 = require("./abstract/HttpPriceProvider.js");
const HttpUtils_js_1 = require("../../http/HttpUtils.js");
/**
 * Price provider using CoinGecko API
 * @category Pricing
 */
class CoinGeckoPriceProvider extends HttpPriceProvider_js_1.HttpPriceProvider {
    constructor(coinsMap, url = "https://api.coingecko.com/api/v3", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPrice(token, abortSignal) {
        let response = await (0, HttpUtils_js_1.httpGet)(this.url + "/simple/price?ids=" + token.coinId + "&vs_currencies=sats&precision=6", this.httpRequestTimeout, abortSignal);
        return BigInt(response[token.coinId].sats * 1000000);
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        let response = await (0, HttpUtils_js_1.httpGet)(this.url + "/simple/price?ids=bitcoin&vs_currencies=usd&precision=9", this.httpRequestTimeout, abortSignal);
        return response["bitcoin"].usd / 100000000;
    }
}
exports.CoinGeckoPriceProvider = CoinGeckoPriceProvider;
