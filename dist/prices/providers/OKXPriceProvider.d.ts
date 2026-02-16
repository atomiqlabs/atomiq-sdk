import { CtorCoinTypes } from "../abstract/IPriceProvider";
import { ExchangePriceProvider } from "./abstract/ExchangePriceProvider";
import { MultiChain } from "../../swapper/Swapper";
export type OKXResponse = {
    code: string;
    msg: string;
    data: [
        {
            instId: string;
            idxPx: string;
            high24h: string;
            sodUtc0: string;
            open24h: string;
            low24h: string;
            sodUtc8: string;
            ts: string;
        }
    ];
};
/**
 * Price provider using OKX exchange API
 * @category Pricing and LPs
 */
export declare class OKXPriceProvider<T extends MultiChain> extends ExchangePriceProvider<T> {
    constructor(coinsMap: CtorCoinTypes<T>, url?: string, httpRequestTimeout?: number);
    /**
     * @inheritDoc
     */
    fetchPair(pair: string, abortSignal?: AbortSignal): Promise<number>;
    /**
     * @inheritDoc
     */
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
}
