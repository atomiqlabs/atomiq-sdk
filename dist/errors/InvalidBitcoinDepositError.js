"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidBitcoinDepositError = void 0;
/**
 * Thrown when using {@link SpvFromBTCSwap} in the "intermediate_wallet" mode and an invalid UTXO is deposited to the
 *  intermediate wallet.
 *
 * @category Errors
 */
class InvalidBitcoinDepositError extends Error {
    constructor(invalidUtxos) {
        super("Invalid Bitcoin amount deposited, please re-quote!");
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, InvalidBitcoinDepositError.prototype);
        this.invalidUtxos = invalidUtxos;
    }
}
exports.InvalidBitcoinDepositError = InvalidBitcoinDepositError;
