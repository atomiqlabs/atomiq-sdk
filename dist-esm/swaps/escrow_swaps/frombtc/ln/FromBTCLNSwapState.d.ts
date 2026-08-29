/**
 * State enum for legacy Lightning -> Smart chain swaps
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export declare enum FromBTCLNSwapState {
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
     * Swap quote was created, use {@link FromBTCLNSwap.getAddress} or {@link FromBTCLNSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP)
     */
    PR_CREATED = 0,
    /**
     * Lightning network payment has been received by the intermediary (LP), the user can now settle
     *  the swap on the destination smart chain side with {@link FromBTCLNSwap.commitAndClaim} (if
     *  the underlying chain supports it - check with {@link FromBTCLNSwap.canCommitAndClaimInOneShot}),
     *  or by calling {@link FromBTCLNSwap.commit} and {@link FromBTCLNSwap.claim} separately.
     */
    PR_PAID = 1,
    /**
     * Swap escrow HTLC has been created on the destination chain. Continue by claiming it with the
     *  {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} function.
     */
    CLAIM_COMMITED = 2,
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    CLAIM_CLAIMED = 3
}
