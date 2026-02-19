"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromBTCLNWrapper = void 0;
const FromBTCLNSwap_1 = require("./FromBTCLNSwap");
const bolt11_1 = require("@atomiqlabs/bolt11");
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
const UserError_1 = require("../../../../errors/UserError");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const SwapType_1 = require("../../../../enums/SwapType");
const Utils_1 = require("../../../../utils/Utils");
const IntermediaryAPI_1 = require("../../../../intermediaries/apis/IntermediaryAPI");
const RequestError_1 = require("../../../../errors/RequestError");
const IFromBTCLNWrapper_1 = require("../IFromBTCLNWrapper");
const RetryUtils_1 = require("../../../../utils/RetryUtils");
const sha2_1 = require("@noble/hashes/sha2");
/**
 * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement
 *  of the swap on the destination network once the lightning network payment is received by the LP.
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
class FromBTCLNWrapper extends IFromBTCLNWrapper_1.IFromBTCLNWrapper {
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
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, lnApi, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, lnApi, {
            safetyFactor: options?.safetyFactor ?? 2,
            bitcoinBlocktime: options?.bitcoinBlocktime ?? 10 * 60,
            unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? false
        }, events);
        this.TYPE = SwapType_1.SwapType.FROM_BTCLN;
        /**
         * @internal
         */
        this.tickSwapState = [
            FromBTCLNSwap_1.FromBTCLNSwapState.PR_CREATED,
            FromBTCLNSwap_1.FromBTCLNSwapState.PR_PAID,
            FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_COMMITED
        ];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            FromBTCLNSwap_1.FromBTCLNSwapState.PR_CREATED,
            FromBTCLNSwap_1.FromBTCLNSwapState.QUOTE_SOFT_EXPIRED,
            FromBTCLNSwap_1.FromBTCLNSwapState.PR_PAID,
            FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_COMMITED,
            FromBTCLNSwap_1.FromBTCLNSwapState.EXPIRED
        ];
        /**
         * @internal
         */
        this._claimableSwapStates = [FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_COMMITED];
        /**
         * @internal
         */
        this._swapDeserializer = FromBTCLNSwap_1.FromBTCLNSwap;
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventInitialize(swap, event) {
        if (swap._state === FromBTCLNSwap_1.FromBTCLNSwapState.PR_PAID || swap._state === FromBTCLNSwap_1.FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventClaim(swap, event) {
        if (swap._state !== FromBTCLNSwap_1.FromBTCLNSwapState.FAILED && swap._state !== FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_CLAIMED) {
            swap._state = FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_CLAIMED;
            swap._setSwapSecret(event.result);
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventRefund(swap, event) {
        if (swap._state !== FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_CLAIMED && swap._state !== FromBTCLNSwap_1.FromBTCLNSwapState.FAILED) {
            swap._state = FromBTCLNSwap_1.FromBTCLNSwapState.FAILED;
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
    verifyReturnedData(resp, amountData, lp, options, decodedPr, paymentHash) {
        if (lp.getAddress(this.chainIdentifier) !== resp.intermediaryKey)
            throw new IntermediaryError_1.IntermediaryError("Invalid intermediary address/pubkey");
        if (options.descriptionHash != null && decodedPr.tagsObject.purpose_commit_hash !== options.descriptionHash.toString("hex"))
            throw new IntermediaryError_1.IntermediaryError("Invalid pr returned - description hash");
        if (decodedPr.tagsObject.payment_hash == null ||
            !buffer_1.Buffer.from(decodedPr.tagsObject.payment_hash, "hex").equals(paymentHash))
            throw new IntermediaryError_1.IntermediaryError("Invalid pr returned - payment hash");
        if (decodedPr.millisatoshis == null)
            throw new IntermediaryError_1.IntermediaryError("Invalid pr returned - msat field");
        if (!amountData.exactIn) {
            if (resp.total != amountData.amount)
                throw new IntermediaryError_1.IntermediaryError("Invalid amount returned");
        }
        else {
            const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
            if (amountIn !== amountData.amount)
                throw new IntermediaryError_1.IntermediaryError("Invalid payment request returned, amount mismatch");
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
    create(recipient, amountData, lps, options, additionalParams, abortSignal, preFetches) {
        if (!this.isInitialized)
            throw new Error("Not initialized, call init() first!");
        if (options == null)
            options = {};
        options.unsafeSkipLnNodeCheck ??= this._options.unsafeSkipLnNodeCheck;
        if (options.paymentHash != null && options.paymentHash.length !== 32)
            throw new UserError_1.UserError("Invalid payment hash length, must be exactly 32 bytes!");
        if (options.descriptionHash != null && options.descriptionHash.length !== 32)
            throw new UserError_1.UserError("Invalid description hash length");
        let secret;
        let paymentHash;
        if (options?.paymentHash != null) {
            paymentHash = options.paymentHash;
        }
        else {
            ({ secret, paymentHash } = this.getSecretAndHash());
        }
        const claimHash = this._contract.getHashForHtlc(paymentHash);
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const _abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const _preFetches = {
            pricePrefetchPromise: preFetches?.pricePrefetchPromise ?? this.preFetchPrice(amountData, _abortController.signal),
            feeRatePromise: preFetches?.feeRatePromise ?? this.preFetchFeeRate(recipient, amountData, claimHash.toString("hex"), _abortController),
            usdPricePrefetchPromise: preFetches?.usdPricePrefetchPromise ?? this.preFetchUsdPrice(_abortController.signal),
        };
        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if (lp.services[SwapType_1.SwapType.FROM_BTCLN] == null)
                        throw new Error("LP service for processing from btcln swaps not found!");
                    const abortController = (0, Utils_1.extendAbortController)(_abortController.signal);
                    const liquidityPromise = this.preFetchIntermediaryLiquidity(amountData, lp, abortController);
                    const { lnCapacityPromise, resp } = await (0, RetryUtils_1.tryWithRetries)(async (retryCount) => {
                        const { lnPublicKey, response } = IntermediaryAPI_1.IntermediaryAPI.initFromBTCLN(this.chainIdentifier, lp.url, nativeTokenAddress, {
                            paymentHash,
                            amount: amountData.amount,
                            claimer: recipient,
                            token: amountData.token.toString(),
                            descriptionHash: options?.descriptionHash,
                            exactOut: !amountData.exactIn,
                            feeRate: (0, Utils_1.throwIfUndefined)(_preFetches.feeRatePromise),
                            additionalParams
                        }, this._options.postRequestTimeout, abortController.signal, retryCount > 0 ? false : undefined);
                        return {
                            lnCapacityPromise: options?.unsafeSkipLnNodeCheck ? null : this.preFetchLnCapacity(lnPublicKey),
                            resp: await response
                        };
                    }, undefined, RequestError_1.RequestError, abortController.signal);
                    const decodedPr = (0, bolt11_1.decode)(resp.pr);
                    if (decodedPr.millisatoshis == null)
                        throw new IntermediaryError_1.IntermediaryError("Invalid returned swap invoice, no msat amount field");
                    if (decodedPr.timeExpireDate == null)
                        throw new IntermediaryError_1.IntermediaryError("Invalid returned swap invoice, no expiry date field");
                    const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
                    try {
                        this.verifyReturnedData(resp, amountData, lp, options ?? {}, decodedPr, paymentHash);
                        const [pricingInfo] = await Promise.all([
                            this.verifyReturnedPrice(lp.services[SwapType_1.SwapType.FROM_BTCLN], false, amountIn, resp.total, amountData.token, {}, _preFetches.pricePrefetchPromise, _preFetches.usdPricePrefetchPromise, abortController.signal),
                            this.verifyIntermediaryLiquidity(resp.total, (0, Utils_1.throwIfUndefined)(liquidityPromise)),
                            lnCapacityPromise != null ? this.verifyLnNodeCapacity(lp, decodedPr, lnCapacityPromise, abortController.signal) : Promise.resolve()
                        ]);
                        const quote = new FromBTCLNSwap_1.FromBTCLNSwap(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: decodedPr.timeExpireDate * 1000,
                            swapFee: resp.swapFee,
                            swapFeeBtc: resp.swapFee * amountIn / (resp.total - resp.swapFee),
                            feeRate: (await _preFetches.feeRatePromise),
                            initialSwapData: await this._contract.createSwapData(base_1.ChainSwapType.HTLC, lp.getAddress(this.chainIdentifier), recipient, amountData.token, resp.total, claimHash.toString("hex"), this.getRandomSequence(), BigInt(Math.floor(Date.now() / 1000)), false, true, resp.securityDeposit, 0n, nativeTokenAddress),
                            pr: resp.pr,
                            secret: secret?.toString("hex"),
                            exactIn: amountData.exactIn ?? true
                        });
                        await quote._save();
                        return quote;
                    }
                    catch (e) {
                        abortController.abort(e);
                        throw e;
                    }
                })()
            };
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
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    async createViaLNURL(recipient, lnurl, amountData, lps, options, additionalParams, abortSignal) {
        if (!this.isInitialized)
            throw new Error("Not initialized, call init() first!");
        if (options?.paymentHash != null && options.paymentHash.length !== 32)
            throw new UserError_1.UserError("Invalid payment hash length, must be exactly 32 bytes!");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const preFetches = {
            pricePrefetchPromise: this.preFetchPrice(amountData, abortController.signal),
            usdPricePrefetchPromise: this.preFetchUsdPrice(abortController.signal),
            feeRatePromise: this.preFetchFeeRate(recipient, amountData, undefined, abortController)
        };
        try {
            const exactOutAmountPromise = !amountData.exactIn ? preFetches.pricePrefetchPromise.then(price => this._prices.getToBtcSwapAmount(this.chainIdentifier, amountData.amount, amountData.token, abortController.signal, price)).catch(e => {
                abortController.abort(e);
                return undefined;
            }) : undefined;
            const withdrawRequest = await this.getLNURLWithdraw(lnurl, abortController.signal);
            const min = BigInt(withdrawRequest.minWithdrawable) / 1000n;
            const max = BigInt(withdrawRequest.maxWithdrawable) / 1000n;
            if (amountData.exactIn) {
                if (amountData.amount < min)
                    throw new UserError_1.UserError("Amount less than LNURL-withdraw minimum");
                if (amountData.amount > max)
                    throw new UserError_1.UserError("Amount more than LNURL-withdraw maximum");
            }
            else {
                const amount = (await exactOutAmountPromise);
                abortController.signal.throwIfAborted();
                if ((amount * 95n / 100n) < min)
                    throw new UserError_1.UserError("Amount less than LNURL-withdraw minimum");
                if ((amount * 105n / 100n) > max)
                    throw new UserError_1.UserError("Amount more than LNURL-withdraw maximum");
            }
            return this.create(recipient, amountData, lps, options, additionalParams, abortSignal, preFetches).map(data => {
                return {
                    quote: data.quote.then(quote => {
                        quote._setLNURLData(withdrawRequest.url, withdrawRequest.k1, withdrawRequest.callback);
                        const amountIn = quote.getInput().rawAmount;
                        if (amountIn < min)
                            throw new UserError_1.UserError("Amount less than LNURL-withdraw minimum");
                        if (amountIn > max)
                            throw new UserError_1.UserError("Amount more than LNURL-withdraw maximum");
                        return quote;
                    }),
                    intermediary: data.intermediary
                };
            });
        }
        catch (e) {
            abortController.abort(e);
            throw e;
        }
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _checkPastSwaps(pastSwaps) {
        const changedSwapSet = new Set();
        const swapExpiredStatus = {};
        const checkStatusSwaps = [];
        await Promise.all(pastSwaps.map(async (pastSwap) => {
            if (pastSwap._shouldCheckIntermediary()) {
                try {
                    const result = await pastSwap._checkIntermediaryPaymentReceived(false);
                    if (result != null) {
                        changedSwapSet.add(pastSwap);
                    }
                }
                catch (e) {
                    this.logger.error(`_checkPastSwaps(): Failed to contact LP regarding swap ${pastSwap.getId()}, error: `, e);
                }
            }
            if (pastSwap._shouldFetchExpiryStatus()) {
                //Check expiry
                swapExpiredStatus[pastSwap.getId()] = await pastSwap._verifyQuoteDefinitelyExpired();
            }
            if (pastSwap._shouldFetchOnchainState()) {
                //Add to swaps for which status should be checked
                if (pastSwap._data != null)
                    checkStatusSwaps.push(pastSwap);
            }
        }));
        const swapStatuses = await this._contract.getCommitStatuses(checkStatusSwaps.map(val => ({ signer: val._getInitiator(), swapData: val._data })));
        for (let pastSwap of checkStatusSwaps) {
            const shouldSave = await pastSwap._sync(false, swapExpiredStatus[pastSwap.getId()], swapStatuses[pastSwap.getEscrowHash()], true);
            if (shouldSave) {
                changedSwapSet.add(pastSwap);
            }
        }
        const changedSwaps = [];
        const removeSwaps = [];
        changedSwapSet.forEach(val => {
            if (val.isQuoteExpired()) {
                removeSwaps.push(val);
            }
            else {
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
    async recoverFromSwapDataAndState(init, state, lp) {
        const data = init.data;
        let paymentHash = data.getHTLCHashHint();
        let secret;
        if (state.type === base_1.SwapCommitStateType.PAID) {
            secret = await state.getClaimResult();
            paymentHash = buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.from(secret, "hex"))).toString("hex");
        }
        const swapInit = {
            pricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100000000000000n,
                realPriceUSatPerToken: 100000000000000n,
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
        };
        const swap = new FromBTCLNSwap_1.FromBTCLNSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }
}
exports.FromBTCLNWrapper = FromBTCLNWrapper;
