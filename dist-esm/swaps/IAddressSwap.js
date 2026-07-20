/**
 * Type guard to check if an object is an {@link IAddressSwap}
 *
 * @category Swaps/Types
 */
export function isIAddressSwap(obj) {
    return obj != null &&
        typeof (obj.getAddress) === "function" &&
        typeof (obj.getHyperlink) === "function";
}
