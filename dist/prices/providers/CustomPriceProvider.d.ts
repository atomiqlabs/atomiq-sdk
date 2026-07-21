import { CoinType, CtorCoinTypes, IPriceProvider } from "../abstract/IPriceProvider.js";
import { MultiChain } from "../../swapper/Swapper.js";
import { CustomPriceFunction } from "../../types/CustomPriceFunction.js";
/**
 * Price provider using custom pricing function
 *
 * @category Pricing
 */
export declare class CustomPriceProvider<T extends MultiChain> extends IPriceProvider<T> {
    readonly getUsdPriceFn: CustomPriceFunction;
    /**
     * @param coinsMap Mapping of token tickers to token addresses
     * @param getUsdPriceFn Pricing function, used to retrieve USD prices of the tokens
     */
    constructor(coinsMap: CtorCoinTypes<T>, getUsdPriceFn: CustomPriceFunction);
    /**
     * @inheritDoc
     */
    protected fetchPrice(token: CoinType, abortSignal?: AbortSignal): Promise<bigint>;
    /**
     * @inheritDoc
     */
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
}
