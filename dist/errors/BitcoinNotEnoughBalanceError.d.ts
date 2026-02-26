/**
 * Bitcoin wallet doesn't have enough balance to execute the action
 *
 * @category Errors
 */
export declare class BitcoinNotEnoughBalanceError extends Error {
    constructor(msg: string);
}
