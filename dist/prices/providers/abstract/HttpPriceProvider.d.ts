import { CtorCoinTypes, IPriceProvider } from "../../abstract/IPriceProvider.js";
import { MultiChain } from "../../../swapper/Swapper.js";
export declare abstract class HttpPriceProvider<T extends MultiChain> extends IPriceProvider<T> {
    url: string;
    httpRequestTimeout?: number;
    protected constructor(coinsMap: CtorCoinTypes<T>, url: string, httpRequestTimeout?: number);
}
