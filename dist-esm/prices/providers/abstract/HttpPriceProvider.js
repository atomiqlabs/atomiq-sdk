import { IPriceProvider } from "../../abstract/IPriceProvider";
export class HttpPriceProvider extends IPriceProvider {
    constructor(coinsMap, url, httpRequestTimeout) {
        super(coinsMap);
        this.url = url;
        this.httpRequestTimeout = httpRequestTimeout;
    }
}
