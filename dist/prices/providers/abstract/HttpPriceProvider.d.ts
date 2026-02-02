import { CtorCoinTypes, IPriceProvider } from "../../abstract/IPriceProvider";
import { MultiChain } from "../../../swapper/Swapper";
export declare abstract class HttpPriceProvider<T extends MultiChain> extends IPriceProvider<T> {
    url: string;
    httpRequestTimeout?: number;
    protected constructor(coinsMap: CtorCoinTypes<T>, url: string, httpRequestTimeout?: number);
}
