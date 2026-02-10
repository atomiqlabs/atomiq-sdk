import {decode as bolt11Decode, PaymentRequestObject, TagsObject} from "@atomiqlabs/bolt11";
import {ToBTCLNSwap, ToBTCLNSwapInit} from "./ToBTCLNSwap";
import {IToBTCDefinition, IToBTCWrapper} from "../IToBTCWrapper";
import {UserError} from "../../../../errors/UserError";
import {ChainSwapType, ChainType, SwapCommitState, SwapCommitStateType} from "@atomiqlabs/base";
import {Intermediary} from "../../../../intermediaries/Intermediary";
import {ISwapWrapperOptions, WrapperCtorTokens} from "../../../ISwapWrapper";
import {ISwapPrice} from "../../../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {SwapType} from "../../../../enums/SwapType";
import {extendAbortController, throwIfUndefined} from "../../../../utils/Utils";
import {IntermediaryAPI, ToBTCLNResponseType} from "../../../../intermediaries/apis/IntermediaryAPI";
import {RequestError} from "../../../../errors/RequestError";
import {LNURL, LNURLPaySuccessAction} from "../../../../lnurl/LNURL";
import {IToBTCSwapInit, ToBTCSwapState} from "../IToBTCSwap";
import {UnifiedSwapEventListener} from "../../../../events/UnifiedSwapEventListener";
import {UnifiedSwapStorage} from "../../../../storage/UnifiedSwapStorage";
import {ISwap} from "../../../ISwap";
import {sha256} from "@noble/hashes/sha2";
import {AmountData} from "../../../../types/AmountData";
import {LNURLPayParamsWithUrl} from "../../../../types/lnurl/LNURLPay";
import {tryWithRetries} from "../../../../utils/RetryUtils";
import {AllOptional, AllRequired} from "../../../../utils/TypeUtils";
import {LightningInvoiceCreateService} from "../../../../types/wallets/LightningInvoiceCreateService";

export type ToBTCLNOptions = {
    expirySeconds?: number,
    maxFee?: bigint | Promise<bigint>,
    expiryTimestamp?: bigint,
    maxRoutingPPM?: bigint,
    maxRoutingBaseFee?: bigint
}

export type ToBTCLNWrapperOptions = ISwapWrapperOptions & {
    lightningBaseFee: number,
    lightningFeePPM: number,
    paymentTimeoutSeconds: number
};

export type ToBTCLNDefinition<T extends ChainType> = IToBTCDefinition<T, ToBTCLNWrapper<T>, ToBTCLNSwap<T>>;

export class ToBTCLNWrapper<T extends ChainType> extends IToBTCWrapper<T, ToBTCLNDefinition<T>, ToBTCLNWrapperOptions> {
    public readonly TYPE = SwapType.TO_BTCLN;
    public readonly swapDeserializer = ToBTCLNSwap;

    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        contract: T["Contract"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        swapDataDeserializer: new (data: any) => T["Data"],
        options?: AllOptional<ToBTCLNWrapperOptions>,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(
            chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer,
            {
                paymentTimeoutSeconds: options?.paymentTimeoutSeconds ?? 4*24*60*60,
                lightningBaseFee: options?.lightningBaseFee ?? 10,
                lightningFeePPM: options?.lightningFeePPM ?? 2000
            },
            events
        );
    }

    private toRequiredSwapOptions(amountData: AmountData, options?: ToBTCLNOptions, pricePreFetchPromise?: Promise<bigint | undefined>, abortSignal?: AbortSignal): AllRequired<ToBTCLNOptions> {
        const expirySeconds = options?.expirySeconds ?? this.options.paymentTimeoutSeconds;
        const maxRoutingBaseFee = options?.maxRoutingBaseFee ?? BigInt(this.options.lightningBaseFee);
        const maxRoutingPPM = options?.maxRoutingPPM ?? BigInt(this.options.lightningFeePPM);

        let maxFee: bigint | Promise<bigint>;
        if(options?.maxFee!=null) {
            maxFee = options.maxFee;
        } else if(amountData.exactIn) {
            if(pricePreFetchPromise!=null) {
                maxFee = pricePreFetchPromise
                    .then(val => this.prices.getFromBtcSwapAmount(this.chainIdentifier, maxRoutingBaseFee, amountData.token, abortSignal, val))
                    .then(_maxBaseFee => this.calculateFeeForAmount(amountData.amount, _maxBaseFee, maxRoutingPPM))
            } else {
                maxFee = this.prices.getFromBtcSwapAmount(this.chainIdentifier, maxRoutingBaseFee, amountData.token, abortSignal)
                    .then(_maxBaseFee => this.calculateFeeForAmount(amountData.amount, _maxBaseFee, maxRoutingPPM))
            }
        } else {
            maxFee = this.calculateFeeForAmount(amountData.amount, maxRoutingBaseFee, maxRoutingPPM)
        }

        return {
            expirySeconds,
            expiryTimestamp: options?.expiryTimestamp ?? BigInt(Math.floor(Date.now()/1000)+expirySeconds),
            maxRoutingBaseFee,
            maxRoutingPPM,
            maxFee
        }
    }

