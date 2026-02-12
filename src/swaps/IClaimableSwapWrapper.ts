import {ISwap} from "./ISwap";
import {IClaimableSwap} from "./IClaimableSwap";

/**
 * Interface for a swap wrapper for swaps that can end up in a claimable state, requiring the user to claim the
 *  assets on the destination chain.
 *
 * @category Swaps
 */
export interface IClaimableSwapWrapper<T extends ISwap & IClaimableSwap = ISwap & IClaimableSwap> {

    /**
     * A list of swap states when the swap is potentially claimable
     * @internal
     */
    _claimableSwapStates: T["_state"][];

}