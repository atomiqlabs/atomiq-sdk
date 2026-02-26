/**
 * Bitcoin wallet doesn't have enough balance to execute the action
 *
 * @category Errors
 */
export class BitcoinNotEnoughBalanceError extends Error {

    constructor(msg: string) {
        super(msg);
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, BitcoinNotEnoughBalanceError.prototype);
    }

}

