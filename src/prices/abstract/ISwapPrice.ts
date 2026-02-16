import {ChainIds, MultiChain} from "../../swapper/Swapper";
import {Token} from "../../types/Token";
import {PriceInfoType} from "../../types/PriceInfoType";

/**
 * Abstract base class for swap pricing implementations
 *
 * @category Pricing and LPs
 */
export abstract class ISwapPrice<T extends MultiChain = MultiChain> {

    maxAllowedFeeDifferencePPM: bigint;

    protected constructor(maxAllowedFeeDifferencePPM: bigint) {
        this.maxAllowedFeeDifferencePPM = maxAllowedFeeDifferencePPM;
    }

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
    protected getDecimalsThrowing<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string): number {
        const decimals = this.getDecimals(chainIdentifier, tokenAddress);
        if(decimals==null) throw new Error(`Cannot get decimal count for token ${chainIdentifier}:${tokenAddress}!`);
        return decimals;
    }

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
    public recomputePriceInfoSend<C extends ChainIds<T>>(
        chainIdentifier: C,
        amountSats: bigint,
        satsBaseFee: bigint,
        feePPM: bigint,
        paidToken: bigint,
        tokenAddress: string
    ): PriceInfoType {
        const totalSats = (amountSats * (1000000n + feePPM) / 1000000n)
            + satsBaseFee;
        const totalUSats = totalSats * 1000000n;
        const swapPriceUSatPerToken = totalUSats * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, tokenAddress))) / paidToken;

        return {
            isValid: true,
            differencePPM: 0n,
            satsBaseFee,
            feePPM,
            realPriceUSatPerToken: this.shouldIgnore(chainIdentifier, tokenAddress) ? undefined : swapPriceUSatPerToken,
            swapPriceUSatPerToken
        };
    }

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
    public async isValidAmountSend<C extends ChainIds<T>>(
        chainIdentifier: C,
        amountSats: bigint,
        satsBaseFee: bigint,
        feePPM: bigint,
        paidToken: bigint,
        tokenAddress: string,
        abortSignal?: AbortSignal,
        preFetchedPrice?: bigint | null
    ): Promise<PriceInfoType> {
        const totalSats = (amountSats * (1000000n + feePPM) / 1000000n)
            + satsBaseFee;
        const totalUSats = totalSats * 1000000n;
        const swapPriceUSatPerToken = totalUSats * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, tokenAddress))) / paidToken;

        if(this.shouldIgnore(chainIdentifier, tokenAddress)) return {
            isValid: true,
            differencePPM: 0n,
            satsBaseFee,
            feePPM,
            realPriceUSatPerToken: undefined,
            swapPriceUSatPerToken
        };

        const calculatedAmtInToken = await this.getFromBtcSwapAmount(chainIdentifier, totalSats, tokenAddress, abortSignal, preFetchedPrice);
        const realPriceUSatPerToken = totalUSats * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, tokenAddress))) / calculatedAmtInToken;

        const difference = paidToken - calculatedAmtInToken; //Will be >0 if we need to pay more than we should've
        const differencePPM = difference * 1000000n / calculatedAmtInToken;

        return {
            isValid: differencePPM <= this.maxAllowedFeeDifferencePPM,
            differencePPM,
            satsBaseFee,
            feePPM,
            realPriceUSatPerToken,
            swapPriceUSatPerToken
        };
    }

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
    public recomputePriceInfoReceive<C extends ChainIds<T>>(
        chainIdentifier: C,
        amountSats: bigint,
        satsBaseFee: bigint,
        feePPM: bigint,
        receiveToken: bigint,
        tokenAddress: string,
    ): PriceInfoType {
        const totalSats = (amountSats * (1000000n - feePPM) / 1000000n)
            - satsBaseFee;
        const totalUSats = totalSats * 1000000n;
        const swapPriceUSatPerToken = totalUSats * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, tokenAddress))) / receiveToken;

        return {
            isValid: true,
            differencePPM: 0n,
            satsBaseFee,
            feePPM,
            realPriceUSatPerToken: this.shouldIgnore(chainIdentifier, tokenAddress) ? undefined : swapPriceUSatPerToken,
            swapPriceUSatPerToken
        };
    }

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
    public async isValidAmountReceive<C extends ChainIds<T>>(
        chainIdentifier: C,
        amountSats: bigint,
        satsBaseFee: bigint,
        feePPM: bigint,
        receiveToken: bigint,
        tokenAddress: string,
        abortSignal?: AbortSignal,
        preFetchedPrice?: bigint | null
    ): Promise<PriceInfoType> {
        const totalSats = (amountSats * (1000000n - feePPM) / 1000000n)
            - satsBaseFee;
        const totalUSats = totalSats * 1000000n;
        const swapPriceUSatPerToken = totalUSats * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, tokenAddress))) / receiveToken;

        if(this.shouldIgnore(chainIdentifier, tokenAddress)) return {
            isValid: true,
            differencePPM: 0n,
            satsBaseFee,
            feePPM,
            realPriceUSatPerToken: undefined,
            swapPriceUSatPerToken
        };

        const calculatedAmtInToken = await this.getFromBtcSwapAmount(chainIdentifier, totalSats, tokenAddress, abortSignal, preFetchedPrice);
        const realPriceUSatPerToken = totalUSats * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, tokenAddress))) / calculatedAmtInToken;

        const difference = calculatedAmtInToken - receiveToken; //Will be >0 if we receive less than we should've
        const differencePPM = difference * 100000n / calculatedAmtInToken;

        return {
            isValid: differencePPM <= this.maxAllowedFeeDifferencePPM,
            differencePPM,
            satsBaseFee,
            feePPM,
            realPriceUSatPerToken,
            swapPriceUSatPerToken
        };
    }

    /**
     * Pre-fetches the pricing data for a given token, such that further calls to {@link isValidAmountReceive} or
     *  {@link isValidAmountSend} are quicker and don't need to wait for the price fetch
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param tokenAddress Token address
     * @param abortSignal
     */
    public preFetchPrice<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string, abortSignal?: AbortSignal): Promise<bigint> {
        return this.getPrice(chainIdentifier, tokenAddress, abortSignal);
    }

    /**
     * Pre-fetches the Bitcoin USD price data, such that further calls to {@link getBtcUsdValue},
     *  {@link getTokenUsdValue} or {@link getUsdValue} are quicker and don't need to wait for the price fetch
     *
     * @param abortSignal
     */
    public preFetchUsdPrice(abortSignal?: AbortSignal): Promise<number> {
        return this.getUsdPrice(abortSignal);
    }

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
    public async getFromBtcSwapAmount<C extends ChainIds<T>>(
        chainIdentifier: C,
        fromAmount: bigint,
        toToken: string,
        abortSignal?: AbortSignal,
        preFetchedPrice?: bigint | null
    ): Promise<bigint> {
        if(this.getDecimals(chainIdentifier, toToken.toString())==null) throw new Error("Token not found!");

        const price = preFetchedPrice || await this.getPrice(chainIdentifier, toToken, abortSignal);

        return fromAmount
            * (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, toToken.toString())))
            * (1000000n) //To usat
            / (price);
    }

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
    public async getToBtcSwapAmount<C extends ChainIds<T>>(
        chainIdentifier: C,
        fromAmount: bigint,
        fromToken: string,
        abortSignal?: AbortSignal,
        preFetchedPrice?: bigint
    ): Promise<bigint> {
        if(this.getDecimals(chainIdentifier, fromToken.toString())==null) throw new Error("Token not found");

        const price = preFetchedPrice || await this.getPrice(chainIdentifier, fromToken, abortSignal);

        return fromAmount
            * price
            / 1000000n
            / (10n ** BigInt(this.getDecimalsThrowing(chainIdentifier, fromToken.toString())));
    }

    /**
     * Returns whether the token should be ignored and pricing for it not calculated
     *
     * @param chainIdentifier Chain identifier string for the smart chain
     * @param tokenAddress Token address
     * @throws {Error} if token is not found
     */
    public shouldIgnore<C extends ChainIds<T>>(chainIdentifier: C, tokenAddress: string): boolean {
        const coin = this.getDecimals(chainIdentifier, tokenAddress.toString());
        if(coin==null) throw new Error("Token not found");
        return coin===-1;
    }

    /**
     * Returns the USD value of the bitcoin amount
     *
     * @param btcSats Bitcoin amount in satoshis
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    public async getBtcUsdValue(
        btcSats: bigint,
        abortSignal?: AbortSignal,
        preFetchedUsdPrice?: number
    ): Promise<number> {
        return Number(btcSats)*(preFetchedUsdPrice || await this.getUsdPrice(abortSignal));
    }

    /**
     * Returns the USD value of the smart chain token amount
     *
     * @param chainIdentifier Chain identifier string for the smart chain
     * @param tokenAmount Amount of the token in base units
     * @param tokenAddress Token address
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    public async getTokenUsdValue<C extends ChainIds<T>>(
        chainIdentifier: C,
        tokenAmount: bigint,
        tokenAddress: string,
        abortSignal?: AbortSignal,
        preFetchedUsdPrice?: number
    ): Promise<number> {
        const [btcAmount, usdPrice] = await Promise.all([
            this.getToBtcSwapAmount(chainIdentifier, tokenAmount, tokenAddress, abortSignal),
            preFetchedUsdPrice==null ? this.preFetchUsdPrice(abortSignal) : Promise.resolve(preFetchedUsdPrice)
        ]);
        return Number(btcAmount)*usdPrice;
    }

    /**
     * Returns the USD value of the token amount
     *
     * @param amount Amount in base units of the token
     * @param token Token to fetch the usd price for
     * @param abortSignal
     * @param preFetchedUsdPrice An optional price pre-fetched with {@link preFetchUsdPrice}
     */
    public getUsdValue<C extends ChainIds<T>>(
        amount: bigint,
        token: Token<C>,
        abortSignal?: AbortSignal,
        preFetchedUsdPrice?: number
    ): Promise<number> {
        if(token.chain==="BTC") {
            return this.getBtcUsdValue(amount, abortSignal, preFetchedUsdPrice);
        } else {
            return this.getTokenUsdValue(token.chainId, amount, token.address, abortSignal, preFetchedUsdPrice);
        }
    }

}
