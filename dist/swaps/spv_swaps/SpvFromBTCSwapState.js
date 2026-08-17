"use strict";
/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpvFromBTCSwapState = void 0;
/**
 * State enum for SPV vault (UTXO-controlled vault) based swaps
 * @category Swaps/Bitcoin → Smart chain
 */
var SpvFromBTCSwapState;
(function (SpvFromBTCSwapState) {
    /**
     * Catastrophic failure has occurred when processing the swap on the smart chain side,
     *  this implies a bug in the smart contract code or the user and intermediary deliberately
     *  creating a bitcoin transaction with invalid format unparsable by the smart contract.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["CLOSED"] = -5] = "CLOSED";
    /**
     * Some of the bitcoin swap transaction inputs were double-spent, this means the swap
     *  has failed and no BTC was sent
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["FAILED"] = -4] = "FAILED";
    /**
     * The intermediary (LP) declined to co-sign the submitted PSBT, hence the swap failed
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["DECLINED"] = -3] = "DECLINED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["QUOTE_EXPIRED"] = -2] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["QUOTE_SOFT_EXPIRED"] = -1] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap was created, use the {@link SpvFromBTCSwap.getFundedPsbt} or {@link SpvFromBTCSwap.getPsbt} functions
     *  to get the bitcoin swap PSBT that should be signed by the user's wallet and then submitted via the
     *  {@link SpvFromBTCSwap.submitPsbt} function.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["CREATED"] = 0] = "CREATED";
    /**
     * Swap bitcoin PSBT was submitted by the client to the SDK
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["SIGNED"] = 1] = "SIGNED";
    /**
     * Swap bitcoin PSBT sent to the intermediary (LP), waiting for the intermediary co-sign
     *  it and broadcast. You can use the {@link SpvFromBTCSwap.waitTillClaimedOrFronted}
     *  function to wait till the intermediary broadcasts the transaction and the transaction
     *  confirms.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["POSTED"] = 2] = "POSTED";
    /**
     * Intermediary (LP) has co-signed and broadcasted the bitcoin transaction. You can use the
     *  {@link SpvFromBTCSwap.waitTillClaimedOrFronted} function to wait till the transaction
     *  confirms.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["BROADCASTED"] = 3] = "BROADCASTED";
    /**
     * Settlement on the destination smart chain was fronted and funds were already received
     *  by the user, even before the final settlement.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["FRONTED"] = 4] = "FRONTED";
    /**
     * Bitcoin transaction confirmed with necessary amount of confirmations, wait for automatic
     *  settlement by the watchtower with the {@link waitTillClaimedOrFronted} function, or settle manually
     *  using the {@link FromBTCSwap.claim} or {@link FromBTCSwap.txsClaim} function.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["BTC_TX_CONFIRMED"] = 5] = "BTC_TX_CONFIRMED";
    /**
     * Swap settled on the smart chain and funds received
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["CLAIMED"] = 6] = "CLAIMED";
})(SpvFromBTCSwapState = exports.SpvFromBTCSwapState || (exports.SpvFromBTCSwapState = {}));
