import {FromBTCLNSwap, FromBTCLNSwapInit, FromBTCLNSwapState} from "./FromBTCLNSwap";
import {decode as bolt11Decode, PaymentRequestObject, TagsObject} from "@atomiqlabs/bolt11";
import {
    ChainSwapType,
    ChainType,
    ClaimEvent,
    InitializeEvent,
    RefundEvent
} from "@atomiqlabs/base";
import {Intermediary} from "../../../../intermediaries/Intermediary";
import {Buffer} from "buffer";
import {UserError} from "../../../../errors/UserError";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {SwapType} from "../../../../enums/SwapType";
import {
    extendAbortController,
    throwIfUndefined
} from "../../../../utils/Utils";
import {FromBTCLNResponseType, IntermediaryAPI} from "../../../../intermediaries/apis/IntermediaryAPI";
import {RequestError} from "../../../../errors/RequestError";
import {LightningNetworkApi} from "../../../../bitcoin/LightningNetworkApi";
import {ISwapPrice} from "../../../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {ISwapWrapperOptions, WrapperCtorTokens} from "../../../ISwapWrapper";
import {UnifiedSwapEventListener} from "../../../../events/UnifiedSwapEventListener";
import {UnifiedSwapStorage} from "../../../../storage/UnifiedSwapStorage";
import {ISwap} from "../../../ISwap";
import {IFromBTCLNDefinition, IFromBTCLNWrapper} from "../IFromBTCLNWrapper";
import {IClaimableSwapWrapper} from "../../../IClaimableSwapWrapper";
import {AmountData} from "../../../../types/AmountData";
import {LNURLWithdrawParamsWithUrl} from "../../../../types/lnurl/LNURLWithdraw";
import {tryWithRetries} from "../../../../utils/RetryUtils";
import {AllOptional, AllRequired} from "../../../../utils/TypeUtils";

export type FromBTCLNOptions = {
    descriptionHash?: Buffer,
    unsafeSkipLnNodeCheck?: boolean
};

export type FromBTCLNWrapperOptions = ISwapWrapperOptions & {
    unsafeSkipLnNodeCheck: boolean,
    safetyFactor: number,
    bitcoinBlocktime: number
};

export type FromBTCLNDefinition<T extends ChainType> = IFromBTCLNDefinition<T, FromBTCLNWrapper<T>, FromBTCLNSwap<T>>;

/**
 * Factory wrapper for creating Lightning BTC to Smart Chain swaps
 * @category Swaps
 */
export class FromBTCLNWrapper<
    T extends ChainType
