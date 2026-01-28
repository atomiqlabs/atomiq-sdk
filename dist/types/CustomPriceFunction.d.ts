/**
 * Custom pricing callback function type
 * @category Pricing and LPs
 */
export type CustomPriceFunction = (tickers: string[], abortSignal?: AbortSignal) => Promise<number[]>;
