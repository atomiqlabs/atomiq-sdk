"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OKXPriceProvider = void 0;
const ExchangePriceProvider_1 = require("./abstract/ExchangePriceProvider");
const HttpUtils_1 = require("../../http/HttpUtils");
/**
 * Price provider using OKX exchange API
 * @category Pricing
 */
class OKXPriceProvider extends ExchangePriceProvider_1.ExchangePriceProvider {
    constructor(coinsMap, url = "https://www.okx.com/api/v5", httpRequestTimeout) {
        super(coinsMap, url, httpRequestTimeout);
    }
    /**
     * @inheritDoc
     */
    async fetchPair(pair, abortSignal) {
        const response = await (0, HttpUtils_1.httpGet)(this.url + "/market/index-tickers?instId=" + pair, this.httpRequestTimeout, abortSignal);
        return parseFloat(response.data[0].idxPx);
    }
    /**
     * @inheritDoc
     */
    async fetchUsdPrice(abortSignal) {
        const response = await (0, HttpUtils_1.httpGet)(this.url + "/market/index-tickers?instId=BTC-USD", this.httpRequestTimeout, abortSignal);
        return parseFloat(response.data[0].idxPx) / 100000000;
    }
}
exports.OKXPriceProvider = OKXPriceProvider;
