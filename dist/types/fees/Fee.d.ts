import { PercentagePPM } from "./PercentagePPM";
import { TokenAmount } from "../TokenAmount";
import { Token } from "../Token";
/**
 * Fee represented in both, source and destination tokens, as well as providing USD valuation helpers and
 *  fee composition
 *
 * @category Pricing and LPs
 */
export type Fee<ChainIdentifier extends string = string, TSrc extends Token<ChainIdentifier> = Token<ChainIdentifier>, TDst extends Token<ChainIdentifier> = Token<ChainIdentifier>> = {
    /**
     * Fee value equivalent in source token
     */
    amountInSrcToken: TokenAmount<ChainIdentifier, TSrc, true>;
    /**
     * Fee value equivalent in destination token
     */
    amountInDstToken: TokenAmount<ChainIdentifier, TDst, true>;
    /**
     * Fetches the current USD value of the fee
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the token amount
     */
    currentUsdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>;
    /**
     * Gets USD value of the fee, if the USD value when the swap was created is known (newer swaps) it returns this value,
     *  otherwise fetches the usd value on-demand
     *
     * @param abortSignal
     * @param preFetchedUsdPrice You can supply a pre-fetched usd price to the pricing function
     * @returns A promise resolving to the current USD value of the fee
     */
    usdValue: (abortSignal?: AbortSignal, preFetchedUsdPrice?: number) => Promise<number>;
    /**
     * USD value of the fee when swap was created - only present for newer swaps where the USD value at create
     *  time is known. Left for convenience only, use usdValue() instead, which automatically
     *  recognizes which pricing to use (either past value if available or fetches it on-demand)
     */
    pastUsdValue?: number;
    /**
     * Returns the composition of the fee (base fee + percentage fee) if known, the total fee is calculated as:
     *  base_fee + amount * percentage_fee
     */
    composition?: {
        base: TokenAmount<ChainIdentifier>;
        percentage: PercentagePPM;
    };
};
