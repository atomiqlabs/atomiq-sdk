"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIAddressSwap = void 0;
/**
 * Type guard to check if an object is an {@link IAddressSwap}
 *
 * @category Swaps/Types
 */
function isIAddressSwap(obj) {
    return obj != null &&
        typeof (obj.getAddress) === "function" &&
        typeof (obj.getHyperlink) === "function";
}
exports.isIAddressSwap = isIAddressSwap;
