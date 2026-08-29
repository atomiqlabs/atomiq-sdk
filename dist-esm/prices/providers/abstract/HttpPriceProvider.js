import { IPriceProvider } from "../../abstract/IPriceProvider.js";
export class HttpPriceProvider extends IPriceProvider {
    constructor(coinsMap, url, httpRequestTimeout) {
        super(coinsMap);
        this.url = url;
        this.httpRequestTimeout = httpRequestTimeout;
    }
}
