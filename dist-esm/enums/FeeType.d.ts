/**
 * Enum representing types of fees in a swap
 *
 * @category Pricing
 */
export declare enum FeeType {
    /**
     * Swap fee taken by the LP
     */
    SWAP = 0,
    /**
     * Network fee to cover the transactions on the destination (output) network
     */
    NETWORK_OUTPUT = 1,
    /**
     * Bitcoin input-side network fee paid by externally funded SPV swaps
     */
    NETWORK_INPUT = 2
}
