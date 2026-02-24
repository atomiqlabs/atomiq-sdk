import { ChainIds, MultiChain } from "../../swapper/Swapper";
import { Token } from "../../types/Token";
import { PriceInfoType } from "../../types/PriceInfoType";
/**
 * Abstract base class for swap pricing implementations
 *
 * @category Pricing
 */
export declare abstract class ISwapPrice<T extends MultiChain = MultiChain> {
    maxAllowedFeeDifferencePPM: bigint;
    protected constructor(maxAllowedFeeDifferencePPM: bigint);
    /**
     * Gets the decimal places for a given token, returns `-1` if token should be ignored & `null` if token is not found
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param tokenAddress Token address
     * @protected
     */
    protected abstract getDecimals<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string): number | null;
    /**
     * Returns the price of the token in BTC uSats (microSats)
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param tokenAddress Token address
     * @param abortSignal
     * @protected
     */
    protected abstract getPrice<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string, abortSignal?: AbortSignal): Promise<bigint>;
    /**
     * Returns the price of bitcoin in USD (sats/USD)
     *
     * @param abortSignal
     * @protected
     */
    protected abstract getUsdPrice(abortSignal?: AbortSignal): Promise<number>;
    /**
     * Gets the decimal places for a given token, returns `-1` if token should be ignored & throws if token is not found
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param tokenAddress Token address
     * @throws {Error} When token is not known
     * @protected
     */
    protected getDecimalsThrowing<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string): number;
    /**
     * Recomputes pricing info without fetching the current price
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param amountSats Amount of sats (BTC) to be received from the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param paidToken Amount of token to be paid to the swap
     * @param tokenAddress Token address to be paid
     */
    recomputePriceInfoSend<C extends ChainIds<T>>(chainIdentifier: C, amountSats: bigint, satsBaseFee: bigint, feePPM: bigint, paidToken: bigint, tokenAddress: string): PriceInfoType;
    /**
     * Checks whether the swap amounts are valid given the current market rate for a given pair
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param amountSats Amount of sats (BTC) to be received from the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param paidToken Amount of token to be paid to the swap
     * @param tokenAddress Token address to be paid
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     */
    isValidAmountSend<C extends ChainIds<T>>(chainIdentifier: C, amountSats: bigint, satsBaseFee: bigint, feePPM: bigint, paidToken: bigint, tokenAddress: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint | null): Promise<PriceInfoType>;
    /**
     * Recomputes pricing info without fetching the current price
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param amountSats Amount of sats (BTC) to be paid to the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param receiveToken Amount of token to be received from the swap
     * @param tokenAddress Token address to be received
     */
    recomputePriceInfoReceive<C extends ChainIds<T>>(chainIdentifier: C, amountSats: bigint, satsBaseFee: bigint, feePPM: bigint, receiveToken: bigint, tokenAddress: string): PriceInfoType;
    /**
     * Checks whether the swap amounts are valid given the current market rate for a given pair
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param amountSats Amount of sats (BTC) to be paid to the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param receiveToken Amount of token to be received from the swap
     * @param tokenAddress Token address to be received
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     */
    isValidAmountReceive<C extends ChainIds<T>>(chainIdentifier: C, amountSats: bigint, satsBaseFee: bigint, feePPM: bigint, receiveToken: bigint, tokenAddress: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint | null): Promise<PriceInfoType>;
    /**
     * Pre-fetches the pricing data for a given token, such that further calls to {@link isValidAmountReceive} or
     *  {@link isValidAmountSend} are quicker and don't need to wait for the price fetch
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param tokenAddress Token address
     * @param abortSignal
     */
    preFetchPrice<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string, abortSignal?: AbortSignal): Promise<bigint>;
    /**
     * Pre-fetches the Bitcoin USD price data, such that further calls to {@link getBtcUsdValue},
     *  {@link getTokenUsdValue} or {@link getUsdValue} are quicker and don't need to wait for the price fetch
     *
     * @param abortSignal
     */
    preFetchUsdPrice(abortSignal?: AbortSignal): Promise<number>;
    /**
     * Returns amount of `toToken` that is equivalent to `fromAmount` satoshis
     *
     * @param chainIdentifier Chain identifier string for the smart chain
     * @param fromAmount Amount of satoshis
     * @param toToken Token address
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     * @throws {Error} when token is not found
     */
    getFromBtcSwapAmount<C extends ChainIds<T>>(chainIdentifier: C, fromAmount: bigint, toToken: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint | null): Promise<bigint>;
    /**
     * Returns amount of satoshis that are equivalent to `fromAmount` of `fromToken`
     *
     * @param chainIdentifier Chain identifier string for the smart chain
     * @param fromAmount Amount of the token
     * @param fromToken Token address
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     * @throws {Error} when token is not found
     */
    getToBtcSwapAmount<C extends ChainIds<T>>(chainIdentifier: C, fromAmount: bigint, fromToken: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint): Promise<bigint>;
    /**
     * Returns whether the token should be ignored and pricing for it not calculated
     *
     * @param chainIdentifier Chain identifier string for the smart chain
     * @param tokenAddress Token address
     * @throws {Error} if token is not found
     */
    shouldIgnore<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string): boolean;
    /**
     * Returns the USD value of the bitcoin amount
     *
     * @param btcSats Bitcoin amount in satoshis
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    getBtcUsdValue(btcSats: bigint, abortSignal?: AbortSignal, preFetchedUsdPrice?: number): Promise<number>;
    /**
     * Returns the USD value of the smart chain token amount
     *
     * @param chainIdentifier Chain identifier string for the smart chain
     * @param tokenAmount Amount of the token in base units
     * @param tokenAddress Token address
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    getTokenUsdValue<C extends ChainIds<T>>(chainIdentifier: C, tokenAmount: bigint, tokenAddress: string, abortSignal?: AbortSignal, preFetchedUsdPrice?: number): Promise<number>;
    /**
     * Returns the USD value of the token amount
     *
     * @param amount Amount in base units of the token
     * @param token Token to fetch the usd price for
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    getUsdValue<C extends ChainIds<T>>(amount: bigint, token: Token<C>, abortSignal?: AbortSignal, preFetchedUsdPrice?: number): Promise<number>;
}
