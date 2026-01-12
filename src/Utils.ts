/**
 * @module Utils
 * Utility functions for amount conversion and async operations.
 */

import {toDecimal, fromDecimal, Token} from "@atomiqlabs/sdk-lib";

/**
 * Converts a token amount from its smallest unit (e.g., lamports, wei) to a human-readable string.
 *
 * @category Utilities
 *
 * @param amount - The amount in smallest units (e.g., lamports for SOL)
 * @param currencySpec - Token specification with decimals info
 * @returns Human-readable string representation (e.g., "1.5")
 *
 * @example
 * ```typescript
 * const usdc = factory.Tokens.SOLANA.USDC;
 * const readable = toHumanReadableString(1500000n, usdc); // "1.5"
 * ```
 */
export function toHumanReadableString(amount: bigint, currencySpec: Token): string {
    if(amount==null) return "";
    return toDecimal(amount, currencySpec.decimals, undefined, currencySpec.displayDecimals);
}

/**
 * Converts a human-readable amount string to the token's smallest unit.
 *
 * @category Utilities
 *
 * @param amount - Human-readable amount string (e.g., "1.5")
 * @param currencySpec - Token specification with decimals info
 * @returns Amount in smallest units, or null if parsing fails
 *
 * @example
 * ```typescript
 * const usdc = factory.Tokens.SOLANA.USDC;
 * const lamports = fromHumanReadableString("1.5", usdc); // 1500000n
 * ```
 */
export function fromHumanReadableString(amount: string, currencySpec: Token): bigint | null {
    if(amount==="" || amount==null) return null;
    try {
        return fromDecimal(amount, currencySpec.decimals);
    } catch (e) {
        return null;
    }
}

/**
 * Creates an AbortSignal that automatically aborts after a specified timeout.
 * Optionally extends an existing AbortSignal.
 *
 * @category Utilities
 *
 * @param timeout - Milliseconds to wait before aborting
 * @param abortReason - Custom abort reason (default: "Timed out")
 * @param abortSignal - Optional existing signal to extend
 * @returns An AbortSignal that will abort after the timeout
 *
 * @example
 * ```typescript
 * // Simple timeout
 * const signal = timeoutSignal(5000);
 * await fetch(url, { signal });
 *
 * // Extend existing signal with timeout
 * const userSignal = controller.signal;
 * const signal = timeoutSignal(5000, "Request timed out", userSignal);
 * ```
 */
export function timeoutSignal(timeout: number, abortReason?: any, abortSignal?: AbortSignal): AbortSignal {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(abortReason || new Error("Timed out")), timeout);
    if(abortSignal!=null) {
        abortSignal.addEventListener("abort", () => {
            clearTimeout(timeoutHandle);
            abortController.abort(abortSignal.reason);
        });
    }
    return abortController.signal;
}
