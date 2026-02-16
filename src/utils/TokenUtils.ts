import {Token} from "../types/Token";

import {fromDecimal, toDecimal} from "./Utils";

/**
 * Converts a raw bigint amount to a human-readable string with decimals
 *
 * @param amount Amount in base units
 * @param token Token
 *
 * @category Utilities
 */
export function toHumanReadableString(amount: bigint, token: Token): string {
    if(amount==null) return "";
    return toDecimal(amount, token.decimals, undefined, token.displayDecimals);
}

/**
 * Parses a human-readable decimal string to a raw bigint amount
 *
 * @param amount Amount in base units
 * @param token Token
 *
 * @category Utilities
 */
export function fromHumanReadableString(amount: string, token: Token): bigint | null {
    if(amount==="" || amount==null) return null;
    try {
        return fromDecimal(amount, token.decimals);
    } catch (e) {
        return null;
    }
}
