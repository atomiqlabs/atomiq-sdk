import { HttpPriceProvider } from "./HttpPriceProvider.js";
import { CoinType } from "../../abstract/IPriceProvider.js";
import { MultiChain } from "../../../swapper/Swapper.js";
export declare abstract class ExchangePriceProvider<T extends MultiChain> extends HttpPriceProvider<T> {
    /**
     * Fetches the price on the specific exchange pair
     *
     * @param pair
     * @param abortSignal
     * @protected
     */
    protected abstract fetchPair(pair: string, abortSignal?: AbortSignal): Promise<number>;
    /**
     * @inheritDoc
     */
    protected fetchPrice(token: CoinType, abortSignal?: AbortSignal): Promise<bigint>;
}
