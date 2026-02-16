import { CtorCoinTypes } from "../abstract/IPriceProvider";
import { ExchangePriceProvider } from "./abstract/ExchangePriceProvider";
import { MultiChain } from "../../swapper/Swapper";
export type BinanceResponse = {
    symbol: string;
    price: string;
};
/**
 * Price provider using Binance exchange API
 *
 * @category Pricing
 */
export declare class BinancePriceProvider<T extends MultiChain> extends ExchangePriceProvider<T> {
    constructor(coinsMap: CtorCoinTypes<T>, url?: string, httpRequestTimeout?: number);
    /**
     * @inheritDoc
     */
    protected fetchPair(pair: string, abortSignal?: AbortSignal): Promise<number>;
    /**
     * @inheritDoc
     */
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
}
