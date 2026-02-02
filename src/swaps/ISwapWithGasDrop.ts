import {ChainType} from "@atomiqlabs/base";
import {TokenAmount} from "../types/TokenAmount";
import {SCToken} from "../types/Token";

/**
 * Type guard to check if a swap has gas drop functionality
 * @category Swaps
 */
export function isSwapWithGasDrop(swap: any): swap is ISwapWithGasDrop<any> {
    return swap!=null && typeof(swap.getGasDropOutput)==="function";
}

/**
 * Interface for swaps with gas drop functionality
 * @category Swaps
 */
export interface ISwapWithGasDrop<T extends ChainType> {
    getGasDropOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>>;
}