    private async checkPaymentHashWasPaid(paymentHash: string) {
        const swaps = await this.unifiedStorage.query(
            [[{key: "type", value: this.TYPE}, {key: "paymentHash", value: paymentHash}]],
            (obj: any) => new this.swapDeserializer(this, obj)
        );

        for(let value of swaps) {
            if(value.state===ToBTCSwapState.CLAIMED || value.state===ToBTCSwapState.SOFT_CLAIMED)
                throw new UserError("Lightning invoice was already paid!");
        }
    }

    /**
     * Calculates maximum lightning network routing fee based on amount
     *
     * @param amount BTC amount of the swap in satoshis
     * @param overrideBaseFee Override wrapper's default base fee
     * @param overrideFeePPM Override wrapper's default PPM
     * @private
     * @returns Maximum lightning routing fee in sats
     */
    private calculateFeeForAmount(amount: bigint, overrideBaseFee?: bigint, overrideFeePPM?: bigint) : bigint {
        return BigInt(overrideBaseFee ?? this.options.lightningBaseFee)
            + (amount * BigInt(overrideFeePPM ?? this.options.lightningFeePPM) / 1000000n);
    }

    /**
     * Verifies returned LP data
     *
     * @param signer
     * @param resp Response as returned by the LP
     * @param parsedPr Parsed bolt11 lightning invoice
     * @param token Smart chain token to be used in the swap
     * @param lp
     * @param options Swap options as passed to the swap create function
     * @param data Parsed swap data returned by the LP
     * @param requiredTotal Required total to be paid on the input (for exactIn swaps)
     * @private
     * @throws {IntermediaryError} In case the response is not valid
     */
    private async verifyReturnedData(
        signer: string,
        resp: ToBTCLNResponseType,
        parsedPr: PaymentRequestObject & {tagsObject: TagsObject},
        token: string,
        lp: Intermediary,
        options: AllRequired<ToBTCLNOptions>,
        data: T["Data"],
        requiredTotal?: bigint
    ): Promise<void> {
        if(resp.routingFeeSats > await options.maxFee) throw new IntermediaryError("Invalid max fee sats returned");

        if(requiredTotal!=null && resp.total !== requiredTotal)
            throw new IntermediaryError("Invalid data returned - total amount");

        if(parsedPr.tagsObject.payment_hash==null) throw new Error("Swap invoice doesn't contain payment hash field!");
        const claimHash = this.contract.getHashForHtlc(Buffer.from(parsedPr.tagsObject.payment_hash, "hex"));

        if(
            data.getAmount() !== resp.total ||
            !Buffer.from(data.getClaimHash(), "hex").equals(claimHash) ||
            data.getExpiry() !== options.expiryTimestamp ||
            data.getType()!==ChainSwapType.HTLC ||
            !data.isPayIn() ||
            !data.isToken(token) ||
            !data.isClaimer(lp.getAddress(this.chainIdentifier)) ||
            !data.isOfferer(signer) ||
            data.getTotalDeposit() !== 0n
        ) {
            throw new IntermediaryError("Invalid data returned");
        }
    }

