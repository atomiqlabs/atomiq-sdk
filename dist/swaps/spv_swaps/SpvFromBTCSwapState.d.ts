/**
 * State enum for SPV vault (UTXO-controlled vault) based swaps
 * @category Swaps/Bitcoin → Smart chain
 */
export declare enum SpvFromBTCSwapState {
    /**
     * Catastrophic failure has occurred when processing the swap on the smart chain side,
     *  this implies a bug in the smart contract code or the user and intermediary deliberately
     *  creating a bitcoin transaction with invalid format unparsable by the smart contract.
     */
    CLOSED = -5,
    /**
     * Some of the bitcoin swap transaction inputs were double-spent, this means the swap
     *  has failed and no BTC was sent
     */
    FAILED = -4,
    /**
     * The intermediary (LP) declined to co-sign the submitted PSBT, hence the swap failed
     */
    DECLINED = -3,
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
     * Swap was created, use the {@link SpvFromBTCSwap.getFundedPsbt} or {@link SpvFromBTCSwap.getPsbt} functions
     *  to get the bitcoin swap PSBT that should be signed by the user's wallet and then submitted via the
     *  {@link SpvFromBTCSwap.submitPsbt} function.
     */
    CREATED = 0,
    /**
     * Swap bitcoin PSBT was submitted by the client to the SDK
     */
    SIGNED = 1,
    /**
     * Swap bitcoin PSBT sent to the intermediary (LP), waiting for the intermediary co-sign
     *  it and broadcast. You can use the {@link SpvFromBTCSwap.waitTillClaimedOrFronted}
     *  function to wait till the intermediary broadcasts the transaction and the transaction
     *  confirms.
     */
    POSTED = 2,
    /**
     * Intermediary (LP) has co-signed and broadcasted the bitcoin transaction. You can use the
     *  {@link SpvFromBTCSwap.waitTillClaimedOrFronted} function to wait till the transaction
     *  confirms.
     */
    BROADCASTED = 3,
    /**
     * Settlement on the destination smart chain was fronted and funds were already received
     *  by the user, even before the final settlement.
     */
    FRONTED = 4,
    /**
     * Bitcoin transaction confirmed with necessary amount of confirmations, wait for automatic
     *  settlement by the watchtower with the {@link waitTillClaimedOrFronted} function, or settle manually
     *  using the {@link FromBTCSwap.claim} or {@link FromBTCSwap.txsClaim} function.
     */
    BTC_TX_CONFIRMED = 5,
    /**
     * Swap settled on the smart chain and funds received
     */
    CLAIMED = 6
}
