import {decode as bolt11Decode, PaymentRequestObject, TagsObject} from "@atomiqlabs/bolt11";
import {
    ChainSwapType,
    ChainType,
    ClaimEvent,
    InitializeEvent, LightningNetworkApi, Messenger,
    RefundEvent, SwapCommitState, SwapCommitStateType
} from "@atomiqlabs/base";
import {Intermediary} from "../../../../intermediaries/Intermediary";
import {Buffer} from "buffer";
import {UserError} from "../../../../errors/UserError";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {SwapType} from "../../../../enums/SwapType";
import {
    extendAbortController,
    randomBytes,
    throwIfUndefined
} from "../../../../utils/Utils";
import {
    FromBTCLNAutoResponseType,
    IntermediaryAPI
} from "../../../../intermediaries/apis/IntermediaryAPI";
import {RequestError} from "../../../../errors/RequestError";
import {ISwapPrice} from "../../../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {ISwapWrapperOptions, WrapperCtorTokens} from "../../../ISwapWrapper";
import {UnifiedSwapEventListener} from "../../../../events/UnifiedSwapEventListener";
import {UnifiedSwapStorage} from "../../../../storage/UnifiedSwapStorage";
import {ISwap} from "../../../ISwap";
import {FromBTCLNAutoSwap, FromBTCLNAutoSwapInit, FromBTCLNAutoSwapState} from "./FromBTCLNAutoSwap";
import {IFromBTCLNDefinition, IFromBTCLNWrapper} from "../IFromBTCLNWrapper";
import {IClaimableSwapWrapper} from "../../../IClaimableSwapWrapper";
import {AmountData} from "../../../../types/AmountData";
import {LNURLWithdrawParamsWithUrl} from "../../../../types/lnurl/LNURLWithdraw";
import {tryWithRetries} from "../../../../utils/RetryUtils";
import {AllOptional} from "../../../../utils/TypeUtils";
import {sha256} from "@noble/hashes/sha2";

export type FromBTCLNAutoOptions = {
    descriptionHash?: Buffer,
    unsafeSkipLnNodeCheck?: boolean,
    gasAmount?: bigint,
    unsafeZeroWatchtowerFee?: boolean,
    feeSafetyFactor?: number
};

export type FromBTCLNAutoWrapperOptions = ISwapWrapperOptions & {
    safetyFactor: number,
    bitcoinBlocktime: number,
    unsafeSkipLnNodeCheck: boolean
};

export type FromBTCLNAutoDefinition<T extends ChainType> = IFromBTCLNDefinition<T, FromBTCLNAutoWrapper<T>, FromBTCLNAutoSwap<T>>;

/**
 * New escrow based (HTLC) swaps for Bitcoin Lightning -> Smart chain swaps not requiring manual settlement on
 *  the destination by the user, and instead letting the LP initiate the escrow. Permissionless watchtower network
 *  handles the claiming of HTLC, with the swap secret broadcasted over Nostr. Also adds a possibility for the user
 *  to receive a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Lightning → Smart chain
 */
export class FromBTCLNAutoWrapper<
    T extends ChainType
