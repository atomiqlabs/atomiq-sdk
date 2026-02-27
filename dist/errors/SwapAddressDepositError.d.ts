import { TokenAmount } from "../types/TokenAmount";
import { BtcToken } from "../types/Token";
/**
 * Bitcoin wallet doesn't have enough balance to execute the action
 *
 * @category Errors
 */
export declare class SwapAddressDepositError extends Error {
    type: "too_low" | "too_high" | "invalid_fee";
    expectedAmount: TokenAmount<BtcToken<true>>;
    constructor(msg: string);
}
