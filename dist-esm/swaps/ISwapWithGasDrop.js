/**
 * Type guard to check if a swap has gas drop functionality
 *
 * @category Swaps/Types
 */
export function isSwapWithGasDrop(swap) {
    return swap != null && typeof (swap.getGasDropOutput) === "function";
}