> extends IFromBTCLNWrapper<T, FromBTCLNAutoDefinition<T>, FromBTCLNAutoWrapperOptions> implements IClaimableSwapWrapper<FromBTCLNAutoSwap<T>> {

    public readonly TYPE: SwapType.FROM_BTCLN_AUTO = SwapType.FROM_BTCLN_AUTO;

    /**
     * @internal
     */
    protected readonly tickSwapState = [
        FromBTCLNAutoSwapState.PR_CREATED,
        FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED,
        FromBTCLNAutoSwapState.PR_PAID,
        FromBTCLNAutoSwapState.CLAIM_COMMITED
    ];

    /**
     * @internal
     */
    readonly _pendingSwapStates = [
        FromBTCLNAutoSwapState.PR_CREATED,
        FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED,
        FromBTCLNAutoSwapState.PR_PAID,
        FromBTCLNAutoSwapState.CLAIM_COMMITED,
        FromBTCLNAutoSwapState.EXPIRED
    ];
    /**
     * @internal
     */
    readonly _claimableSwapStates = [FromBTCLNAutoSwapState.CLAIM_COMMITED];
    /**
     * @internal
     */
    readonly _swapDeserializer = FromBTCLNAutoSwap;
    /**
     * @internal
     */
    readonly _messenger: Messenger;

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
     * @param messenger
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
        messenger: Messenger,
        options?: AllOptional<FromBTCLNAutoWrapperOptions>,
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
        this._messenger = messenger;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected async processEventInitialize(swap: FromBTCLNAutoSwap<T>, event: InitializeEvent<T["Data"]>): Promise<boolean> {
        if(swap._state===FromBTCLNAutoSwapState.PR_PAID || swap._state===FromBTCLNAutoSwapState.PR_CREATED || swap._state===FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
            if(swap._data==null) {
                //Obtain data from the initialize event
                const eventData = await event.swapData();
                if(eventData==null) {
                    this.logger.error("processEventInitialize("+swap.getId()+"): Error when fetching swap data for swap, null returned!");
                    return false;
                }
                try {
                    await swap._saveRealSwapData(eventData, false);
                    this.logger.info("processEventInitialize("+swap.getId()+"): Successfully taken swap data from on-chain event!");
                } catch (e) {
                    this.logger.error("processEventInitialize("+swap.getId()+"): Error when saving swap data for swap: ", e);
                    return false;
                }
            }

            if(swap._getEscrowHash()!==event.escrowHash) {
                this.logger.error("processEventInitialize("+swap.getId()+"): Error when processing event, escrow hashes don't match!");
                return false;
            }

            swap._commitTxId = event.meta?.txId;
            swap._state = FromBTCLNAutoSwapState.CLAIM_COMMITED;
            swap._broadcastSecret().catch(e => {
                this.logger.error("processEventInitialize("+swap.getId()+"): Error when broadcasting swap secret: ", e);
            });
            return true;
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventClaim(swap: FromBTCLNAutoSwap<T>, event: ClaimEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==FromBTCLNAutoSwapState.FAILED && swap._state!==FromBTCLNAutoSwapState.CLAIM_CLAIMED) {
            swap._claimTxId = event.meta?.txId;
            swap._state = FromBTCLNAutoSwapState.CLAIM_CLAIMED;
            swap._setSwapSecret(event.result);
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventRefund(swap: FromBTCLNAutoSwap<T>, event: RefundEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==FromBTCLNAutoSwapState.CLAIM_CLAIMED && swap._state!==FromBTCLNAutoSwapState.FAILED) {
            swap._refundTxId ??= event.meta?.txId;
            swap._state = FromBTCLNAutoSwapState.FAILED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * Pre-fetches claimer (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param signer Smartchain signer address initiating the swap
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     *
     * @private
     */
    private async preFetchClaimerBounty(
        signer: string,
        amountData: AmountData,
        options: {feeSafetyFactor: number, unsafeZeroWatchtowerFee: boolean},
        abortController: AbortController
    ): Promise<bigint | undefined> {
        if(options.unsafeZeroWatchtowerFee) return 0n;

        const dummyAmount = BigInt(Math.floor(Math.random()* 0x1000000));
        const dummySwapData = await this._contract.createSwapData(
            ChainSwapType.HTLC, this._chain.randomAddress(), signer, amountData.token,
            dummyAmount, this._contract.getHashForHtlc(randomBytes(32)).toString("hex"),
            this.getRandomSequence(), BigInt(Math.floor(Date.now()/1000)), false, true,
            BigInt(Math.floor(Math.random() * 0x10000)), BigInt(Math.floor(Math.random() * 0x10000))
        );

        try {
            const result = await this._contract.getClaimFee(this._chain.randomAddress(), dummySwapData);
            return result * BigInt(Math.floor(options.feeSafetyFactor*1000000)) / 1_000_000n
        } catch (e) {
            abortController.abort(e);
        }
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
     * @param claimerBounty Claimer bounty as request by the user
     *
     * @throws {IntermediaryError} in case the response is invalid
     *
     * @private
     */
    private verifyReturnedData(
        resp: FromBTCLNAutoResponseType,
        amountData: AmountData,
        lp: Intermediary,
        options: {gasAmount: bigint, descriptionHash?: Buffer},
        decodedPr: PaymentRequestObject & {tagsObject: TagsObject},
        paymentHash: Buffer,
        claimerBounty: bigint
    ): void {
        if(lp.getAddress(this.chainIdentifier)!==resp.intermediaryKey) throw new IntermediaryError("Invalid intermediary address/pubkey");

        if(options.descriptionHash!=null && decodedPr.tagsObject.purpose_commit_hash!==options.descriptionHash.toString("hex"))
            throw new IntermediaryError("Invalid pr returned - description hash");

        if(
            decodedPr.tagsObject.payment_hash==null ||
            !Buffer.from(decodedPr.tagsObject.payment_hash, "hex").equals(paymentHash)
        ) throw new IntermediaryError("Invalid pr returned - payment hash");

        if(decodedPr.millisatoshis==null) throw new IntermediaryError("Invalid pr returned - msat field");

        const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
        if(resp.btcAmountGas + resp.btcAmountSwap !== amountIn) throw new IntermediaryError("Invalid total btc returned");
        if(resp.gasSwapFeeBtc + resp.swapFeeBtc !== resp.totalFeeBtc) throw new IntermediaryError("Invalid total btc fee returned");
        if(resp.claimerBounty !== claimerBounty) throw new IntermediaryError("Invalid claimer bounty");
        if(resp.totalGas !== options.gasAmount) throw new IntermediaryError("Invalid total gas amount");
        if(!amountData.exactIn) {
            if(resp.total != amountData.amount) throw new IntermediaryError("Invalid amount returned");
        } else {
            if(amountIn !== amountData.amount) throw new IntermediaryError("Invalid payment request returned, amount mismatch");
        }
    }

    /**
     * Returns a newly created Lightning -> Smart chain swap using the HTLC based escrow swap protocol,
     *  where watchtowers handle the automatic settlement of the swap on the destination chain. Also allows
     *  specifying additional "gas drop" native token that the receipient receives on the destination chain
     *  in the `options` argument. The user has to pay a bolt11 invoice on the input lightning network side.
     *
     * @param recipient Recipient's address on the destination chain
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
        options?: FromBTCLNAutoOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal,
        preFetches?: {
            pricePrefetchPromise?: Promise<bigint | undefined>,
            usdPricePrefetchPromise?: Promise<number | undefined>,
            gasTokenPricePrefetchPromise?: Promise<bigint | undefined>,
            claimerBountyPrefetch?: Promise<bigint | undefined>,
        }
    ): {
        quote: Promise<FromBTCLNAutoSwap<T>>,
        intermediary: Intermediary
    }[] {
        const _options = {
            unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? this._options.unsafeSkipLnNodeCheck,
            gasAmount: options?.gasAmount ?? 0n,
            feeSafetyFactor: options?.feeSafetyFactor ?? 1.25, //No need to add much of a margin, since the claim should happen rather soon
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false,
            descriptionHash: options?.descriptionHash
        };

        if(preFetches==null) preFetches = {};

        if(_options.descriptionHash!=null && _options.descriptionHash.length!==32)
            throw new UserError("Invalid description hash length");

        const {secret, paymentHash} = this.getSecretAndHash();
        const claimHash = this._contract.getHashForHtlc(paymentHash);

        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();

        const _abortController = extendAbortController(abortSignal);
        const _preFetches = {
            pricePrefetchPromise: preFetches?.pricePrefetchPromise ?? this.preFetchPrice(amountData, _abortController.signal),
            usdPricePrefetchPromise: preFetches?.usdPricePrefetchPromise ?? this.preFetchUsdPrice(_abortController.signal),
            claimerBountyPrefetch: preFetches?.claimerBountyPrefetch ?? this.preFetchClaimerBounty(recipient, amountData, _options, _abortController),
            gasTokenPricePrefetchPromise: _options.gasAmount!==0n || !_options.unsafeZeroWatchtowerFee ?
                (preFetches.gasTokenPricePrefetchPromise ??= this.preFetchPrice({token: nativeTokenAddress}, _abortController.signal)) :
                undefined
        };

        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if(lp.services[SwapType.FROM_BTCLN_AUTO]==null) throw new Error("LP service for processing from btcln auto swaps not found!");

                    const abortController = extendAbortController(_abortController.signal);

                    const liquidityPromise: Promise<bigint | undefined> = this.preFetchIntermediaryLiquidity(amountData, lp, abortController);

                    const {lnCapacityPromise, resp} = await tryWithRetries(async(retryCount: number) => {
                        const {lnPublicKey, response} = IntermediaryAPI.initFromBTCLNAuto(
                            this.chainIdentifier, lp.url,
                            {
                                paymentHash,
                                amount: amountData.amount,
                                claimer: recipient,
                                token: amountData.token.toString(),
                                descriptionHash: _options.descriptionHash,
                                exactOut: !amountData.exactIn,
                                additionalParams,
                                gasToken: this._chain.getNativeCurrencyAddress(),
                                gasAmount: _options.gasAmount,
                                claimerBounty: throwIfUndefined(_preFetches.claimerBountyPrefetch)
                            },
                            this._options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined
                        );

                        return {
                            lnCapacityPromise: _options.unsafeSkipLnNodeCheck ? undefined : this.preFetchLnCapacity(lnPublicKey),
                            resp: await response
                        };
                    }, undefined, RequestError, abortController.signal);

                    const decodedPr = bolt11Decode(resp.pr);
                    if(decodedPr.millisatoshis==null) throw new IntermediaryError("Invalid returned swap invoice, no msat amount field");
                    if(decodedPr.timeExpireDate==null) throw new IntermediaryError("Invalid returned swap invoice, no expiry date field");
                    const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
                    const claimerBounty = (await _preFetches.claimerBountyPrefetch)!;

                    try {
                        this.verifyReturnedData(resp, amountData, lp, _options, decodedPr, paymentHash, claimerBounty);
                        const [pricingInfo, gasPricingInfo] = await Promise.all([
                            this.verifyReturnedPrice(
                                lp.services[SwapType.FROM_BTCLN_AUTO],
                                false, resp.btcAmountSwap,
                                resp.total,
                                amountData.token, {}, _preFetches.pricePrefetchPromise, _preFetches.usdPricePrefetchPromise, abortController.signal
                            ),
                            _options.gasAmount===0n ? Promise.resolve(undefined) : this.verifyReturnedPrice(
                                {...lp.services[SwapType.FROM_BTCLN_AUTO], swapBaseFee: 0}, //Base fee should be charged only on the amount, not on gas
                                false, resp.btcAmountGas,
                                resp.totalGas + resp.claimerBounty,
                                nativeTokenAddress, {}, _preFetches.gasTokenPricePrefetchPromise, _preFetches.usdPricePrefetchPromise, abortController.signal
                            ),
                            this.verifyIntermediaryLiquidity(resp.total, throwIfUndefined(liquidityPromise)),
                            _options.unsafeSkipLnNodeCheck ? Promise.resolve() : this.verifyLnNodeCapacity(lp, decodedPr, lnCapacityPromise, abortController.signal)
                        ]);

                        const swapInit: FromBTCLNAutoSwapInit<T["Data"]> = {
                            pricingInfo,
                            url: lp.url,
                            expiry: decodedPr.timeExpireDate*1000,

                            swapFee: resp.swapFee,
                            gasSwapFee: resp.gasSwapFee,

                            swapFeeBtc: resp.swapFeeBtc,
                            gasSwapFeeBtc: resp.gasSwapFeeBtc,

                            btcAmountGas: resp.btcAmountGas,
                            btcAmountSwap: resp.btcAmountSwap,

                            gasPricingInfo,

                            initialSwapData: await this._contract.createSwapData(
                                ChainSwapType.HTLC, lp.getAddress(this.chainIdentifier), recipient, amountData.token,
                                resp.total, claimHash.toString("hex"),
                                this.getRandomSequence(), BigInt(Math.floor(Date.now()/1000)), false, true,
                                _options.gasAmount + resp.claimerBounty, resp.claimerBounty, nativeTokenAddress
                            ),
                            pr: resp.pr,
                            secret: secret.toString("hex"),
                            exactIn: amountData.exactIn ?? true
                        };
                        const quote = new FromBTCLNAutoSwap<T>(this, swapInit);
                        await quote._save();
                        this.logger.debug("create(): Created new FromBTCLNAutoSwap quote, claimHash (pseudo escrowHash): ", quote._getEscrowHash());
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
     * Returns a newly created Lightning -> Smart chain swap using the HTLC based escrow swap protocol,
     *  where watchtowers handle the automatic settlement of the swap on the destination chain. Also allows
     *  specifying additional "gas drop" native token that the receipient receives on the destination chain
     *  in the `options` argument. The swap is created with an LNURL-withdraw link which will be used to pay
     *  the generated bolt11 invoice automatically when {@link FromBTCLNSwap.waitForPayment} is called on the
     *  swap.
     *
     * @param recipient Recipient's address on the destination chain
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    async createViaLNURL(
        recipient: string,
        lnurl: string | LNURLWithdrawParamsWithUrl,
        amountData: AmountData,
        lps: Intermediary[],
        options?: FromBTCLNAutoOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): Promise<{
        quote: Promise<FromBTCLNAutoSwap<T>>,
        intermediary: Intermediary
    }[]> {
        const _options = {
            unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? this._options.unsafeSkipLnNodeCheck,
            gasAmount: options?.gasAmount ?? 0n,
            feeSafetyFactor: options?.feeSafetyFactor ?? 1.25, //No need to add much of a margin, since the claim should happen rather soon
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false,
            descriptionHash: options?.descriptionHash
        };

        const abortController = extendAbortController(abortSignal);
        const preFetches = {
            pricePrefetchPromise: this.preFetchPrice(amountData, abortController.signal),
            usdPricePrefetchPromise: this.preFetchUsdPrice(abortController.signal),
            gasTokenPricePrefetchPromise: _options.gasAmount!==0n || !_options.unsafeZeroWatchtowerFee ?
                this.preFetchPrice({token: this._chain.getNativeCurrencyAddress()}, abortController.signal) :
                undefined,
            claimerBountyPrefetch: this.preFetchClaimerBounty(recipient, amountData, _options, abortController)
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

            return this.create(recipient, amountData, lps, _options, additionalParams, abortSignal, preFetches).map(data => {
                return {
                    quote: data.quote.then(quote => {
                        quote._setLNURLData(
                            withdrawRequest.url,
                            withdrawRequest.k1,
                            withdrawRequest.callback
                        );

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
    protected async _checkPastSwaps(pastSwaps: FromBTCLNAutoSwap<T>[]): Promise<{
        changedSwaps: FromBTCLNAutoSwap<T>[];
        removeSwaps: FromBTCLNAutoSwap<T>[]
    }> {
        const changedSwapSet: Set<FromBTCLNAutoSwap<T>> = new Set();

        const swapExpiredStatus: {[id: string]: boolean} = {};
        const checkStatusSwaps: (FromBTCLNAutoSwap<T> & {_data: T["Data"]})[] = [];

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
                if(pastSwap._data!=null) checkStatusSwaps.push(pastSwap as FromBTCLNAutoSwap<T> & {_data: T["Data"]});
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

        const changedSwaps: FromBTCLNAutoSwap<T>[] = [];
        const removeSwaps: FromBTCLNAutoSwap<T>[] = [];
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
     */
    async recoverFromSwapDataAndState(
        init: {data: T["Data"], getInitTxId: () => Promise<string>, getTxBlock: () => Promise<{blockTime: number, blockHeight: number}>},
        state: SwapCommitState,
        lp?: Intermediary
    ): Promise<FromBTCLNAutoSwap<T> | null> {
        const data = init.data;

        let paymentHash = data.getHTLCHashHint();
        let secret: string | undefined;
        if(state.type===SwapCommitStateType.PAID) {
            secret = await state.getClaimResult();
            paymentHash = Buffer.from(sha256(Buffer.from(secret, "hex"))).toString("hex");
        }

        const swapInit: FromBTCLNAutoSwapInit<T["Data"]> = {
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
            gasSwapFee: 0n,
            gasSwapFeeBtc: 0n,
            initialSwapData: data,
            data,
            pr: paymentHash ?? undefined,
            secret,
            exactIn: false
        }
        const swap = new FromBTCLNAutoSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = FromBTCLNAutoSwapState.CLAIM_COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }

}
