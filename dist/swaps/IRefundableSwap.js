"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIRefundableSwap = void 0;
/**
 * Type guard to check if an object is an {@link IRefundableSwap}
 *
 * @category Swaps
 */
function isIRefundableSwap(obj) {
    return typeof (obj.isRefundable) === "function" &&
        typeof (obj.txsRefund) === "function" &&
        typeof (obj.refund) === "function";
}
exports.isIRefundableSwap = isIRefundableSwap;
