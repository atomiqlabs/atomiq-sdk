"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapAddressDepositError = void 0;
/**
 * Bitcoin wallet doesn't have enough balance to execute the action
 *
 * @category Errors
 */
class SwapAddressDepositError extends Error {
    constructor(msg) {
        super(msg);
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SwapAddressDepositError.prototype);
    }
}
exports.SwapAddressDepositError = SwapAddressDepositError;
