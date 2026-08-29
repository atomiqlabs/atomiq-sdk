/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
/**
 * State enum for trusted Lightning gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export var LnForGasSwapState;
(function (LnForGasSwapState) {
    /**
     * The swap quote expired before the user paid the Lightning invoice
     */
    LnForGasSwapState[LnForGasSwapState["EXPIRED"] = -2] = "EXPIRED";
    /**
     * The swap has failed before the destination payout completed, and the held Lightning invoice was released
     */
    LnForGasSwapState[LnForGasSwapState["FAILED"] = -1] = "FAILED";
    /**
     * Swap was created, pay the provided Lightning invoice which will remain held until destination payout succeeds
     */
    LnForGasSwapState[LnForGasSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * The Lightning invoice was paid and is currently held until the user receives the destination funds
     */
    LnForGasSwapState[LnForGasSwapState["PR_PAID"] = 1] = "PR_PAID";
    /**
     * The swap is finished after the destination payout succeeded and the held Lightning invoice was settled
     */
    LnForGasSwapState[LnForGasSwapState["FINISHED"] = 2] = "FINISHED";
})(LnForGasSwapState = LnForGasSwapState || (LnForGasSwapState = {}));
