import {ISwapPrice} from "../prices/abstract/ISwapPrice";
import {Token} from "./Token";
import {PriceInfoType} from "./PriceInfoType";
import {toDecimal} from "../utils/Utils";

/**
 * Represents a token amount along with its formatted values and USD valuation helpers
 */
export type TokenAmount<
    ChainIdentifier extends string = string,
    T extends Token<ChainIdentifier> = Token<ChainIdentifier>
> = {
    /**
     * Raw amount in base units represented as bigint
     */
    rawAmount: bigint,
    /**
     * Human readable amount with decimal places
     */
    amount: string,
    /**
     * Number representation of the decimal token amount (can lose precision!)
     */
    _amount: number,
    /**
     * Token associated with this amount
     */
    token: T,
    /**
     * Fetches the current USD value of the amount
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    currentUsdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>,
    /**
     * Gets USD value of the amount, if this amount was returned from a swap it uses the USD value
     *  when the swap was created, otherwise fetches the usd value on-demand
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    usdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>,
    /**
     * USD value of the amount when swap was created - only present for token amounts obtained
     *  from swaps, left for convenience only, use usdValue() instead, which automatically
     *  recognizes which pricing to use (either past value if available or fetches it on-demand)
     */
    pastUsdValue?: number,
    /**
     * Returns the string representation of the amount along with the token ticker in format: {amount} {ticker}
     */
    toString: () => string
};

export function toTokenAmount<
    ChainIdentifier extends string = string,
    T extends Token<ChainIdentifier> = Token<ChainIdentifier>
>(
    amount: bigint,
    token: T,
    prices: ISwapPrice,
    pricingInfo?: PriceInfoType
): TokenAmount<ChainIdentifier, T> {
    if (amount == null) return null!; //Shouldn't happen
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
        toString: () => amountStr + " " + token.ticker
    };
}