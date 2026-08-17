/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
/**
 * State enum for FromBTCLNAuto swaps
 * @category Swaps/Lightning → Smart chain
 */
export var FromBTCLNAutoSwapState;
(function (FromBTCLNAutoSwapState) {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["FAILED"] = -4] = "FAILED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["QUOTE_EXPIRED"] = -3] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["QUOTE_SOFT_EXPIRED"] = -2] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["EXPIRED"] = -1] = "EXPIRED";
    /**
     * Swap quote was created, use {@link FromBTCLNAutoSwap.getAddress} or {@link FromBTCLNAutoSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNAutoSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP) and the destination HTLC escrow is created
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * Lightning network payment has been received by the intermediary (LP), but the destination chain
     *  HTLC escrow hasn't been created yet. Use {@link FromBTCLNAutoSwap.waitForPayment} to continue waiting
     *  till the destination HTLC escrow is created.
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["PR_PAID"] = 1] = "PR_PAID";
    /**
     * Swap escrow HTLC has been created on the destination chain, wait for automatic settlement by the watchtowers
     *  using the {@link FromBTCLNAutoSwap.waitTillClaimed} function or settle manually using the
     *  {@link FromBTCLNAutoSwap.claim} or {@link FromBTCLNAutoSwap.txsClaim} function.
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["CLAIM_COMMITED"] = 2] = "CLAIM_COMMITED";
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCLNAutoSwapState = FromBTCLNAutoSwapState || (FromBTCLNAutoSwapState = {}));
