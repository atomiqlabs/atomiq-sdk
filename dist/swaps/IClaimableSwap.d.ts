import { ChainType } from "@atomiqlabs/base";
import { ISwap } from "./ISwap";
import { ISwapWrapper, SwapTypeDefinition } from "./ISwapWrapper";
/**
 * Type guard to check if an object is an {@link IClaimableSwap}
 *
 * @category Swaps
 */
export declare function isIClaimableSwap(obj: any): obj is IClaimableSwap;
/**
 * Interface for swaps that can end up in a claimable state, requiring the user to claim the
 *  assets on the destination chain.
 *
 * @category Swaps
 */
export interface IClaimableSwap<T extends ChainType = ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, IClaimableSwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, IClaimableSwap<T, any, any>>, S extends number = number> extends ISwap<T, D, S> {
    /**
     * Checks whether a swap currently requires a manual claiming (settlement)
     */
    isClaimable(): boolean;
    /**
     * Returns the smart chain transactions required to be signed and sent to settle the swap on the destination
     *  chain and claim the funds
     *
     * @param _signer Address of the signer to create the refund transactions for
     */
    txsClaim(_signer?: string | T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    /**
     * Settles the swap by claiming the funds on the destination chain
     *
     * @param _signer Signer to use for signing the transactions
     * @param abortSignal Abort signal
     */
    claim(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
}
