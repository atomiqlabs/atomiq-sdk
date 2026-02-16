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
     * Returns transactions for refunding the swap if the swap is in refundable state, you can check so with
     *  {@link isRefundable}. After sending the transaction manually be sure to call the {@link waitTillRefunded}
     *  function to wait till the refund transaction is observed, processed by the SDK and state of the swap
     *  properly updated.
     *
     * @param _signer Address of the signer to create the refund transactions for
     */
    txsRefund(_signer?: string): Promise<T["TX"][]>;
    /**
     * Refunds the swap if the swap is in refundable state, you can check so with {@link isRefundable}
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal
     */
    refund(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
    /**
     * Waits till a swap is refunded, should be called after sending the refund transactions manually to
     *  wait till the SDK processes the refund and updates the swap state accordingly
     *
     * @param abortSignal AbortSignal
     */
    waitTillRefunded(abortSignal?: AbortSignal): Promise<void>;
}
