import { Token } from "../types/Token";
/**
 * Converts a raw bigint amount to a human-readable string with decimals
 *
 * @param amount Amount in base units
 * @param token Token
 *
 * @category Utilities
 */
export declare function toHumanReadableString(amount: bigint, token: Token): string;
/**
 * Parses a human-readable decimal string to a raw bigint amount
 *
 * @param amount Amount in base units
 * @param token Token
 *
 * @category Utilities
 */
export declare function fromHumanReadableString(amount: string, token: Token): bigint | null;
