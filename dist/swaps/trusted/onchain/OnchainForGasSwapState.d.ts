/**
 * State enum for trusted on-chain gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare enum OnchainForGasSwapState {
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
