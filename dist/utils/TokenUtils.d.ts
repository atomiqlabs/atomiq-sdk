import { Token } from "../types/Token";
/**
 * Converts a raw bigint amount to a human-readable string with decimals
 * @category Utilities
 */
export declare function toHumanReadableString(amount: bigint, currencySpec: Token): string;
/**
 * Parses a human-readable decimal string to a raw bigint amount
 * @category Utilities
 */
export declare function fromHumanReadableString(amount: string, currencySpec: Token): bigint | null;
