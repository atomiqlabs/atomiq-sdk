/**
 * State enum for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare enum ToBTCSwapState {
    /**
     * Intermediary (LP) was unable to process the swap and the funds were refunded on the
     *  source chain
     */
    REFUNDED = -3,
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
     * Swap was created, use the {@link IToBTCSwap.commit} or {@link IToBTCSwap.txsCommit} to
     *  initiate it by creating the swap escrow on the source chain
     */
    CREATED = 0,
    /**
     * Swap escrow was initiated (committed) on the source chain, the intermediary (LP) will
     *  now process the swap. You can wait till that happens with the {@link IToBTCSwap.waitForPayment}
     *  function.
     */
    COMMITED = 1,
    /**
     * The intermediary (LP) has processed the transaction and sent out the funds on the destination chain,
     *  but hasn't yet settled the escrow on the source chain.
     */
    SOFT_CLAIMED = 2,
    /**
     * Swap was successfully settled by the intermediary (LP) on the source chain
     */
    CLAIMED = 3,
    /**
     * Intermediary (LP) was unable to process the swap and the swap escrow on the source chain
     *  is refundable, call {@link IToBTCSwap.refund} or {@link IToBTCSwap.txsRefund} to refund
     */
    REFUNDABLE = 4
}
