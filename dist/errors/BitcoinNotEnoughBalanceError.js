"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitcoinNotEnoughBalanceError = void 0;
/**
 * Bitcoin wallet doesn't have enough balance to execute the action
 *
 * @category Errors
 */
class BitcoinNotEnoughBalanceError extends Error {
    constructor(msg) {
        super(msg);
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, BitcoinNotEnoughBalanceError.prototype);
    }
}
exports.BitcoinNotEnoughBalanceError = BitcoinNotEnoughBalanceError;
