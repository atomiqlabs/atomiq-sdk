import { ChainType } from "@atomiqlabs/base";
import { ISwap } from "./ISwap";
import { ISwapWrapper, SwapTypeDefinition } from "./ISwapWrapper";
/**
 * Type guard to check if an object is an {@link IRefundableSwap}
 *
 * @category Swaps
 */
export declare function isIRefundableSwap(obj: any): obj is IRefundableSwap;
/**
 * Interface for swaps that can be refunded in case of failure
 *
 * @category Swaps
 */
export interface IRefundableSwap<T extends ChainType = ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, IRefundableSwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, IRefundableSwap<T, any, any>>, S extends number = number> extends ISwap<T, D, S> {
    /**
     * Checks whether a swap is currently refundable
     */
    isRefundable(): boolean;
    /**
     * Returns the smart chain transactions required to be signed and sent to refund the swap
     *
     * @param _signer Address of the signer to create the refund transactions for
     */
    txsRefund(_signer?: string): Promise<T["TX"][]>;
    /**
     * Refunds the swap
     *
     * @param _signer Signer to use for signing the transactions
     * @param abortSignal Abort signal
     */
    refund(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
}
