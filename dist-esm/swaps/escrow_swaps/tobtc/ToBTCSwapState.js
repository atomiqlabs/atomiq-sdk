/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
/**
 * State enum for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export var ToBTCSwapState;
(function (ToBTCSwapState) {
    /**
     * Intermediary (LP) was unable to process the swap and the funds were refunded on the
     *  source chain
     */
    ToBTCSwapState[ToBTCSwapState["REFUNDED"] = -3] = "REFUNDED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    ToBTCSwapState[ToBTCSwapState["QUOTE_EXPIRED"] = -2] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    ToBTCSwapState[ToBTCSwapState["QUOTE_SOFT_EXPIRED"] = -1] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap was created, use the {@link IToBTCSwap.commit} or {@link IToBTCSwap.txsCommit} to
     *  initiate it by creating the swap escrow on the source chain
     */
    ToBTCSwapState[ToBTCSwapState["CREATED"] = 0] = "CREATED";
    /**
     * Swap escrow was initiated (committed) on the source chain, the intermediary (LP) will
     *  now process the swap. You can wait till that happens with the {@link IToBTCSwap.waitForPayment}
     *  function.
     */
    ToBTCSwapState[ToBTCSwapState["COMMITED"] = 1] = "COMMITED";
    /**
     * The intermediary (LP) has processed the transaction and sent out the funds on the destination chain,
     *  but hasn't yet settled the escrow on the source chain.
     */
    ToBTCSwapState[ToBTCSwapState["SOFT_CLAIMED"] = 2] = "SOFT_CLAIMED";
    /**
     * Swap was successfully settled by the intermediary (LP) on the source chain
     */
    ToBTCSwapState[ToBTCSwapState["CLAIMED"] = 3] = "CLAIMED";
    /**
     * Intermediary (LP) was unable to process the swap and the swap escrow on the source chain
     *  is refundable, call {@link IToBTCSwap.refund} or {@link IToBTCSwap.txsRefund} to refund
     */
    ToBTCSwapState[ToBTCSwapState["REFUNDABLE"] = 4] = "REFUNDABLE";
})(ToBTCSwapState || (ToBTCSwapState = {}));
