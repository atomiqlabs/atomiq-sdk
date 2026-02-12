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
     * Returns transactions for settling (claiming) the swap if the swap requires manual settlement, you can check
     *  so with {@link isClaimable}. After sending the transaction manually be sure to call the {@link waitTillClaimed}
     *  function to wait till the claim transaction is observed, processed by the SDK and state of the swap
     *  properly updated.
     *
     * @param _signer Address of the signer to create the refund transactions for
     */
    txsClaim(_signer?: string | T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    /**
     * Settles the swap by claiming the funds on the destination chain if the swap requires manual settlement,
     *  you can check so with {@link isClaimable}
     *
     * @param _signer Signer to use for signing the settlement transactions
     * @param abortSignal Abort signal
     * @param onBeforeTxSent Optional callback triggered before the claim transaction is broadcasted
     */
    claim(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void): Promise<string>;
    /**
     * Waits till the swap is successfully settled (claimed), should be called after sending the claim (settlement)
     *  transactions manually to wait till the SDK processes the settlement and updates the swap state accordingly
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal AbortSignal
     *
     * @returns {boolean} whether the swap was claimed in time or not
     */
    waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
}
