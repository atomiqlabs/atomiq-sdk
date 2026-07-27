/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */

/**
 * State enum for trusted on-chain gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export enum OnchainForGasSwapState {
    /**
     * The swap quote expired without user sending in the BTC
     */
    EXPIRED = -3,
    /**
     * The swap has failed after the intermediary already received the BTC on the source chain
     */
    FAILED = -2,
    /**
     * Swap was refunded and BTC returned to the user's refund address
     */
    REFUNDED = -1,
    /**
     * Swap was created, send the BTC to the swap address
     */
    PR_CREATED = 0,
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    FINISHED = 1,
    /**
     * Swap is refundable because the intermediary cannot honor the swap request on the destination chain
     */
    REFUNDABLE = 2
}
