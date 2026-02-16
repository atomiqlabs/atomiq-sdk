"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapSwapWithSigner = void 0;
const IToBTCSwap_1 = require("../swaps/escrow_swaps/tobtc/IToBTCSwap");
const IFromBTCSelfInitSwap_1 = require("../swaps/escrow_swaps/frombtc/IFromBTCSelfInitSwap");
const FromBTCLNSwap_1 = require("../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap");
const FromBTCLNAutoSwap_1 = require("../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap");
const SpvFromBTCSwap_1 = require("../swaps/spv_swaps/SpvFromBTCSwap");
/**
 * Wraps a swap with automatic signer injection for methods like commit, refund, and claim
 *
 * @category Swaps
 * @internal
 */
function wrapSwapWithSigner(swap, signer) {
    return new Proxy(swap, {
        get: (target, prop, receiver) => {
            if (prop === "commit") {
                if (swap instanceof IToBTCSwap_1.IToBTCSwap || swap instanceof IFromBTCSelfInitSwap_1.IFromBTCSelfInitSwap) {
                    return (abortSignal, skipChecks) => swap.commit(signer, abortSignal, skipChecks);
                }
            }
            if (prop === "refund") {
                if (swap instanceof IToBTCSwap_1.IToBTCSwap) {
                    return (abortSignal) => swap.refund(signer, abortSignal);
                }
            }
            if (prop === "claim") {
                if (swap instanceof IFromBTCSelfInitSwap_1.IFromBTCSelfInitSwap || swap instanceof FromBTCLNAutoSwap_1.FromBTCLNAutoSwap || swap instanceof SpvFromBTCSwap_1.SpvFromBTCSwap) {
                    return (abortSignal) => swap.claim(signer, abortSignal);
                }
            }
            if (prop === "commitAndClaim") {
                if (swap instanceof FromBTCLNSwap_1.FromBTCLNSwap) {
                    return (abortSignal, skipChecks) => swap.commitAndClaim(signer, abortSignal, skipChecks);
                }
            }
            // Delegate other properties and methods to the original instance
            return Reflect.get(target, prop, receiver);
        }
    });
}
exports.wrapSwapWithSigner = wrapSwapWithSigner;
