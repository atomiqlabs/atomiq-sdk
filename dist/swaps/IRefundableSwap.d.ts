import { ChainType } from "@atomiqlabs/base";
import { ISwap } from "./ISwap";
import { ISwapWrapper, SwapTypeDefinition } from "./ISwapWrapper";
/**
 * Type guard to check if an object is an IRefundableSwap
 * @category Swaps
 */
export declare function isIRefundableSwap(obj: any): obj is IRefundableSwap;
/**
 * Interface for swaps that can be refunded
 * @category Swaps
 */
export interface IRefundableSwap<T extends ChainType = ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, IRefundableSwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, IRefundableSwap<T, any, any>>, S extends number = number> extends ISwap<T, D, S> {
    isRefundable(): boolean;
    txsRefund(_signer?: T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    refund(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
}
