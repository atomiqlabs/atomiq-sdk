/**
 * Thrown when using {@link SpvFromBTCSwap} in the "intermediate_wallet" mode and an invalid UTXO is deposited to the
 *  intermediate wallet.
 *
 * @category Errors
 */
export class InvalidBitcoinDepositError extends Error {
    constructor(invalidUtxos) {
        super("Invalid Bitcoin amount deposited, please re-quote!");
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, InvalidBitcoinDepositError.prototype);
        this.invalidUtxos = invalidUtxos;
    }
}
