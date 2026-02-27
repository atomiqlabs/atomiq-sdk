import {ISwapPrice} from "../prices/abstract/ISwapPrice";
import {Token} from "./Token";
import {PriceInfoType} from "./PriceInfoType";
import {toDecimal} from "../utils/Utils";

/**
 * Represents a token amount along with its formatted values and USD valuation helpers
 *
 * @category Tokens
 */
export type TokenAmount<
    T extends Token = Token,
    Known extends boolean = boolean
> = {
    /**
     * Raw amount in base units represented as bigint, might be `undefined` when the amount is unknown
     */
    rawAmount: Known extends true ? bigint : undefined,
    /**
     * Human readable amount with decimal places, might be empty string `""` when the amount is unknown
     */
    amount: string,
    /**
     * Number representation of the decimal token amount (can lose precision!), might be `NaN` when
     *  the amount is unknown
     */
    _amount: number,
    /**
     * Token associated with this amount
     */
    token: T,
    /**
     * Fetches the current USD value of the amount, might return `NaN` when the amount is unknown
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    currentUsdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>,
    /**
     * Gets USD value of the amount, if this amount was returned from a swap it uses the USD value
     *  when the swap was created, otherwise fetches the usd value on-demand, might return `NaN`
     *  when the amount is unknown
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    usdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>,
    /**
     * USD value of the amount when swap was created - only present for token amounts obtained
     *  from swaps, left for convenience only, use usdValue() instead, which automatically
     *  recognizes which pricing to use (either past value if available or fetches it on-demand),
     *  might be `NaN` when the amount is unknown
     */
    pastUsdValue?: number,
    /**
     * Returns the string representation of the amount along with the token ticker in format: `"{amount} {ticker}"`,
     *  in case the anmount is unknown returns `"??? {ticker}"`
     */
    toString: () => string,
    /**
     * Whether the token amount contains an unknown or undefined amount, in this case numeric values are `NaN`,
     *  raw amount is `undefined`, string representation is `""` and `toString()` returns `"??? {ticker}"`
     */
    isUnknown: Known extends true ? false : true
};

/**
 * Factory function to create a TokenAmount
 *
 * @category Tokens
 * @internal
 */
export function toTokenAmount<
    T extends Token = Token,
    Known extends boolean = boolean
>(
    amount: Known extends true ? bigint : null,
    token: T,
    prices: ISwapPrice,
    pricingInfo?: PriceInfoType
): TokenAmount<T, Known> {
    if (amount == null) return {
        rawAmount: undefined,
        amount: "",
        _amount: NaN,
        token,
        currentUsdValue: () => Promise.resolve(NaN),
        pastUsdValue: NaN,
        usdValue: () => Promise.resolve(NaN),
        toString: () => "??? " + token.ticker,
        isUnknown: true
    } as TokenAmount<T>;
    const amountStr = toDecimal(amount, token.decimals, undefined, token.displayDecimals);
    const _amount = parseFloat(amountStr);

    let usdValue: number | undefined = undefined;
    if (pricingInfo != null) {
        if (token.chain === "BTC" && token.ticker === "BTC") {
            if (pricingInfo.realPriceUsdPerBitcoin != null) {
                usdValue = Number(amount) * pricingInfo.realPriceUsdPerBitcoin;
            }
        } else {
            if (pricingInfo.realPriceUsdPerBitcoin != null && pricingInfo.realPriceUSatPerToken != null) {
                usdValue = _amount
                    * pricingInfo.realPriceUsdPerBitcoin
                    * Number(pricingInfo.realPriceUSatPerToken)
                    / 1_000_000;
            }
        }
    }

    const currentUsdValue = (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) =>
        prices.getUsdValue(amount, token, abortSignal, preFetchedUsdPrice);

    return {
        rawAmount: amount,
        amount: amountStr,
        _amount,
        token,
        currentUsdValue,
        pastUsdValue: usdValue,
        usdValue: async (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => {
            if (usdValue == null) {
                usdValue = await currentUsdValue(abortSignal, preFetchedUsdPrice);
            }
            return usdValue;
        },
        toString: () => amountStr + " " + token.ticker,
        isUnknown: false
    } as TokenAmount<T>;
}