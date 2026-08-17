/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
/**
 * State enum for trusted on-chain gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export var OnchainForGasSwapState;
(function (OnchainForGasSwapState) {
    /**
     * The swap quote expired without user sending in the BTC
     */
    OnchainForGasSwapState[OnchainForGasSwapState["EXPIRED"] = -3] = "EXPIRED";
    /**
     * The swap has failed after the intermediary already received the BTC on the source chain
     */
    OnchainForGasSwapState[OnchainForGasSwapState["FAILED"] = -2] = "FAILED";
    /**
     * Swap was refunded and BTC returned to the user's refund address
     */
    OnchainForGasSwapState[OnchainForGasSwapState["REFUNDED"] = -1] = "REFUNDED";
    /**
     * Swap was created, send the BTC to the swap address
     */
    OnchainForGasSwapState[OnchainForGasSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    OnchainForGasSwapState[OnchainForGasSwapState["FINISHED"] = 1] = "FINISHED";
    /**
     * Swap is refundable because the intermediary cannot honor the swap request on the destination chain
     */
    OnchainForGasSwapState[OnchainForGasSwapState["REFUNDABLE"] = 2] = "REFUNDABLE";
})(OnchainForGasSwapState || (OnchainForGasSwapState = {}));
