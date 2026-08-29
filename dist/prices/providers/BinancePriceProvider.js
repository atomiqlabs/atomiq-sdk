"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinancePriceProvider = void 0;
const ExchangePriceProvider_js_1 = require("./abstract/ExchangePriceProvider.js");
const HttpUtils_js_1 = require("../../http/HttpUtils.js");
/**
 * Price provider using Binance exchange API
 *
 * @category Pricing
 */
class BinancePriceProvider extends ExchangePriceProvider_js_1.ExchangePriceProvider {
    constructor(coinsMap, url = "https://api.binance.com/api/v3", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPair(pair, abortSignal) {
        const response = await (0, HttpUtils_js_1.httpGet)(this.url + "/ticker/price?symbol=" + pair, this.httpRequestTimeout, abortSignal);
        return parseFloat(response.price);
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const response = await (0, HttpUtils_js_1.httpGet)(this.url + "/ticker/price?symbol=BTCUSDC", this.httpRequestTimeout, abortSignal);
        return parseFloat(response.price) / 100000000;
    }
}
exports.BinancePriceProvider = BinancePriceProvider;
