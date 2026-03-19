/**
 * Execution step describing destination-side setup required before the swap can continue.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepSetup<Chain extends string = string> = {
    type: "Setup",
    side: "destination",
    chain: Chain,
    title: string,
    description: string,
    /**
     * Current status of the setup step.
     *
     * - `awaiting`: The setup transaction or action still needs to be performed.
     * - `completed`: The setup was already completed successfully.
     * - `expired`: The setup can no longer be performed because the swap expired.
     */
    status: "awaiting" | "completed" | "expired"
}

/**
 * Type guard for {@link SwapExecutionStepSetup}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepSetup<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepSetup<Chain> {
    return typeof(obj) === "object" &&
        obj.type === "Setup" &&
        obj.side === "destination" &&
        typeof(obj.chain) === "string" &&
        (chain==null || obj.chain===chain) &&
        typeof(obj.title) === "string" &&
        typeof(obj.description) === "string" &&
        (obj.status === "awaiting" || obj.status === "completed" || obj.status === "expired");
}

/**
 * Execution step describing the user payment that initiates or funds the swap.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepPayment<Chain extends string = string> = {
    type: "Payment",
    side: "source",
    chain: Chain,
    title: string,
    description: string,
    /**
     * Current status of the payment step.
     *
     * - `inactive`: The payment step is not yet active because a previous step must complete first.
     * - `awaiting`: The payment is expected, but no payment transaction is known yet.
     * - `received`: A payment transaction is known, but it is not yet fully confirmed.
     * - `confirmed`: The payment was confirmed and fully satisfies the swap requirements.
     * - `expired`: The payment step can no longer be completed because the swap expired.
     */
    status: "inactive" | "awaiting" | "received" | "confirmed" | "expired",
    /**
     * Optional confirmation progress for Bitcoin on-chain payments.
     */
    confirmations?: {
        /**
         * Number of confirmations currently observed for the payment.
         */
        current: number,
        /**
         * Number of confirmations required before the payment is considered final.
         */
        target: number,
        /**
         * Estimated remaining time in seconds until the target confirmation count is reached.
         *
         * Can be `-1` if the estimate is not available.
         */
        etaSeconds: number
    }
}

/**
 * Type guard for {@link SwapExecutionStepPayment}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepPayment<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepPayment<Chain> {
    return typeof(obj) === "object" &&
        obj.type === "Payment" &&
        obj.side === "source" &&
        typeof(obj.chain) === "string" &&
        (chain==null || obj.chain===chain) &&
        typeof(obj.title) === "string" &&
        typeof(obj.description) === "string" &&
        (
            obj.status === "inactive" ||
            obj.status === "awaiting" ||
            obj.status === "received" ||
            obj.status === "confirmed" ||
            obj.status === "expired"
        ) &&
        (
            obj.confirmations == null ||
            (
                typeof(obj.confirmations) === "object" &&
                typeof(obj.confirmations.current) === "number" &&
                typeof(obj.confirmations.target) === "number" &&
                typeof(obj.confirmations.etaSeconds) === "number"
            )
        );
}

/**
 * Execution step describing payout or settlement on the destination side of the swap.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepSettlement<
    Chain extends string = string,
    AdditionalStatuses extends "awaiting_automatic" | "awaiting_manual" | "soft_settled" = "awaiting_automatic" | "awaiting_manual" | "soft_settled"
> = {
    type: "Settlement",
    side: "destination",
    chain: Chain,
    title: string,
    description: string,
    /**
     * Current status of the settlement step.
     *
     * - `inactive`: The settlement step is not yet active because a previous step must complete first.
     * - `waiting_lp`: The swap is waiting for the intermediary (LP) to create or process the destination-side payout.
     * - `awaiting_automatic`: The swap is waiting for automatic settlement by watchtowers.
     * - `awaiting_manual`: The swap is ready for manual destination-side settlement by the user.
     * - `soft_settled`: The user already received the payout, but the swap is not yet fully finalized on the source side.
     * - `settled`: The settlement completed successfully.
     * - `expired`: Settlement is no longer possible because the swap expired or failed.
     */
    status: "inactive" | "waiting_lp" | "settled" | "expired" | AdditionalStatuses
}

/**
 * Type guard for {@link SwapExecutionStepSettlement}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepSettlement<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepSettlement<Chain> {
    return typeof(obj) === "object" &&
        obj.type === "Settlement" &&
        obj.side === "destination" &&
        typeof(obj.chain) === "string" &&
        (chain==null || obj.chain===chain) &&
        typeof(obj.title) === "string" &&
        typeof(obj.description) === "string" &&
        (
            obj.status === "inactive" ||
            obj.status === "waiting_lp" ||
            obj.status === "awaiting_automatic" ||
            obj.status === "awaiting_manual" ||
            obj.status === "soft_settled" ||
            obj.status === "settled" ||
            obj.status === "expired"
        );
}

/**
 * Execution step describing a source-side refund path after a failed swap.
 *
 * @category Swap Steps
 */
export type SwapExecutionStepRefund<Chain extends string = string> = {
    type: "Refund",
    side: "source",
    chain: Chain,
    title: string,
    description: string,
    /**
     * Current status of the refund step.
     *
     * - `inactive`: The refund path is not currently available.
     * - `awaiting`: The swap can be refunded and the user may perform the refund action.
     * - `refunded`: The refund was completed successfully.
     */
    status: "inactive" | "awaiting" | "refunded"
}

/**
 * Type guard for {@link SwapExecutionStepRefund}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepRefund<Chain extends string = string>(obj: any, chain?: Chain): obj is SwapExecutionStepRefund<Chain> {
    return typeof(obj) === "object" &&
        obj.type === "Refund" &&
        obj.side === "source" &&
        typeof(obj.chain) === "string" &&
        (chain==null || obj.chain===chain) &&
        typeof(obj.title) === "string" &&
        typeof(obj.description) === "string" &&
        (obj.status === "inactive" || obj.status === "awaiting" || obj.status === "refunded");
}

/**
 * Union of all supported swap execution step variants.
 *
 * @category Swap Steps
 */
export type SwapExecutionStep = SwapExecutionStepSetup |
    SwapExecutionStepPayment |
    SwapExecutionStepSettlement |
    SwapExecutionStepRefund;
