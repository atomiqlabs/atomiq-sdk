import { ChainType } from "@atomiqlabs/base";
import { TokenAmount } from "../types/TokenAmount.js";
import { SCToken } from "../types/Token.js";
/**
 * Type guard to check if a swap has gas drop functionality
 *
 * @category Swaps/Types
 */
export declare function isSwapWithGasDrop(swap: any): swap is ISwapWithGasDrop<any>;
/**
 * Interface for swaps with gas drop functionality
 *
 * @category Swaps/Types
 */
export interface ISwapWithGasDrop<T extends ChainType> {
    /**
     * Returns the output of the "gas drop", additional native token received by the user on
     *  the destination chain
     */
    getGasDropOutput(): TokenAmount<SCToken<T["ChainId"]>>;
}
