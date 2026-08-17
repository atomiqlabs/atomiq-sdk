/**
 * Type guard to check if an object is an {@link IRefundableSwap}
 *
 * @category Swaps/Types
 */
export function isIRefundableSwap(obj) {
    return typeof (obj.isRefundable) === "function" &&
        typeof (obj.txsRefund) === "function" &&
        typeof (obj.refund) === "function";
}
