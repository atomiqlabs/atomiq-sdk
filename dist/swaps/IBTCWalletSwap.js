"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIBTCWalletSwap = void 0;
/**
 * Type guard to check if an object is an {@link IBTCWalletSwap}
 *
 * @category Swaps/Types
 */
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
