"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSwapExecutionStepRefund = exports.isSwapExecutionStepSettlement = exports.isSwapExecutionStepPayment = exports.isSwapExecutionStepSetup = void 0;
/**
 * Type guard for {@link SwapExecutionStepSetup}
 *
 * @category Swap Steps
 */
function isSwapExecutionStepSetup(obj, chain) {
    return typeof (obj) === "object" &&
        obj.type === "Setup" &&
        obj.side === "destination" &&
        typeof (obj.chain) === "string" &&
        (chain == null || obj.chain === chain) &&
        typeof (obj.title) === "string" &&
        typeof (obj.description) === "string" &&
        (obj.status === "awaiting" || obj.status === "completed" || obj.status === "expired");
}
exports.isSwapExecutionStepSetup = isSwapExecutionStepSetup;
/**
 * Type guard for {@link SwapExecutionStepPayment}
 *
 * @category Swap Steps
 */
function isSwapExecutionStepPayment(obj, chain) {
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
            obj.status === "expired") &&
        (obj.confirmations == null ||
            (typeof (obj.confirmations) === "object" &&
                typeof (obj.confirmations.current) === "number" &&
                typeof (obj.confirmations.target) === "number" &&
                typeof (obj.confirmations.etaSeconds) === "number"));
}
exports.isSwapExecutionStepPayment = isSwapExecutionStepPayment;
/**
 * Type guard for {@link SwapExecutionStepSettlement}
 *
 * @category Swap Steps
 */
function isSwapExecutionStepSettlement(obj, chain) {
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
            obj.status === "settled" ||
            obj.status === "expired");
}
exports.isSwapExecutionStepSettlement = isSwapExecutionStepSettlement;
/**
 * Type guard for {@link SwapExecutionStepRefund}
 *
 * @category Swap Steps
 */
function isSwapExecutionStepRefund(obj, chain) {
    return typeof (obj) === "object" &&
        obj.type === "Refund" &&
        obj.side === "source" &&
        typeof (obj.chain) === "string" &&
        (chain == null || obj.chain === chain) &&
        typeof (obj.title) === "string" &&
        typeof (obj.description) === "string" &&
        (obj.status === "inactive" || obj.status === "awaiting" || obj.status === "refunded");
}
exports.isSwapExecutionStepRefund = isSwapExecutionStepRefund;
