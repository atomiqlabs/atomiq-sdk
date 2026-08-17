import {ISwap} from "./ISwap.js";
import {IClaimableSwap} from "./IClaimableSwap.js";

/**
 * Interface for a swap wrapper for swaps that can end up in a claimable state, requiring the user to claim the
 *  assets on the destination chain.
 *
 * @category Swaps/Abstract
 */
export interface IClaimableSwapWrapper<T extends ISwap & IClaimableSwap = ISwap & IClaimableSwap> {

    /**
     * A list of swap states when the swap is potentially claimable
     * @internal
     */
    _claimableSwapStates: T["_state"][];

}