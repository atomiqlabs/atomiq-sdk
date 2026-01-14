export type CustomPriceFunction = (tickers: string[], abortSignal?: AbortSignal) => Promise<number[]>;
