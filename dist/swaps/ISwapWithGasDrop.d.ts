import { ChainType } from "@atomiqlabs/base";
import { TokenAmount } from "../types/TokenAmount";
import { SCToken } from "../types/Token";
export declare function isSwapWithGasDrop(swap: any): swap is ISwapWithGasDrop<any>;
export interface ISwapWithGasDrop<T extends ChainType> {
    getGasDropOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>>;
}
