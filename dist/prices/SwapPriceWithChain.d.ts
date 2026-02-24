import { ISwapPrice } from "./abstract/ISwapPrice";
import { ChainIds, MultiChain } from "../swapper/Swapper";
import { Token } from "../types/Token";
import { PriceInfoType } from "../types/PriceInfoType";
/**
 * Chain-specific wrapper for swap pricing
 *
 * @category Pricing
 */
export declare class SwapPriceWithChain<T extends MultiChain, ChainIdentifier extends ChainIds<T>> {
    swapPrice: ISwapPrice<T>;
    chainIdentifier: ChainIdentifier;
    maxAllowedFeeDifferencePPM: bigint;
    constructor(swapPrice: ISwapPrice<T>, chainIdentifier: ChainIdentifier);
    /**
     * Checks whether the swap amounts are valid given the current market rate for a given pair
     *
     * @param amountSats Amount of sats (BTC) to be received from the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param paidToken Amount of token to be paid to the swap
     * @param tokenAddress Token address to be paid
     * @param abortSignal Abort signal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     */
    isValidAmountSend(amountSats: bigint, satsBaseFee: bigint, feePPM: bigint, paidToken: bigint, tokenAddress: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint): Promise<PriceInfoType>;
    /**
     * Checks whether the swap amounts are valid given the current market rate for a given pair
     *
     * @param amountSats Amount of sats (BTC) to be paid to the swap
     * @param satsBaseFee Base fee in sats (BTC) as reported by the intermediary
     * @param feePPM PPM fee rate as reported by the intermediary
     * @param receiveToken Amount of token to be received from the swap
     * @param tokenAddress Token address to be received
     * @param abortSignal Abort signal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     */
    isValidAmountReceive(amountSats: bigint, satsBaseFee: bigint, feePPM: bigint, receiveToken: bigint, tokenAddress: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint): Promise<PriceInfoType>;
    /**
     * Pre-fetches the pricing data for a given token, such that further calls to {@link isValidAmountReceive} or
     *  {@link isValidAmountSend} are quicker and don't need to wait for the price fetch
     *
     * @param tokenAddress Token address
     * @param abortSignal Abort signal
     */
    preFetchPrice(tokenAddress: string, abortSignal?: AbortSignal): Promise<bigint>;
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
     * @param fromAmount Amount of satoshis
     * @param toToken Token address
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     * @throws {Error} when token is not found
     */
    getFromBtcSwapAmount(fromAmount: bigint, toToken: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint): Promise<bigint>;
    /**
     * Returns amount of satoshis that are equivalent to `fromAmount` of `fromToken`
     *
     * @param fromAmount Amount of the token
     * @param fromToken Token address
     * @param abortSignal
     * @param preFetchedPrice An optional price pre-fetched with {@link preFetchPrice}
     * @throws {Error} when token is not found
     */
    getToBtcSwapAmount(fromAmount: bigint, fromToken: string, abortSignal?: AbortSignal, preFetchedPrice?: bigint): Promise<bigint>;
    /**
     * Returns whether the token should be ignored and pricing for it not calculated
     *
     * @param tokenAddress Token address
     * @throws {Error} if token is not found
     */
    shouldIgnore(tokenAddress: string): boolean;
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
     * @param tokenAmount Amount of the token in base units
     * @param tokenAddress Token address
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    getTokenUsdValue(tokenAmount: bigint, tokenAddress: string, abortSignal?: AbortSignal, preFetchedUsdPrice?: number): Promise<number>;
    /**
     * Returns the USD value of the token amount
     *
     * @param amount Amount in base units of the token
     * @param token Token to fetch the usd price for
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    getUsdValue(amount: bigint, token: Token<ChainIdentifier>, abortSignal?: AbortSignal, preFetchedUsdPrice?: number): Promise<number>;
}
