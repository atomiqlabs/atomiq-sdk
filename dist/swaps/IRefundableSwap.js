"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIRefundableSwap = void 0;
function isIRefundableSwap(obj) {
    return typeof (obj.isRefundable) === "function" &&
        typeof (obj.txsRefund) === "function" &&
        typeof (obj.refund) === "function";
}
exports.isIRefundableSwap = isIRefundableSwap;
