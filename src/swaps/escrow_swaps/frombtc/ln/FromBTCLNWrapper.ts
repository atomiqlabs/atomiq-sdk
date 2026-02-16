import {FromBTCLNSwap, FromBTCLNSwapInit, FromBTCLNSwapState} from "./FromBTCLNSwap";
import {decode as bolt11Decode, PaymentRequestObject, TagsObject} from "@atomiqlabs/bolt11";
import {
    ChainSwapType,
    ChainType,
    ClaimEvent,
    InitializeEvent, LightningNetworkApi,
    RefundEvent, SwapCommitState, SwapCommitStateType
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
import {AllOptional} from "../../../../utils/TypeUtils";
import {sha256} from "@noble/hashes/sha2";

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
 * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement
 *  of the swap on the destination network once the lightning network payment is received by the LP.
 *
 * @category Swaps
 */
export class FromBTCLNWrapper<
    T extends ChainType
> extends IFromBTCLNWrapper<T, FromBTCLNDefinition<T>, FromBTCLNWrapperOptions> implements IClaimableSwapWrapper<FromBTCLNSwap<T>> {

    public readonly TYPE: SwapType.FROM_BTCLN = SwapType.FROM_BTCLN;

    /**
     * @internal
     */
    protected readonly tickSwapState = [
        FromBTCLNSwapState.PR_CREATED,
        FromBTCLNSwapState.PR_PAID,
        FromBTCLNSwapState.CLAIM_COMMITED
    ];

    /**
     * @internal
     */
    readonly _pendingSwapStates = [
        FromBTCLNSwapState.PR_CREATED,
        FromBTCLNSwapState.QUOTE_SOFT_EXPIRED,
        FromBTCLNSwapState.PR_PAID,
        FromBTCLNSwapState.CLAIM_COMMITED,
        FromBTCLNSwapState.EXPIRED
    ];
    /**
     * @internal
     */
    readonly _claimableSwapStates = [FromBTCLNSwapState.CLAIM_COMMITED];
    /**
     * @internal
     */
    readonly _swapDeserializer = FromBTCLNSwap;

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

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventInitialize(swap: FromBTCLNSwap<T>, event: InitializeEvent<T["Data"]>): Promise<boolean> {
        if(swap._state===FromBTCLNSwapState.PR_PAID || swap._state===FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = FromBTCLNSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventClaim(swap: FromBTCLNSwap<T>, event: ClaimEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==FromBTCLNSwapState.FAILED && swap._state!==FromBTCLNSwapState.CLAIM_CLAIMED) {
            swap._state = FromBTCLNSwapState.CLAIM_CLAIMED;
            swap._setSwapSecret(event.result);
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventRefund(swap: FromBTCLNSwap<T>, event: RefundEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==FromBTCLNSwapState.CLAIM_CLAIMED && swap._state!==FromBTCLNSwapState.FAILED) {
            swap._state = FromBTCLNSwapState.FAILED;
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
     *
     * @throws {IntermediaryError} in case the response is invalid
     *
     * @private
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
     * Returns a newly created legacy Lightning -> Smart chain swap using the HTLC based escrow swap protocol,
     *  where the user needs to manually settle swap on the destination smart chain. The user has to pay
     *  a bolt11 invoice on the input lightning network side.
     *
     * @param recipient Smart chain signer's address on the destination chain, that will have to manually
     *  settle the swap.
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     * @param preFetches Optional pre-fetches for speeding up the quoting process (mainly used internally)
     */
    create(
        recipient: string,
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
        options.unsafeSkipLnNodeCheck ??= this._options.unsafeSkipLnNodeCheck;

        if(options.descriptionHash!=null && options.descriptionHash.length!==32)
            throw new UserError("Invalid description hash length");

        const {secret, paymentHash} = this.getSecretAndHash();
        const claimHash = this._contract.getHashForHtlc(paymentHash);

        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();

        const _abortController = extendAbortController(abortSignal);
        const _preFetches = {
            pricePrefetchPromise: preFetches?.pricePrefetchPromise ?? this.preFetchPrice(amountData, _abortController.signal),
            feeRatePromise: preFetches?.feeRatePromise ?? this.preFetchFeeRate(recipient, amountData, claimHash.toString("hex"), _abortController),
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
                                claimer: recipient,
                                token: amountData.token.toString(),
                                descriptionHash: options?.descriptionHash,
                                exactOut: !amountData.exactIn,
                                feeRate: throwIfUndefined(_preFetches.feeRatePromise),
                                additionalParams
                            },
                            this._options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined
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
                            initialSwapData: await this._contract.createSwapData(
                                ChainSwapType.HTLC, lp.getAddress(this.chainIdentifier), recipient, amountData.token,
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
     * Returns a newly created legacy Lightning -> Smart chain swap using the HTLC based escrow swap protocol,
     *  where the user needs to manually settle swap on the destination smart chain. The swap is created
     *  with an LNURL-withdraw link which will be used to pay the generated bolt11 invoice automatically
     *  when {@link FromBTCLNSwap.waitForPayment} is called on the swap.
     *
     * @param recipient Smart chain signer's address on the destination chain, that will have to manually
     *  settle the swap.
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    async createViaLNURL(
        recipient: string,
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
            feeRatePromise: this.preFetchFeeRate(recipient, amountData, undefined, abortController)
        };

        try {
            const exactOutAmountPromise: Promise<bigint | undefined> | undefined = !amountData.exactIn ? preFetches.pricePrefetchPromise.then(price =>
                this._prices.getToBtcSwapAmount(this.chainIdentifier, amountData.amount, amountData.token, abortController.signal, price)
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

            return this.create(recipient, amountData, lps, undefined, additionalParams, abortSignal, preFetches).map(data => {
                return {
                    quote: data.quote.then(quote => {
                        quote._setLNURLData(
                            withdrawRequest.url,
                            withdrawRequest.k1,
                            withdrawRequest.callback
                        )

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

    /**
     * @inheritDoc
     * @internal
     */
    protected async _checkPastSwaps(pastSwaps: FromBTCLNSwap<T>[]): Promise<{
        changedSwaps: FromBTCLNSwap<T>[];
        removeSwaps: FromBTCLNSwap<T>[]
    }> {
        const changedSwapSet: Set<FromBTCLNSwap<T>> = new Set();

        const swapExpiredStatus: {[id: string]: boolean} = {};
        const checkStatusSwaps: (FromBTCLNSwap<T> & {_data: T["Data"]})[] = [];

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
            if(pastSwap._shouldFetchOnchainState()) {
                //Add to swaps for which status should be checked
                if(pastSwap._data!=null) checkStatusSwaps.push(pastSwap as (FromBTCLNSwap<T> & {_data: T["Data"]}));
            }
        }));

        const swapStatuses = await this._contract.getCommitStatuses(checkStatusSwaps.map(val => ({signer: val._getInitiator(), swapData: val._data})));

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

    /**
     * @inheritDoc
     * @internal
     */
    async recoverFromSwapDataAndState(
        init: {data: T["Data"], getInitTxId: () => Promise<string>, getTxBlock: () => Promise<{blockTime: number, blockHeight: number}>},
        state: SwapCommitState,
        lp?: Intermediary
    ): Promise<FromBTCLNSwap<T> | null> {
        const data = init.data;

        let paymentHash = data.getHTLCHashHint();
        let secret: string | undefined;
        if(state.type===SwapCommitStateType.PAID) {
            secret = await state.getClaimResult();
            paymentHash = Buffer.from(sha256(Buffer.from(secret, "hex"))).toString("hex");
        }

        const swapInit: FromBTCLNSwapInit<T["Data"]> = {
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
            initialSwapData: data,
            data,
            pr: paymentHash ?? undefined,
            secret,
            exactIn: false
        }
        const swap = new FromBTCLNSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = FromBTCLNSwapState.CLAIM_COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }

}
