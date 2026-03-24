/**
 * Execution step describing destination-side setup required before the swap can continue.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepSetup<Chain extends string = string> = {
    type: "Setup";
    side: "destination";
    chain: Chain;
    title: string;
    description: string;
    /**
     * Current status of the setup step.
     *
     * - `awaiting`: The setup transaction or action still needs to be performed.
     * - `completed`: The setup was already completed successfully.
     * - `soft_expired`: The setup should be treated as expired by the user, but it may still progress because of in-flight or background processing.
     * - `expired`: The setup can no longer be performed because the swap expired.
     */
    status: "awaiting" | "completed" | "soft_expired" | "expired";
    setupTxId?: string;
};
/**
 * Type guard for {@link SwapExecutionStepSetup}
 *
 * @category Swap Steps
 */
export declare function isSwapExecutionStepSetup<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepSetup<Chain>;
/**
 * Execution step describing the user payment that initiates or funds the swap.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepPayment<Chain extends string = string> = {
    type: "Payment";
    side: "source";
    chain: Chain;
    title: string;
    description: string;
    /**
     * Current status of the payment step.
     *
     * - `inactive`: The payment step is not yet active because a previous step must complete first.
     * - `awaiting`: The payment is expected, but no payment transaction is known yet.
     * - `received`: A payment transaction is known, but it is not yet fully confirmed.
     * - `confirmed`: The payment was confirmed and fully satisfies the swap requirements.
     * - `soft_expired`: The payment should be treated as expired by the user, but it may still progress because of in-flight or background processing.
     * - `expired`: The payment step can no longer be completed because the swap expired.
     */
    status: "inactive" | "awaiting" | "received" | "confirmed" | "soft_expired" | "expired";
    /**
     * Optional confirmation progress for Bitcoin on-chain payments.
     */
    confirmations?: {
        /**
         * Number of confirmations currently observed for the payment.
         */
        current: number;
        /**
         * Number of confirmations required before the payment is considered final.
         */
        target: number;
        /**
         * Estimated remaining time in seconds until the target confirmation count is reached.
         *
         * Can be `-1` if the estimate is not available.
         */
        etaSeconds: number;
    };
    initTxId?: string;
    settleTxId?: string;
};
/**
 * Type guard for {@link SwapExecutionStepPayment}
 *
 * @category Swap Steps
 */
export declare function isSwapExecutionStepPayment<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepPayment<Chain>;
/**
 * Execution step describing payout or settlement on the destination side of the swap.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepSettlement<Chain extends string = string, AdditionalStatuses extends "awaiting_automatic" | "awaiting_manual" | "soft_settled" = "awaiting_automatic" | "awaiting_manual" | "soft_settled"> = {
    type: "Settlement";
    side: "destination";
    chain: Chain;
    title: string;
    description: string;
    /**
     * Current status of the settlement step.
     *
     * - `inactive`: The settlement step is not yet active because a previous step must complete first.
     * - `waiting_lp`: The swap is waiting for the intermediary (LP) to create or process the destination-side payout.
     * - `awaiting_automatic`: The swap is waiting for automatic settlement by watchtowers.
     * - `awaiting_manual`: The swap is ready for manual destination-side settlement by the user.
     * - `soft_settled`: The user already received the payout, but the swap is not yet fully finalized on the source side.
     * - `soft_expired`: The settlement should be treated as expired by the user, but it may still progress because of in-flight or background processing.
     * - `settled`: The settlement completed successfully.
     * - `expired`: Settlement is no longer possible because the swap expired or failed.
     */
    status: "inactive" | "waiting_lp" | "soft_expired" | "settled" | "expired" | AdditionalStatuses;
    initTxId?: string;
    settleTxId?: string;
};
/**
 * Type guard for {@link SwapExecutionStepSettlement}
 *
 * @category Swap Steps
 */
export declare function isSwapExecutionStepSettlement<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepSettlement<Chain>;
/**
 * Execution step describing a source-side refund path after a failed swap.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepRefund<Chain extends string = string> = {
    type: "Refund";
    side: "source";
    chain: Chain;
    title: string;
    description: string;
    /**
     * Current status of the refund step.
     *
     * - `inactive`: The refund path is not currently available.
     * - `awaiting`: The swap can be refunded and the user may perform the refund action.
     * - `refunded`: The refund was completed successfully.
     */
    status: "inactive" | "awaiting" | "refunded";
    refundTxId?: string;
};
/**
 * Type guard for {@link SwapExecutionStepRefund}
 *
 * @category Swap Steps
 */
export declare function isSwapExecutionStepRefund<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepRefund<Chain>;
/**
 * Union of all supported swap execution step variants.
 *
 * @category Swap Steps
 */
export type SwapExecutionStep = SwapExecutionStepSetup | SwapExecutionStepPayment | SwapExecutionStepSettlement | SwapExecutionStepRefund;