    /**
     * Returns the quote/swap from a given intermediary
     *
     * @param signer Smartchain signer initiating the swap
     * @param amountData
     * @param lp Intermediary
     * @param pr bolt11 lightning network invoice
     * @param parsedPr Parsed bolt11 lightning network invoice
     * @param options Options as passed to the swap create function
     * @param preFetches
     * @param abort Abort signal or controller, if AbortController is passed it is used as-is, when AbortSignal is passed
     *  it is extended with extendAbortController and then used
     * @param additionalParams Additional params that should be sent to the LP
     * @private
     */
    private async getIntermediaryQuote(
        signer: string,
        amountData: Omit<AmountData, "amount">,
        lp: Intermediary,
        pr: string,
        parsedPr: PaymentRequestObject & {tagsObject: TagsObject},
        options: AllRequired<ToBTCLNOptions>,
        preFetches: {
            feeRatePromise: Promise<string | undefined>,
            pricePreFetchPromise: Promise<bigint | undefined>,
            usdPricePrefetchPromise: Promise<number | undefined>,
            signDataPrefetchPromise?: Promise<T["PreFetchVerification"] | undefined>
        },
        abort: AbortSignal | AbortController,
        additionalParams?: Record<string, any>,
    ) {
        if(lp.services[SwapType.TO_BTCLN]==null) throw new Error("LP service for processing to btcln swaps not found!");

        const abortController = abort instanceof AbortController ? abort : extendAbortController(abort);
        const reputationPromise = this.preFetchIntermediaryReputation(amountData, lp, abortController);

        try {
            const {signDataPromise, resp} = await tryWithRetries(async(retryCount: number) => {
                const {signDataPrefetch, response} = IntermediaryAPI.initToBTCLN(this.chainIdentifier, lp.url, {
                    offerer: signer,
                    pr,
                    maxFee: await options.maxFee,
                    expiryTimestamp: options.expiryTimestamp,
                    token: amountData.token,
                    feeRate: throwIfUndefined(preFetches.feeRatePromise),
                    additionalParams
                }, this.options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined);

                return {
                    signDataPromise: preFetches.signDataPrefetchPromise ?? this.preFetchSignData(signDataPrefetch),
                    resp: await response
                };
            }, undefined, e => e instanceof RequestError, abortController.signal);

            if(parsedPr.millisatoshis==null) throw new Error("Swap invoice doesn't have msat amount field!");
            const amountOut: bigint = (BigInt(parsedPr.millisatoshis) + 999n) / 1000n;
            const totalFee: bigint = resp.swapFee + resp.maxFee;
            const data: T["Data"] = new this.swapDataDeserializer(resp.data);
            data.setOfferer(signer);

            await this.verifyReturnedData(signer, resp, parsedPr, amountData.token, lp, options, data);

            const [pricingInfo, signatureExpiry, reputation] = await Promise.all([
                this.verifyReturnedPrice(
                    lp.services[SwapType.TO_BTCLN], true, amountOut, data.getAmount(),
                    amountData.token, {networkFee: resp.maxFee},
                    preFetches.pricePreFetchPromise, preFetches.usdPricePrefetchPromise, abortController.signal
                ),
                this.verifyReturnedSignature(
                    signer, data, resp, preFetches.feeRatePromise, signDataPromise, abortController.signal
                ),
                reputationPromise
            ]);
            abortController.signal.throwIfAborted();

            if(reputation!=null) lp.reputation[amountData.token.toString()] = reputation;

            const swapFeeBtc = resp.swapFee * amountOut / (data.getAmount() - totalFee);

            const quote = new ToBTCLNSwap<T>(this, {
                pricingInfo,
                url: lp.url,
                expiry: signatureExpiry,
                swapFee: resp.swapFee,
                swapFeeBtc,
                feeRate: (await preFetches.feeRatePromise)!,
                signatureData: resp,
                data,
                networkFee: resp.maxFee,
                networkFeeBtc: resp.routingFeeSats,
                confidence: resp.confidence,
                pr,
                exactIn: false
            } as IToBTCSwapInit<T["Data"]>);
            await quote._save();
            return quote;
        } catch (e) {
            abortController.abort(e);
            throw e;
        }
    }

