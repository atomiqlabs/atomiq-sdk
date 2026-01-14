"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIBTCWalletSwap = void 0;
function isIBTCWalletSwap(obj) {
    return obj != null &&
        typeof (obj.getFundedPsbt) === "function" &&
        typeof (obj.submitPsbt) === "function" &&
        typeof (obj.estimateBitcoinFee) === "function" &&
        typeof (obj.sendBitcoinTransaction) === "function" &&
        typeof (obj.waitForBitcoinTransaction) === "function" &&
        typeof (obj.getRequiredConfirmationsCount) === "function";
}
exports.isIBTCWalletSwap = isIBTCWalletSwap;
