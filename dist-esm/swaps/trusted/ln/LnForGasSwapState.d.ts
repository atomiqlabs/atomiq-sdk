/**
 * State enum for trusted Lightning gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare enum LnForGasSwapState {
    /**
     * The swap quote expired before the user paid the Lightning invoice
     */
    EXPIRED = -2,
    /**
     * The swap has failed before the destination payout completed, and the held Lightning invoice was released
     */
    FAILED = -1,
    /**
     * Swap was created, pay the provided Lightning invoice which will remain held until destination payout succeeds
     */
    PR_CREATED = 0,
    /**
     * The Lightning invoice was paid and is currently held until the user receives the destination funds
     */
    PR_PAID = 1,
    /**
     * The swap is finished after the destination payout succeeded and the held Lightning invoice was settled
     */
    FINISHED = 2
}
