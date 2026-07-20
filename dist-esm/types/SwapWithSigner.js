import { IToBTCSwap } from "../swaps/escrow_swaps/tobtc/IToBTCSwap";
import { IFromBTCSelfInitSwap } from "../swaps/escrow_swaps/frombtc/IFromBTCSelfInitSwap";
import { FromBTCLNSwap } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap";
import { FromBTCLNAutoSwap } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap";
import { SpvFromBTCSwap } from "../swaps/spv_swaps/SpvFromBTCSwap";
/**
 * Wraps a swap with automatic signer injection for methods like commit, refund, and claim
 *
 * @category Swaps
 * @internal
 */
export function wrapSwapWithSigner(swap, signer) {
    return new Proxy(swap, {
        get: (target, prop, receiver) => {
            if (prop === "commit") {
                if (swap instanceof IToBTCSwap || swap instanceof IFromBTCSelfInitSwap) {
                    return (abortSignal, skipChecks) => swap.commit(signer, abortSignal, skipChecks);
                }
            }
            if (prop === "refund") {
                if (swap instanceof IToBTCSwap) {
                    return (abortSignal) => swap.refund(signer, abortSignal);
                }
            }
            if (prop === "claim") {
                if (swap instanceof IFromBTCSelfInitSwap || swap instanceof FromBTCLNAutoSwap || swap instanceof SpvFromBTCSwap) {
                    return (abortSignal) => swap.claim(signer, abortSignal);
                }
            }
            if (prop === "commitAndClaim") {
                if (swap instanceof FromBTCLNSwap) {
                    return (abortSignal, skipChecks) => swap.commitAndClaim(signer, abortSignal, skipChecks);
                }
            }
            // Delegate other properties and methods to the original instance
            return Reflect.get(target, prop, receiver);
        }
    });
}