    /**
     * Returns a newly created swap, paying for 'bolt11PayRequest' - a bitcoin LN invoice
     *
     * @param signer                Smartchain signer's address initiating the swap
     * @param bolt11PayRequest      BOLT11 payment request (bitcoin lightning invoice) you wish to pay
     * @param amountData            Amount of token & amount to swap
     * @param lps                   LPs (liquidity providers) to get the quotes from
     * @param options               Quote options
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param abortSignal           Abort signal for aborting the process
     * @param preFetches            Existing pre-fetches for the swap (only used internally for LNURL swaps)
     */
    async create(
        signer: string,
        bolt11PayRequest: string,
        amountData: Omit<AmountData, "amount">,
        lps: Intermediary[],
        options?: ToBTCLNOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal,
        preFetches?: {
            feeRatePromise: Promise<string | undefined>,
            pricePreFetchPromise: Promise<bigint | undefined>,
            usdPricePrefetchPromise: Promise<number | undefined>,
            signDataPrefetchPromise?: Promise<T["PreFetchVerification"] | undefined>
        }
    ): Promise<{
        quote: Promise<ToBTCLNSwap<T>>,
        intermediary: Intermediary
    }[]> {
        const parsedPr = bolt11Decode(bolt11PayRequest);
        if(parsedPr.millisatoshis==null) throw new UserError("Must be an invoice with amount");
        const amountOut: bigint = (BigInt(parsedPr.millisatoshis) + 999n) / 1000n;

        const expirySeconds = options?.expirySeconds ?? this.options.paymentTimeoutSeconds;
        const maxRoutingBaseFee = options?.maxRoutingBaseFee ?? BigInt(this.options.lightningBaseFee);
        const maxRoutingPPM = options?.maxRoutingPPM ?? BigInt(this.options.lightningFeePPM);

        const _options: AllRequired<ToBTCLNOptions> = {
            expirySeconds,
            expiryTimestamp: options?.expiryTimestamp ?? BigInt(Math.floor(Date.now()/1000)+expirySeconds),
            maxRoutingBaseFee,
            maxRoutingPPM,
            maxFee: options?.maxFee ?? this.calculateFeeForAmount(amountOut, maxRoutingBaseFee, maxRoutingPPM)
        }

        if(parsedPr.tagsObject.payment_hash==null) throw new Error("Provided lightning invoice doesn't contain payment hash field!");
        await this.checkPaymentHashWasPaid(parsedPr.tagsObject.payment_hash);

        const claimHash = this.contract.getHashForHtlc(Buffer.from(parsedPr.tagsObject.payment_hash, "hex"));

        const _abortController = extendAbortController(abortSignal);
        const _preFetches = preFetches ?? {
            pricePreFetchPromise: this.preFetchPrice(amountData, _abortController.signal),
            feeRatePromise: this.preFetchFeeRate(signer, amountData, claimHash.toString("hex"), _abortController),
            usdPricePrefetchPromise: this.preFetchUsdPrice(_abortController.signal),
            signDataPrefetchPromise: this.contract.preFetchBlockDataForSignatures==null ? this.preFetchSignData(Promise.resolve(true)) : undefined
        };

        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: this.getIntermediaryQuote(signer, amountData, lp, bolt11PayRequest, parsedPr, _options, _preFetches, _abortController.signal, additionalParams)
            }
        });
    }

    /**
     * Parses and fetches lnurl pay params from the specified lnurl
     *
     * @param lnurl LNURL to be parsed and fetched
     * @param abortSignal
     * @private
     * @throws {UserError} if the LNURL is invalid or if it's not a LNURL-pay
     */
    private async getLNURLPay(lnurl: string | LNURLPayParamsWithUrl, abortSignal: AbortSignal): Promise<LNURLPayParamsWithUrl> {
        if(typeof(lnurl)!=="string") return lnurl;

        const res = await LNURL.getLNURL(lnurl, true, this.options.getRequestTimeout, abortSignal);
        if(res==null) throw new UserError("Invalid LNURL");
        if(res.tag!=="payRequest") throw new UserError("Not a LNURL-pay");
        return res;
    }

    /**
     * Returns the quote/swap from the given LP
     *
     * @param signer Smartchain signer's address initiating the swap
     * @param amountData
     * @param invoiceCreateService Service for creating fixed amount invoices
     * @param lp Intermediary
     * @param dummyPr Dummy minimum value bolt11 lightning invoice returned from the LNURL-pay
     * @param options Options as passed to the swap create function
     * @param preFetches
     * @param abortSignal
     * @param additionalParams Additional params to be sent to the intermediary
     * @private
     */
    private async getIntermediaryQuoteExactIn(
        signer: string,
        amountData: AmountData,
        invoiceCreateService: LightningInvoiceCreateService,
        lp: Intermediary,
        dummyPr: string,
        options: AllRequired<ToBTCLNOptions> & {comment?: string},
        preFetches: {
            feeRatePromise: Promise<string | undefined>,
            pricePreFetchPromise: Promise<bigint | undefined>,
            usdPricePrefetchPromise: Promise<number | undefined>
        },
        abortSignal: AbortSignal,
        additionalParams?: Record<string, any>,
    ) {
        if(lp.services[SwapType.TO_BTCLN]==null) throw new Error("LP service for processing to btcln swaps not found!");

        const abortController = extendAbortController(abortSignal);
        const reputationPromise = this.preFetchIntermediaryReputation(amountData, lp, abortController);

        try {
            const {signDataPromise, prepareResp} = await tryWithRetries(async(retryCount: number) => {
                const {signDataPrefetch, response} = IntermediaryAPI.prepareToBTCLNExactIn(this.chainIdentifier, lp.url, {
                    token: amountData.token,
                    offerer: signer,
                    pr: dummyPr,
                    amount: amountData.amount,
                    maxFee: await options.maxFee,
                    expiryTimestamp: options.expiryTimestamp,
                    additionalParams
                }, this.options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined);

                return {
                    signDataPromise: this.preFetchSignData(signDataPrefetch),
                    prepareResp: await response
                };
            }, undefined, e => e instanceof RequestError, abortController.signal);

            if(prepareResp.amount <= 0n)
                throw new IntermediaryError("Invalid amount returned (zero or negative)");

            if(invoiceCreateService.minMsats!=null) {
                if(prepareResp.amount < invoiceCreateService.minMsats / 1000n) throw new UserError("Amount less than minimum");
            }
            if(invoiceCreateService.maxMSats!=null) {
                if(prepareResp.amount > invoiceCreateService.maxMSats / 1000n) throw new UserError("Amount more than maximum");
            }

            const invoice = await invoiceCreateService.getInvoice(Number(prepareResp.amount), abortController.signal);
            const parsedInvoice = bolt11Decode(invoice);

            const resp = await tryWithRetries(
                (retryCount: number) => IntermediaryAPI.initToBTCLNExactIn(lp.url, {
                    pr: invoice,
                    reqId: prepareResp.reqId,
                    feeRate: throwIfUndefined(preFetches.feeRatePromise),
                    additionalParams
                }, this.options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined),
                undefined, RequestError, abortController.signal
            );

            if(parsedInvoice.millisatoshis==null) throw new Error("Swap invoice doesn't have msat amount field!");
            const amountOut: bigint = (BigInt(parsedInvoice.millisatoshis) + 999n) / 1000n;
            const totalFee: bigint = resp.swapFee + resp.maxFee;
            const data: T["Data"] = new this.swapDataDeserializer(resp.data);
            data.setOfferer(signer);

            await this.verifyReturnedData(signer, resp, parsedInvoice, amountData.token, lp, options, data, amountData.amount);

            const [pricingInfo, signatureExpiry, reputation] = await Promise.all([
                this.verifyReturnedPrice(
                    lp.services[SwapType.TO_BTCLN], true, prepareResp.amount, data.getAmount(),
                    amountData.token, {networkFee: resp.maxFee},
                    preFetches.pricePreFetchPromise, preFetches.usdPricePrefetchPromise, abortSignal
                ),
                this.verifyReturnedSignature(
                    signer, data, resp, preFetches.feeRatePromise, signDataPromise, abortController.signal
                ),
                reputationPromise
            ]);
            abortController.signal.throwIfAborted();

            if(reputation!=null) lp.reputation[amountData.token.toString()] = reputation;

            const swapFeeBtc = resp.swapFee * amountOut / (data.getAmount() - totalFee);

            const quote = new ToBTCLNSwap<T>(this, {
                pricingInfo,
                url: lp.url,
                expiry: signatureExpiry,
                swapFee: resp.swapFee,
                swapFeeBtc,
                feeRate: (await preFetches.feeRatePromise)!,
                signatureData: resp,
                data,
                networkFee: resp.maxFee,
                networkFeeBtc: resp.routingFeeSats,
                confidence: resp.confidence,
                pr: invoice,
                exactIn: true
            } as IToBTCSwapInit<T["Data"]>);
            await quote._save();
            return quote;
        } catch (e) {
            abortController.abort(e);
            throw e;
        }
    }

    /**
     * Returns a newly created swap, allowing exactIn swaps with invoice creation service
     *
     * @param signer                Smartchain signer's address initiating the swap
     * @param invoiceCreateServicePromise
     * @param amountData            Amount of token & amount to swap
     * @param lps                   LPs (liquidity providers/intermediaries) to get the quotes from
     * @param options               Quote options
     * @param additionalParams      Additional parameters sent to the intermediary when creating the swap
     * @param abortSignal           Abort signal for aborting the process
     */
    async createViaInvoiceCreateService(
        signer: string,
        invoiceCreateServicePromise: Promise<LightningInvoiceCreateService>,
        amountData: AmountData,
        lps: Intermediary[],
        options?: ToBTCLNOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): Promise<{
        quote: Promise<ToBTCLNSwap<T>>,
        intermediary: Intermediary
    }[]> {
        if(!this.isInitialized) throw new Error("Not initialized, call init() first!");

        const _abortController = extendAbortController(abortSignal);
        const pricePreFetchPromise: Promise<bigint | undefined> = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise: Promise<number | undefined> = this.preFetchUsdPrice(_abortController.signal);
        const feeRatePromise: Promise<string | undefined> = this.preFetchFeeRate(signer, amountData, undefined, _abortController);
        const signDataPrefetchPromise: Promise<T["PreFetchVerification"] | undefined> | undefined = this.contract.preFetchBlockDataForSignatures==null ?
            this.preFetchSignData(Promise.resolve(true)) :
            undefined;

        const _options = this.toRequiredSwapOptions(amountData, options, pricePreFetchPromise, _abortController.signal);

        try {
            const invoiceCreateService = await invoiceCreateServicePromise;

            if(amountData.exactIn) {
                const dummyInvoice = await invoiceCreateService.getInvoice(
                    invoiceCreateService.minMsats==null ? 1 : Number(invoiceCreateService.minMsats/1000n),
                    _abortController.signal
                );

                return lps.map(lp => {
                    return {
                        quote: this.getIntermediaryQuoteExactIn(signer, amountData, invoiceCreateService, lp, dummyInvoice, _options, {
                            pricePreFetchPromise,
                            usdPricePrefetchPromise,
                            feeRatePromise
                        }, _abortController.signal, additionalParams),
                        intermediary: lp
                    }
                })
            } else {
                if(invoiceCreateService.minMsats!=null) {
                    if(amountData.amount < invoiceCreateService.minMsats / 1000n) throw new UserError("Amount less than minimum");
                }
                if(invoiceCreateService.maxMSats!=null) {
                    if(amountData.amount > invoiceCreateService.maxMSats / 1000n) throw new UserError("Amount more than maximum");
                }

                const invoice = await invoiceCreateService.getInvoice(Number(amountData.amount), _abortController.signal);

                return (await this.create(signer, invoice, amountData, lps, options, additionalParams, _abortController.signal, {
                    feeRatePromise,
                    pricePreFetchPromise,
                    usdPricePrefetchPromise,
                    signDataPrefetchPromise
                }));
            }
        } catch (e) {
            _abortController.abort(e);
            throw e;
        }
    }

    /**
     * Returns a newly created swap, paying for 'lnurl' - a lightning LNURL-pay
     *
     * @param signer                Smartchain signer's address initiating the swap
     * @param lnurl                 LMURL-pay you wish to pay
     * @param amountData            Amount of token & amount to swap
     * @param lps                   LPs (liquidity providers/intermediaries) to get the quotes from
     * @param options               Quote options
     * @param additionalParams      Additional parameters sent to the intermediary when creating the swap
     * @param abortSignal           Abort signal for aborting the process
     */
    async createViaLNURL(
        signer: string,
        lnurl: string | LNURLPayParamsWithUrl,
        amountData: AmountData,
        lps: Intermediary[],
        options?: ToBTCLNOptions & {comment?: string},
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): Promise<{
        quote: Promise<ToBTCLNSwap<T>>,
        intermediary: Intermediary
    }[]> {
        let successActions: {[pr: string]: LNURLPaySuccessAction} = {};

        const _abortController = extendAbortController(abortSignal);
        const invoiceCreateService = (async() => {
            let payRequest: LNURLPayParamsWithUrl = await this.getLNURLPay(lnurl, _abortController.signal);

            if(
                options?.comment!=null &&
                (payRequest.commentAllowed==null || options.comment.length>payRequest.commentAllowed)
            ) throw new UserError("Comment not allowed or too long");

            return {
                getInvoice: async (amountSats: number, abortSignal?: AbortSignal) => {
                    const {invoice, successAction} = await LNURL.useLNURLPay(
                        payRequest, BigInt(amountSats), options?.comment,
                        this.options.getRequestTimeout, abortSignal
                    );
                    if(successAction!=null) successActions[invoice] = successAction;
                    return invoice;
                },
                minMsats: BigInt(payRequest.minSendable),
                maxMsats: BigInt(payRequest.maxSendable),
                url: payRequest.url
            }
        })();

        const quotes = await this.createViaInvoiceCreateService(
            signer,
            invoiceCreateService,
            amountData,
            lps,
            options,
            additionalParams,
            _abortController.signal
        );
        _abortController.signal.throwIfAborted();

        const resolved = await invoiceCreateService;
        _abortController.signal.throwIfAborted();

        return quotes.map(value => ({
            quote: value.quote.then(quote => {
                quote.lnurl = resolved.url;
                const quoteAddress = quote.getOutputAddress();
                if(quoteAddress!=null) {
                    const successAction = successActions[quoteAddress];
                    if(successAction!=null) quote.successAction = successAction;
                }
                return quote;
            }),
            intermediary: value.intermediary
        }));
    }

    async recoverFromSwapDataAndState(
        init: {data: T["Data"], getInitTxId: () => Promise<string>, getTxBlock: () => Promise<{blockTime: number, blockHeight: number}>},
        state: SwapCommitState,
        lp?: Intermediary
    ): Promise<ToBTCLNSwap<T> | null> {
        const data = init.data;

        let paymentHash = data.getHTLCHashHint();
        let secret: string | undefined;
        if(state.type===SwapCommitStateType.PAID) {
            secret = await state.getClaimResult();
            paymentHash = Buffer.from(sha256(Buffer.from(secret, "hex"))).toString("hex");
        }

        const swapInit: ToBTCLNSwapInit<T["Data"]> = {
            pricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100_000_000_000_000n,
                realPriceUSatPerToken: 100_000_000_000_000n,
                differencePPM: 0n,
                feePPM: 0n,
            },
            url: lp?.url,
            expiry: 0,
            swapFee: 0n,
            swapFeeBtc: 0n,
            feeRate: "",
            signatureData: undefined,
            data,
            networkFee: 0n,
            networkFeeBtc: 0n,
            confidence: 0,
            pr: paymentHash ?? undefined,
            exactIn: false
        };
        const swap = new ToBTCLNSwap(this, swapInit);
        swap.commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap.state = ToBTCSwapState.COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;

        // switch(state.type) {
        //     case SwapCommitStateType.PAID:
        //         secret ??= await state.getClaimResult();
        //         await swap._setPaymentResult({secret}, false);
        //         swap.claimTxId = await state.getClaimTxId();
        //         swap.state = ToBTCSwapState.CLAIMED;
        //         break;
        //     case SwapCommitStateType.NOT_COMMITED:
        //     case SwapCommitStateType.EXPIRED:
        //         if(state.getRefundTxId==null) return null;
        //         swap.refundTxId = await state.getRefundTxId();
        //         swap.state = ToBTCSwapState.REFUNDED;
        //         break;
        //     case SwapCommitStateType.COMMITED:
        //         swap.state = ToBTCSwapState.COMMITED;
        //         //Try to fetch refund signature
        //         if(lp!=null) await swap._sync(false, false, state);
        //         break;
        //     case SwapCommitStateType.REFUNDABLE:
        //         swap.state = ToBTCSwapState.REFUNDABLE;
        //         break;
        // }
    }

}
