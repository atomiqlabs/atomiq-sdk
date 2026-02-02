import {Token} from "../types/Token";

import {fromDecimal, toDecimal} from "./Utils";

/**
 * Converts a raw bigint amount to a human-readable string with decimals
 * @category Utilities
 */
export function toHumanReadableString(amount: bigint, currencySpec: Token): string {
    if(amount==null) return "";
    return toDecimal(amount, currencySpec.decimals, undefined, currencySpec.displayDecimals);
}

/**
 * Parses a human-readable decimal string to a raw bigint amount
 * @category Utilities
 */
export function fromHumanReadableString(amount: string, currencySpec: Token): bigint | null {
    if(amount==="" || amount==null) return null;
    try {
        return fromDecimal(amount, currencySpec.decimals);
    } catch (e) {
        return null;
    }
}
