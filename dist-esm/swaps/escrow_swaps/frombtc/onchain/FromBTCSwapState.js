/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
/**
 * State enum for legacy escrow based Bitcoin -> Smart chain swaps.
 *
 * @category Swaps/Legacy/Bitcoin → Smart chain
 */
export var FromBTCSwapState;
(function (FromBTCSwapState) {
    /**
     * Bitcoin swap address has expired and the intermediary (LP) has already refunded
     *  its funds. No BTC should be sent anymore!
     */
    FromBTCSwapState[FromBTCSwapState["FAILED"] = -4] = "FAILED";
    /**
     * Bitcoin swap address has expired, user should not send any BTC anymore! Though
     *  the intermediary (LP) hasn't refunded yet. So if there is a transaction already
     *  in-flight the swap might still succeed.
     */
    FromBTCSwapState[FromBTCSwapState["EXPIRED"] = -3] = "EXPIRED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    FromBTCSwapState[FromBTCSwapState["QUOTE_EXPIRED"] = -2] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    FromBTCSwapState[FromBTCSwapState["QUOTE_SOFT_EXPIRED"] = -1] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap quote was created, use the {@link FromBTCSwap.commit} or {@link FromBTCSwap.txsCommit} functions
     *  to initiate it by creating the swap escrow on the destination smart chain
     */
    FromBTCSwapState[FromBTCSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * Swap escrow was initiated (committed) on the destination chain, user can send the BTC to the
     *  swap address with the {@link FromBTCSwap.getFundedPsbt}, {@link FromBTCSwap.getAddress} or
     *  {@link FromBTCSwap.getHyperlink} functions.
     */
    FromBTCSwapState[FromBTCSwapState["CLAIM_COMMITED"] = 1] = "CLAIM_COMMITED";
    /**
     * Input bitcoin transaction was confirmed, wait for automatic settlement by the watchtowers
     *  using the {@link FromBTCSwap.waitTillClaimed} function or settle manually using the {@link FromBTCSwap.claim}
     *  or {@link FromBTCSwap.txsClaim} function.
     */
    FromBTCSwapState[FromBTCSwapState["BTC_TX_CONFIRMED"] = 2] = "BTC_TX_CONFIRMED";
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    FromBTCSwapState[FromBTCSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCSwapState || (FromBTCSwapState = {}));
