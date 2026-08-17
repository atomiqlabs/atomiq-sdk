"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpPriceProvider = void 0;
const IPriceProvider_js_1 = require("../../abstract/IPriceProvider.js");
class HttpPriceProvider extends IPriceProvider_js_1.IPriceProvider {
    constructor(coinsMap, url, httpRequestTimeout) {
        super(coinsMap);
        this.url = url;
        this.httpRequestTimeout = httpRequestTimeout;
    }
}
exports.HttpPriceProvider = HttpPriceProvider;
