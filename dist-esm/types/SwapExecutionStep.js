/**
 * Type guard for {@link SwapExecutionStepSetup}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepSetup(obj, chain) {
    return typeof (obj) === "object" &&
        obj.type === "Setup" &&
        obj.side === "destination" &&
        typeof (obj.chain) === "string" &&
        (chain == null || obj.chain === chain) &&
        typeof (obj.title) === "string" &&
        typeof (obj.description) === "string" &&
        (obj.status === "awaiting" ||
            obj.status === "completed" ||
            obj.status === "soft_expired" ||
            obj.status === "expired");
}
/**
 * Type guard for {@link SwapExecutionStepPayment}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepPayment(obj, chain) {
    return typeof (obj) === "object" &&
        obj.type === "Payment" &&
        obj.side === "source" &&
        typeof (obj.chain) === "string" &&
        (chain == null || obj.chain === chain) &&
        typeof (obj.title) === "string" &&
        typeof (obj.description) === "string" &&
        (obj.status === "inactive" ||
            obj.status === "awaiting" ||
            obj.status === "received" ||
            obj.status === "confirmed" ||
            obj.status === "soft_expired" ||
            obj.status === "expired") &&
        (obj.confirmations == null ||
            (typeof (obj.confirmations) === "object" &&
                typeof (obj.confirmations.current) === "number" &&
                typeof (obj.confirmations.target) === "number" &&
                typeof (obj.confirmations.etaSeconds) === "number"));
}
/**
 * Type guard for {@link SwapExecutionStepSettlement}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepSettlement(obj, chain) {
    return typeof (obj) === "object" &&
        obj.type === "Settlement" &&
        obj.side === "destination" &&
        typeof (obj.chain) === "string" &&
        (chain == null || obj.chain === chain) &&
        typeof (obj.title) === "string" &&
        typeof (obj.description) === "string" &&
        (obj.status === "inactive" ||
            obj.status === "waiting_lp" ||
            obj.status === "awaiting_automatic" ||
            obj.status === "awaiting_manual" ||
            obj.status === "soft_settled" ||
            obj.status === "soft_expired" ||
            obj.status === "settled" ||
            obj.status === "expired");
}
/**
 * Type guard for {@link SwapExecutionStepRefund}
 *
 * @category Swap Steps
 */
export function isSwapExecutionStepRefund(obj, chain) {
    return typeof (obj) === "object" &&
        obj.type === "Refund" &&
        obj.side === "source" &&
        typeof (obj.chain) === "string" &&
        (chain == null || obj.chain === chain) &&
        typeof (obj.title) === "string" &&
        typeof (obj.description) === "string" &&
        (obj.status === "inactive" || obj.status === "awaiting" || obj.status === "refunded");
}
