"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIClaimableSwap = void 0;
/**
 * Type guard to check if an object is an {@link IClaimableSwap}
 *
 * @category Swaps
 */
function isIClaimableSwap(obj) {
    return obj != null &&
        typeof (obj.isClaimable) === "function" &&
        typeof (obj.txsClaim) === "function" &&
        typeof (obj.claim) === "function";
}
exports.isIClaimableSwap = isIClaimableSwap;
