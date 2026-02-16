import {ISwap} from "../swaps/ISwap";
import {ChainType} from "@atomiqlabs/base";
import {IToBTCSwap} from "../swaps/escrow_swaps/tobtc/IToBTCSwap";
import {IFromBTCSelfInitSwap} from "../swaps/escrow_swaps/frombtc/IFromBTCSelfInitSwap";
import {FromBTCLNSwap} from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap";
import {FromBTCLNAutoSwap} from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap";
import {SpvFromBTCSwap} from "../swaps/spv_swaps/SpvFromBTCSwap";

/**
 * Proxy type that auto-injects a smart chain signer into swap methods
 *
 * @category Swaps
 */
export type SwapWithSigner<T extends ISwap> = {
    [K in keyof T]:
        K extends "commit" ? (abortSignal?: AbortSignal, skipChecks?: boolean) => Promise<string> :
        K extends "refund" ? (abortSignal?: AbortSignal) => Promise<string> :
        K extends "claim" ? (abortSignal?: AbortSignal) => Promise<string> :
        K extends "commitAndClaim" ? (abortSignal?: AbortSignal, skipChecks?: boolean) => Promise<string> :
            T[K];
};

/**
 * Wraps a swap with automatic signer injection for methods like commit, refund, and claim
 *
 * @category Swaps
 * @internal
 */
export function wrapSwapWithSigner<C extends ChainType, T extends ISwap<C>>(swap: T, signer: C["Signer"]): SwapWithSigner<T> {
    return new Proxy(swap, {
        get: (target, prop, receiver) => {
            if (prop === "commit") {
                if(swap instanceof IToBTCSwap || swap instanceof IFromBTCSelfInitSwap) {
                    return (abortSignal?: AbortSignal, skipChecks?: boolean) =>
                        swap.commit(signer, abortSignal, skipChecks);
                }
            }
            if (prop === "refund") {
                if(swap instanceof IToBTCSwap) {
                    return (abortSignal?: AbortSignal) =>
                        swap.refund(signer, abortSignal);
                }
            }
            if (prop === "claim") {
                if(swap instanceof IFromBTCSelfInitSwap || swap instanceof FromBTCLNAutoSwap || swap instanceof SpvFromBTCSwap) {
                    return (abortSignal?: AbortSignal) =>
                        swap.claim(signer, abortSignal);
                }
            }
            if (prop === "commitAndClaim") {
                if(swap instanceof FromBTCLNSwap) {
                    return (abortSignal?: AbortSignal, skipChecks?: boolean) =>
                        swap.commitAndClaim(signer, abortSignal, skipChecks);
                }
            }

            // Delegate other properties and methods to the original instance
            return Reflect.get(target, prop, receiver);
        }
    }) as SwapWithSigner<T>;
}
