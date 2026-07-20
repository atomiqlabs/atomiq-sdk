/**
 * Type guard to check if an object is an {@link IClaimableSwap}
 *
 * @category Swaps/Types
 */
export function isIClaimableSwap(obj) {
    return obj != null &&
        typeof (obj.isClaimable) === "function" &&
        typeof (obj.txsClaim) === "function" &&
        typeof (obj.claim) === "function";
}
