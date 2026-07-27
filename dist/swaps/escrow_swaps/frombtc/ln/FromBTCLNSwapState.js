"use strict";
/*
 * This state enum deliberately lives in its own module, separate from the swap class it
 * describes: a bundler tree-shakes unused exports, but it cannot split a single module
 * across chunks, so an enum co-located with the class would drag the whole class (and its
 * heavy imports) into any chunk that only needs the enum. Keep this module free of any
 * value-level imports.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromBTCLNSwapState = void 0;
/**
 * State enum for legacy Lightning -> Smart chain swaps
 * @category Swaps/Legacy/Lightning → Smart chain
 */
var FromBTCLNSwapState;
(function (FromBTCLNSwapState) {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FromBTCLNSwapState[FromBTCLNSwapState["FAILED"] = -4] = "FAILED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    FromBTCLNSwapState[FromBTCLNSwapState["QUOTE_EXPIRED"] = -3] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    FromBTCLNSwapState[FromBTCLNSwapState["QUOTE_SOFT_EXPIRED"] = -2] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    FromBTCLNSwapState[FromBTCLNSwapState["EXPIRED"] = -1] = "EXPIRED";
    /**
     * Swap quote was created, use {@link FromBTCLNSwap.getAddress} or {@link FromBTCLNSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP)
     */
    FromBTCLNSwapState[FromBTCLNSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * Lightning network payment has been received by the intermediary (LP), the user can now settle
     *  the swap on the destination smart chain side with {@link FromBTCLNSwap.commitAndClaim} (if
     *  the underlying chain supports it - check with {@link FromBTCLNSwap.canCommitAndClaimInOneShot}),
     *  or by calling {@link FromBTCLNSwap.commit} and {@link FromBTCLNSwap.claim} separately.
     */
    FromBTCLNSwapState[FromBTCLNSwapState["PR_PAID"] = 1] = "PR_PAID";
    /**
     * Swap escrow HTLC has been created on the destination chain. Continue by claiming it with the
     *  {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} function.
     */
    FromBTCLNSwapState[FromBTCLNSwapState["CLAIM_COMMITED"] = 2] = "CLAIM_COMMITED";
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    FromBTCLNSwapState[FromBTCLNSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCLNSwapState = exports.FromBTCLNSwapState || (exports.FromBTCLNSwapState = {}));
