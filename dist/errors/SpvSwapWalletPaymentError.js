"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpvSwapWalletNetworkFeeError = exports.SpvSwapWalletUnderpayError = exports.SpvSwapWalletOverpayError = void 0;
/**
 * An error indicating that a received UTXO amount/fee doesn't match what the swap requires
 *
 * @category Errors
 */
class SpvSwapWalletOverpayError extends Error {
    constructor(expectedAmount, actualAmount, msg) {
        super(msg);
        this.expectedAmount = expectedAmount;
        this.actualAmount = actualAmount;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SpvSwapWalletOverpayError.prototype);
    }
}
exports.SpvSwapWalletOverpayError = SpvSwapWalletOverpayError;
/**
 * An error indicating that a received UTXO amount/fee doesn't match what the swap requires
 *
 * @category Errors
 */
class SpvSwapWalletUnderpayError extends Error {
    constructor(expectedAmount, actualAmount, msg) {
        super(msg);
        this.expectedAmount = expectedAmount;
        this.actualAmount = actualAmount;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SpvSwapWalletUnderpayError.prototype);
    }
}
exports.SpvSwapWalletUnderpayError = SpvSwapWalletUnderpayError;
/**
 * An error indicating that a received UTXO amount/fee doesn't match what the swap requires
 *
 * @category Errors
 */
class SpvSwapWalletNetworkFeeError extends Error {
    constructor(minimumFeeRate, actualFeeRate, msg) {
        super(msg);
        this.minimumFeeRate = minimumFeeRate;
        this.actualFeeRate = actualFeeRate;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SpvSwapWalletNetworkFeeError.prototype);
    }
}
exports.SpvSwapWalletNetworkFeeError = SpvSwapWalletNetworkFeeError;
