import { ISwapPrice } from "../prices/abstract/ISwapPrice";
import { Token } from "./Token";
import { PriceInfoType } from "./PriceInfoType";
/**
 * Represents a token amount along with its formatted values and USD valuation helpers
 *
 * @category Tokens
 */
export type TokenAmount<T extends Token = Token, Known extends boolean = boolean> = {
    /**
     * Raw amount in base units represented as bigint, might be `undefined` when the amount is unknown
     */
    rawAmount: Known extends true ? bigint : undefined;
    /**
     * Human readable amount with decimal places, might be empty string `""` when the amount is unknown
     */
    amount: string;
    /**
     * Number representation of the decimal token amount (can lose precision!), might be `NaN` when
     *  the amount is unknown
     */
    _amount: number;
    /**
     * Token associated with this amount
     */
    token: T;
    /**
     * Fetches the current USD value of the amount, might return `NaN` when the amount is unknown
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    currentUsdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>;
    /**
     * Gets USD value of the amount, if this amount was returned from a swap it uses the USD value
     *  when the swap was created, otherwise fetches the usd value on-demand, might return `NaN`
     *  when the amount is unknown
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    usdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>;
    /**
     * USD value of the amount when swap was created - only present for token amounts obtained
     *  from swaps, left for convenience only, use usdValue() instead, which automatically
     *  recognizes which pricing to use (either past value if available or fetches it on-demand),
     *  might be `NaN` when the amount is unknown
     */
    pastUsdValue?: number;
    /**
     * Returns the string representation of the amount along with the token ticker in format: `"{amount} {ticker}"`,
     *  in case the anmount is unknown returns `"??? {ticker}"`
     */
    toString: () => string;
    /**
     * Whether the token amount contains an unknown or undefined amount, in this case numeric values are `NaN`,
     *  raw amount is `undefined`, string representation is `""` and `toString()` returns `"??? {ticker}"`
     */
    isUnknown: Known extends true ? false : true;
};
/**
 * Factory function to create a TokenAmount
 *
 * @category Tokens
 * @internal
 */
export declare function toTokenAmount<T extends Token = Token, Known extends boolean = boolean>(amount: Known extends true ? bigint : null, token: T, prices: ISwapPrice, pricingInfo?: PriceInfoType): TokenAmount<T, Known>;
