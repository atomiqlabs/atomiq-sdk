import { ISwapPrice } from "../prices/abstract/ISwapPrice";
import { Token } from "./Token";
import { PriceInfoType } from "./PriceInfoType";
/**
 * Represents a token amount along with its formatted values and USD valuation helpers
 * @category Tokens
 */
export type TokenAmount<ChainIdentifier extends string = string, T extends Token<ChainIdentifier> = Token<ChainIdentifier>> = {
    /**
     * Raw amount in base units represented as bigint
     */
    rawAmount: bigint;
    /**
     * Human readable amount with decimal places
     */
    amount: string;
    /**
     * Number representation of the decimal token amount (can lose precision!)
     */
    _amount: number;
    /**
     * Token associated with this amount
     */
    token: T;
    /**
     * Fetches the current USD value of the amount
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    currentUsdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>;
    /**
     * Gets USD value of the amount, if this amount was returned from a swap it uses the USD value
     *  when the swap was created, otherwise fetches the usd value on-demand
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    usdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>;
    /**
     * USD value of the amount when swap was created - only present for token amounts obtained
     *  from swaps, left for convenience only, use usdValue() instead, which automatically
     *  recognizes which pricing to use (either past value if available or fetches it on-demand)
     */
    pastUsdValue?: number;
    /**
     * Returns the string representation of the amount along with the token ticker in format: {amount} {ticker}
     */
    toString: () => string;
};
/**
 * Factory function to create a TokenAmount
 * @category Tokens
 */
export declare function toTokenAmount<ChainIdentifier extends string = string, T extends Token<ChainIdentifier> = Token<ChainIdentifier>>(amount: bigint, token: T, prices: ISwapPrice, pricingInfo?: PriceInfoType): TokenAmount<ChainIdentifier, T>;
