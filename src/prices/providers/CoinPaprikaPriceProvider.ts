import {CoinType, CtorCoinTypes} from "../abstract/IPriceProvider";
import {HttpPriceProvider} from "./abstract/HttpPriceProvider";
import {MultiChain} from "../../swapper/Swapper";
import {httpGet} from "../../http/HttpUtils";

export type CoinPaprikaResponse<Currency extends string> = {
    quotes: {
        [curr in Currency]: {
            price: number
        }
    }
};

/**
 * Price provider using CoinPaprika API
 * @category Pricing and LPs
 */
export class CoinPaprikaPriceProvider<T extends MultiChain> extends HttpPriceProvider<T> {

    constructor(coinsMap: CtorCoinTypes<T>, url: string = "https://api.coinpaprika.com/v1", httpRequestTimeout?: number) {
        super(coinsMap, url, httpRequestTimeout);
    }

    /**
     * @inheritDoc
     */
    async fetchPrice(token: CoinType, abortSignal?: AbortSignal) {
        const response = await httpGet<CoinPaprikaResponse<"BTC">>(
            this.url+"/tickers/"+token.coinId+"?quotes=BTC",
            this.httpRequestTimeout,
            abortSignal
        );

        return BigInt(Math.floor(response.quotes.BTC.price*100000000000000));
    }

    /**
     * @inheritDoc
     */
    protected async fetchUsdPrice(abortSignal?: AbortSignal): Promise<number> {
        const response = await httpGet<CoinPaprikaResponse<"USD">>(
            this.url+"/tickers/btc-bitcoin?quotes=USD",
            this.httpRequestTimeout,
            abortSignal
        );

        return response.quotes.USD.price/100000000;
    }

}