"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSwapWithGasDrop = void 0;
/**
 * Type guard to check if a swap has gas drop functionality
 * @category Swaps
 */
function isSwapWithGasDrop(swap) {
    return swap != null && typeof (swap.getGasDropOutput) === "function";
}
exports.isSwapWithGasDrop = isSwapWithGasDrop;
