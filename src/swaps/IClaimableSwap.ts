import {ChainType} from "@atomiqlabs/base";
import {ISwap} from "./ISwap";
import {ISwapWrapper, SwapTypeDefinition} from "./ISwapWrapper";

/**
 * Type guard to check if an object is an IClaimableSwap
 * @category Swaps
 */
export function isIClaimableSwap(obj: any): obj is IClaimableSwap {
    return obj!=null &&
        typeof(obj.isClaimable) === "function" &&
        typeof(obj.txsClaim) === "function" &&
        typeof(obj.claim) === "function";
}

/**
 * Interface for swaps that can be claimed
 * @category Swaps
 */
export interface IClaimableSwap<
    T extends ChainType = ChainType,
    D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, IClaimableSwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, IClaimableSwap<T, any, any>>,
    S extends number = number
> extends ISwap<T, D, S> {

    isClaimable(): boolean;
    txsClaim(_signer?: T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    claim(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;

}