> extends IFromBTCLNWrapper<T, FromBTCLNDefinition<T>, FromBTCLNWrapperOptions> implements IClaimableSwapWrapper<FromBTCLNSwap<T>> {

    public readonly claimableSwapStates = [FromBTCLNSwapState.CLAIM_COMMITED];
    public readonly TYPE = SwapType.FROM_BTCLN;
    public readonly swapDeserializer = FromBTCLNSwap;

    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Swap pricing handler
     * @param tokens
     * @param swapDataDeserializer Deserializer for SwapData
     * @param lnApi
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        contract: T["Contract"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        swapDataDeserializer: new (data: any) => T["Data"],
        lnApi: LightningNetworkApi,
        options?: AllOptional<FromBTCLNWrapperOptions>,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(
            chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, lnApi,
            {
                safetyFactor: options?.safetyFactor ?? 2,
                bitcoinBlocktime: options?.bitcoinBlocktime ?? 10*60,
                unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? false
            },
            events
        );
    }

    public readonly pendingSwapStates = [
        FromBTCLNSwapState.PR_CREATED,
        FromBTCLNSwapState.QUOTE_SOFT_EXPIRED,
        FromBTCLNSwapState.PR_PAID,
        FromBTCLNSwapState.CLAIM_COMMITED,
        FromBTCLNSwapState.EXPIRED
    ];
    public readonly tickSwapState = [
        FromBTCLNSwapState.PR_CREATED,
        FromBTCLNSwapState.PR_PAID,
        FromBTCLNSwapState.CLAIM_COMMITED
    ];

    protected processEventInitialize(swap: FromBTCLNSwap<T>, event: InitializeEvent<T["Data"]>): Promise<boolean> {
        if(swap.state===FromBTCLNSwapState.PR_PAID || swap.state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            swap.state = FromBTCLNSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    protected processEventClaim(swap: FromBTCLNSwap<T>, event: ClaimEvent<T["Data"]>): Promise<boolean> {
        if(swap.state!==FromBTCLNSwapState.FAILED && swap.state!==FromBTCLNSwapState.CLAIM_CLAIMED) {
            swap.state = FromBTCLNSwapState.CLAIM_CLAIMED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    protected processEventRefund(swap: FromBTCLNSwap<T>, event: RefundEvent<T["Data"]>): Promise<boolean> {
        if(swap.state!==FromBTCLNSwapState.CLAIM_CLAIMED && swap.state!==FromBTCLNSwapState.FAILED) {
            swap.state = FromBTCLNSwapState.FAILED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * Verifies response returned from intermediary
     *
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param decodedPr Decoded bolt11 lightning network invoice
     * @param paymentHash Expected payment hash of the bolt11 lightning network invoice
     * @private
     * @throws {IntermediaryError} in case the response is invalid
     */
    private verifyReturnedData(
        resp: FromBTCLNResponseType,
        amountData: AmountData,
        lp: Intermediary,
        options: FromBTCLNOptions,
        decodedPr: PaymentRequestObject & {tagsObject: TagsObject},
        paymentHash: Buffer
    ): void {
        if(lp.getAddress(this.chainIdentifier)!==resp.intermediaryKey) throw new IntermediaryError("Invalid intermediary address/pubkey");

        if(options.descriptionHash!=null && decodedPr.tagsObject.purpose_commit_hash!==options.descriptionHash.toString("hex"))
            throw new IntermediaryError("Invalid pr returned - description hash");

        if(
            decodedPr.tagsObject.payment_hash==null ||
            !Buffer.from(decodedPr.tagsObject.payment_hash, "hex").equals(paymentHash)
        ) throw new IntermediaryError("Invalid pr returned - payment hash");

        if(decodedPr.millisatoshis==null) throw new IntermediaryError("Invalid pr returned - msat field");

        if(!amountData.exactIn) {
            if(resp.total != amountData.amount) throw new IntermediaryError("Invalid amount returned");
        } else {
            const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
            if(amountIn !== amountData.amount) throw new IntermediaryError("Invalid payment request returned, amount mismatch");
        }
    }

    /**
     * Returns a newly created swap, receiving 'amount' on lightning network
     *
     * @param signer                Smart chain signer's address intiating the swap
     * @param amountData            Amount of token & amount to swap
     * @param lps                   LPs (liquidity providers) to get the quotes from
     * @param options               Quote options
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param abortSignal           Abort signal for aborting the process
     * @param preFetches
     */
    create(
        signer: string,
        amountData: AmountData,
        lps: Intermediary[],
        options?: FromBTCLNOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal,
        preFetches?: {
            usdPricePrefetchPromise: Promise<number | undefined>,
            pricePrefetchPromise?: Promise<bigint | undefined>,
            feeRatePromise?: Promise<string | undefined>
        }
    ): {
        quote: Promise<FromBTCLNSwap<T>>,
        intermediary: Intermediary
    }[] {
        if(options==null) options = {};
        options.unsafeSkipLnNodeCheck ??= this.options.unsafeSkipLnNodeCheck;

        if(options.descriptionHash!=null && options.descriptionHash.length!==32)
            throw new UserError("Invalid description hash length");

        const {secret, paymentHash} = this.getSecretAndHash();
        const claimHash = this.contract.getHashForHtlc(paymentHash);

        const nativeTokenAddress = this.chain.getNativeCurrencyAddress();

        const _abortController = extendAbortController(abortSignal);
        const _preFetches = {
            pricePrefetchPromise: preFetches?.pricePrefetchPromise ?? this.preFetchPrice(amountData, _abortController.signal),
            feeRatePromise: preFetches?.feeRatePromise ?? this.preFetchFeeRate(signer, amountData, claimHash.toString("hex"), _abortController),
            usdPricePrefetchPromise: preFetches?.usdPricePrefetchPromise ?? this.preFetchUsdPrice(_abortController.signal),
        }

        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if(lp.services[SwapType.FROM_BTCLN]==null) throw new Error("LP service for processing from btcln swaps not found!");

                    const abortController = extendAbortController(_abortController.signal);

                    const liquidityPromise: Promise<bigint | undefined> = this.preFetchIntermediaryLiquidity(amountData, lp, abortController);

                    const {lnCapacityPromise, resp} = await tryWithRetries(async(retryCount: number) => {
                        const {lnPublicKey, response} = IntermediaryAPI.initFromBTCLN(
                            this.chainIdentifier, lp.url, nativeTokenAddress,
                            {
                                paymentHash,
                                amount: amountData.amount,
                                claimer: signer,
                                token: amountData.token.toString(),
                                descriptionHash: options?.descriptionHash,
                                exactOut: !amountData.exactIn,
                                feeRate: throwIfUndefined(_preFetches.feeRatePromise),
                                additionalParams
                            },
                            this.options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined
                        );

                        return {
                            lnCapacityPromise: options?.unsafeSkipLnNodeCheck ? null : this.preFetchLnCapacity(lnPublicKey),
                            resp: await response
                        };
                    }, undefined, RequestError, abortController.signal);

                    const decodedPr = bolt11Decode(resp.pr);
                    if(decodedPr.millisatoshis==null) throw new IntermediaryError("Invalid returned swap invoice, no msat amount field");
                    if(decodedPr.timeExpireDate==null) throw new IntermediaryError("Invalid returned swap invoice, no expiry date field");
                    const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;

                    try {
                        this.verifyReturnedData(resp, amountData, lp, options ?? {}, decodedPr, paymentHash);
                        const [pricingInfo] = await Promise.all([
                            this.verifyReturnedPrice(
                                lp.services[SwapType.FROM_BTCLN], false, amountIn, resp.total,
                                amountData.token, {}, _preFetches.pricePrefetchPromise, _preFetches.usdPricePrefetchPromise, abortController.signal
                            ),
                            this.verifyIntermediaryLiquidity(resp.total, throwIfUndefined(liquidityPromise)),
                            lnCapacityPromise!=null ? this.verifyLnNodeCapacity(lp, decodedPr, lnCapacityPromise, abortController.signal) : Promise.resolve()
                        ]);

                        const quote = new FromBTCLNSwap<T>(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: decodedPr.timeExpireDate*1000,
                            swapFee: resp.swapFee,
                            swapFeeBtc: resp.swapFee * amountIn / (resp.total - resp.swapFee),
                            feeRate: (await _preFetches.feeRatePromise)!,
                            initialSwapData: await this.contract.createSwapData(
                                ChainSwapType.HTLC, lp.getAddress(this.chainIdentifier), signer, amountData.token,
                                resp.total, claimHash.toString("hex"),
                                this.getRandomSequence(), BigInt(Math.floor(Date.now()/1000)), false, true,
                                resp.securityDeposit, 0n, nativeTokenAddress
                            ),
                            pr: resp.pr,
                            secret: secret.toString("hex"),
                            exactIn: amountData.exactIn ?? true
                        } as FromBTCLNSwapInit<T["Data"]>);
                        await quote._save();
                        return quote;
                    } catch (e) {
                        abortController.abort(e);
                        throw e;
                    }
                })()
            }
        });
    }

    /**
     * Returns a newly created swap, receiving 'amount' from the lnurl-withdraw
     *
     * @param signer                Smart chains signer's address intiating the swap
     * @param lnurl                 LNURL-withdraw to withdraw funds from
     * @param amountData            Amount of token & amount to swap
     * @param lps                   LPs (liquidity providers) to get the quotes from
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param abortSignal           Abort signal for aborting the process
     */
    async createViaLNURL(
        signer: string,
        lnurl: string | LNURLWithdrawParamsWithUrl,
        amountData: AmountData,
        lps: Intermediary[],
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): Promise<{
        quote: Promise<FromBTCLNSwap<T>>,
        intermediary: Intermediary
    }[]> {
        if(!this.isInitialized) throw new Error("Not initialized, call init() first!");

        const abortController = extendAbortController(abortSignal);
        const preFetches = {
            pricePrefetchPromise: this.preFetchPrice(amountData, abortController.signal),
            usdPricePrefetchPromise: this.preFetchUsdPrice(abortController.signal),
            feeRatePromise: this.preFetchFeeRate(signer, amountData, undefined, abortController)
        };

        try {
            const exactOutAmountPromise: Promise<bigint | undefined> | undefined = !amountData.exactIn ? preFetches.pricePrefetchPromise.then(price =>
                this.prices.getToBtcSwapAmount(this.chainIdentifier, amountData.amount, amountData.token, abortController.signal, price)
            ).catch(e => {
                abortController.abort(e);
                return undefined;
            }) : undefined;

            const withdrawRequest = await this.getLNURLWithdraw(lnurl, abortController.signal);

            const min = BigInt(withdrawRequest.minWithdrawable) / 1000n;
            const max = BigInt(withdrawRequest.maxWithdrawable) / 1000n;

            if(amountData.exactIn) {
                if(amountData.amount < min) throw new UserError("Amount less than LNURL-withdraw minimum");
                if(amountData.amount > max) throw new UserError("Amount more than LNURL-withdraw maximum");
            } else {
                const amount = (await exactOutAmountPromise)!;
                abortController.signal.throwIfAborted();

                if((amount * 95n / 100n) < min) throw new UserError("Amount less than LNURL-withdraw minimum");
                if((amount * 105n / 100n) > max) throw new UserError("Amount more than LNURL-withdraw maximum");
            }

            return this.create(signer, amountData, lps, undefined, additionalParams, abortSignal, preFetches).map(data => {
                return {
                    quote: data.quote.then(quote => {
                        quote.lnurl = withdrawRequest.url;
                        quote.lnurlK1 = withdrawRequest.k1;
                        quote.lnurlCallback = withdrawRequest.callback;

                        const amountIn = quote.getInput().rawAmount!;
                        if(amountIn < min) throw new UserError("Amount less than LNURL-withdraw minimum");
                        if(amountIn > max) throw new UserError("Amount more than LNURL-withdraw maximum");

                        return quote;
                    }),
                    intermediary: data.intermediary
                }
            });
        } catch (e) {
            abortController.abort(e);
            throw e;
        }
    }

    protected async _checkPastSwaps(pastSwaps: FromBTCLNSwap<T>[]): Promise<{
        changedSwaps: FromBTCLNSwap<T>[];
        removeSwaps: FromBTCLNSwap<T>[]
    }> {
        const changedSwapSet: Set<FromBTCLNSwap<T>> = new Set();

        const swapExpiredStatus: {[id: string]: boolean} = {};
        const checkStatusSwaps: (FromBTCLNSwap<T> & {data: T["Data"]})[] = [];

        await Promise.all(pastSwaps.map(async (pastSwap) => {
            if(pastSwap._shouldCheckIntermediary()) {
                try {
                    const result = await pastSwap._checkIntermediaryPaymentReceived(false);
                    if(result!=null) {
                        changedSwapSet.add(pastSwap);
                    }
                } catch (e) {
                    this.logger.error(`_checkPastSwaps(): Failed to contact LP regarding swap ${pastSwap.getId()}, error: `, e);
                }
            }
            if(pastSwap._shouldFetchExpiryStatus()) {
                //Check expiry
                swapExpiredStatus[pastSwap.getId()] = await pastSwap._verifyQuoteDefinitelyExpired();
            }
            if(pastSwap._shouldFetchCommitStatus()) {
                //Add to swaps for which status should be checked
                if(pastSwap.data!=null) checkStatusSwaps.push(pastSwap as (FromBTCLNSwap<T> & {data: T["Data"]}));
            }
        }));

        const swapStatuses = await this.contract.getCommitStatuses(checkStatusSwaps.map(val => ({signer: val._getInitiator(), swapData: val.data})));

        for(let pastSwap of checkStatusSwaps) {
            const shouldSave = await pastSwap._sync(
                false, swapExpiredStatus[pastSwap.getId()],
                swapStatuses[pastSwap.getEscrowHash()!], true
            );
            if(shouldSave) {
                changedSwapSet.add(pastSwap);
            }
        }

        const changedSwaps: FromBTCLNSwap<T>[] = [];
        const removeSwaps: FromBTCLNSwap<T>[] = [];
        changedSwapSet.forEach(val => {
            if(val.isQuoteExpired()) {
                removeSwaps.push(val);
            } else {
                changedSwaps.push(val);
            }
        });

        return {
            changedSwaps,
            removeSwaps
        };
    }

}
