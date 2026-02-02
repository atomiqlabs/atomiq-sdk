import { CoinType, CtorCoinTypes, IPriceProvider } from "../abstract/IPriceProvider";
import { MultiChain } from "../../swapper/Swapper";
import { CustomPriceFunction } from "../../types/CustomPriceFunction";
/**
 * Price provider using custom pricing function
 * @category Pricing and LPs
 */
export declare class CustomPriceProvider<T extends MultiChain> extends IPriceProvider<T> {
    readonly getUsdPriceFn: CustomPriceFunction;
    constructor(coinsMap: CtorCoinTypes<T>, getUsdPriceFn: CustomPriceFunction);
    protected fetchPrice(token: CoinType, abortSignal?: AbortSignal): Promise<bigint>;
    protected fetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
}
