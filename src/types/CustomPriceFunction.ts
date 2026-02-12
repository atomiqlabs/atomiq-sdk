/**
 * Custom pricing callback function type, fetches the USD price for the provided array
 *  of token tickers.
 *
 * @param tickers Tickers of the tokens to fetch USD price for
 * @param abortSignal Abort signal
 * @returns USD prices of the passed tickers in the order that they were passed
 *
 * @category Pricing and LPs
 */
export type CustomPriceFunction = (tickers: string[], abortSignal?: AbortSignal) => Promise<number[]>;
