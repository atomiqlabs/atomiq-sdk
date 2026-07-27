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
export enum FromBTCSwapState {
    /**
     * Bitcoin swap address has expired and the intermediary (LP) has already refunded
     *  its funds. No BTC should be sent anymore!
     */
    FAILED = -4,
    /**
     * Bitcoin swap address has expired, user should not send any BTC anymore! Though
     *  the intermediary (LP) hasn't refunded yet. So if there is a transaction already
     *  in-flight the swap might still succeed.
     */
    EXPIRED = -3,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -2,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -1,
    /**
     * Swap quote was created, use the {@link FromBTCSwap.commit} or {@link FromBTCSwap.txsCommit} functions
     *  to initiate it by creating the swap escrow on the destination smart chain
     */
    PR_CREATED = 0,
    /**
     * Swap escrow was initiated (committed) on the destination chain, user can send the BTC to the
     *  swap address with the {@link FromBTCSwap.getFundedPsbt}, {@link FromBTCSwap.getAddress} or
     *  {@link FromBTCSwap.getHyperlink} functions.
     */
    CLAIM_COMMITED = 1,
    /**
     * Input bitcoin transaction was confirmed, wait for automatic settlement by the watchtowers
     *  using the {@link FromBTCSwap.waitTillClaimed} function or settle manually using the {@link FromBTCSwap.claim}
     *  or {@link FromBTCSwap.txsClaim} function.
     */
    BTC_TX_CONFIRMED = 2,
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    CLAIM_CLAIMED = 3
}
