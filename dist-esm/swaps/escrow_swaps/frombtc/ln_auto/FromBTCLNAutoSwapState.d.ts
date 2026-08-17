/**
 * State enum for FromBTCLNAuto swaps
 * @category Swaps/Lightning → Smart chain
 */
export declare enum FromBTCLNAutoSwapState {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FAILED = -4,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -3,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -2,
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    EXPIRED = -1,
    /**
     * Swap quote was created, use {@link FromBTCLNAutoSwap.getAddress} or {@link FromBTCLNAutoSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNAutoSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP) and the destination HTLC escrow is created
     */
    PR_CREATED = 0,
    /**
     * Lightning network payment has been received by the intermediary (LP), but the destination chain
     *  HTLC escrow hasn't been created yet. Use {@link FromBTCLNAutoSwap.waitForPayment} to continue waiting
     *  till the destination HTLC escrow is created.
     */
    PR_PAID = 1,
    /**
     * Swap escrow HTLC has been created on the destination chain, wait for automatic settlement by the watchtowers
     *  using the {@link FromBTCLNAutoSwap.waitTillClaimed} function or settle manually using the
     *  {@link FromBTCLNAutoSwap.claim} or {@link FromBTCLNAutoSwap.txsClaim} function.
     */
    CLAIM_COMMITED = 2,
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    CLAIM_CLAIMED = 3
}
