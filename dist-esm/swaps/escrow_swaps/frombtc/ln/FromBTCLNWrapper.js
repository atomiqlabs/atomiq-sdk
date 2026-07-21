import { FromBTCLNSwap, FromBTCLNSwapState } from "./FromBTCLNSwap.js";
import { decode as bolt11Decode } from "@atomiqlabs/bolt11";
import { ChainSwapType, SwapCommitStateType } from "@atomiqlabs/base";
import { Intermediary } from "../../../../intermediaries/Intermediary.js";
import { Buffer } from "buffer";
import { UserError } from "../../../../errors/UserError.js";
import { IntermediaryError } from "../../../../errors/IntermediaryError.js";
import { SwapType } from "../../../../enums/SwapType.js";
import { extendAbortController, mapArrayToObject, parseHashValueExact32Bytes, throwIfUndefined } from "../../../../utils/Utils.js";
import { RequestError } from "../../../../errors/RequestError.js";
import { IFromBTCLNWrapper } from "../IFromBTCLNWrapper.js";
import { tryWithRetries } from "../../../../utils/RetryUtils.js";
import { sha256 } from "@noble/hashes/sha2";
/**
 * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement
 *  of the swap on the destination network once the lightning network payment is received by the LP.
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export class FromBTCLNWrapper extends IFromBTCLNWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param prices Swap pricing handler
     * @param tokens
     * @param versionedContracts
     * @param lnApi
     * @param lpApi
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, versionedContracts, lnApi, lpApi, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, versionedContracts, lnApi, lpApi, {
            ...options,
            safetyFactor: options?.safetyFactor ?? 2,
            bitcoinBlocktime: options?.bitcoinBlocktime ?? 10 * 60,
            unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? false
        }, events);
        this.TYPE = SwapType.FROM_BTCLN;
        /**
         * @internal
         */
        this.tickSwapState = [
            FromBTCLNSwapState.PR_CREATED,
            FromBTCLNSwapState.PR_PAID,
            FromBTCLNSwapState.CLAIM_COMMITED
        ];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            FromBTCLNSwapState.PR_CREATED,
            FromBTCLNSwapState.QUOTE_SOFT_EXPIRED,
            FromBTCLNSwapState.PR_PAID,
            FromBTCLNSwapState.CLAIM_COMMITED,
            FromBTCLNSwapState.EXPIRED
        ];
        /**
         * @internal
         */
        this._claimableSwapStates = [FromBTCLNSwapState.CLAIM_COMMITED];
        /**
         * @internal
         */
        this._swapDeserializer = FromBTCLNSwap;
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventInitialize(swap, event) {
        if (swap._state === FromBTCLNSwapState.PR_PAID || swap._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = FromBTCLNSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventClaim(swap, event) {
        if (swap._state !== FromBTCLNSwapState.FAILED && swap._state !== FromBTCLNSwapState.CLAIM_CLAIMED) {
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
    processEventRefund(swap, event) {
        if (swap._state !== FromBTCLNSwapState.CLAIM_CLAIMED && swap._state !== FromBTCLNSwapState.FAILED) {
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
    verifyReturnedData(resp, amountData, lp, options, decodedPr, paymentHash) {
        if (lp.getAddress(this.chainIdentifier) !== resp.intermediaryKey)
            throw new IntermediaryError("Invalid intermediary address/pubkey");
        if (options.descriptionHash != null && decodedPr.tagsObject.purpose_commit_hash !== options.descriptionHash.toString("hex"))
            throw new IntermediaryError("Invalid pr returned - description hash");
        if (options.description != null && decodedPr.tagsObject.description !== options.description)
            throw new IntermediaryError("Invalid pr returned - description");
        if (decodedPr.tagsObject.payment_hash == null ||
            !Buffer.from(decodedPr.tagsObject.payment_hash, "hex").equals(paymentHash))
            throw new IntermediaryError("Invalid pr returned - payment hash");
        if (decodedPr.millisatoshis == null)
            throw new IntermediaryError("Invalid pr returned - msat field");
        if (!amountData.exactIn) {
            if (resp.total != amountData.amount)
                throw new IntermediaryError("Invalid amount returned");
        }
        else {
            const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
            if (amountIn !== amountData.amount)
                throw new IntermediaryError("Invalid payment request returned, amount mismatch");
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
        const _options = {
            paymentHash: parseHashValueExact32Bytes(options?.paymentHash, "payment hash"),
            description: options?.description,
            descriptionHash: parseHashValueExact32Bytes(options?.descriptionHash, "description hash"),
            unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? this._options.unsafeSkipLnNodeCheck
        };
        if (_options.description != null && Buffer.byteLength(_options.description, "utf8") > 500)
            throw new UserError("Invalid description length");
        const lpVersions = Intermediary.getContractVersionsForLps(this.chainIdentifier, lps);
        let secret;
        let paymentHash;
        if (_options.paymentHash != null) {
            paymentHash = _options.paymentHash;
        }
        else {
            ({ secret, paymentHash } = this.getSecretAndHash());
        }
        const _hash = mapArrayToObject(lpVersions, (contractVersion) => {
            return this._contract(contractVersion).getHashForHtlc(paymentHash).toString("hex");
        });
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const _abortController = extendAbortController(abortSignal);
        const _preFetches = preFetches ?? {
            pricePrefetchPromise: this.preFetchPrice(amountData, _abortController.signal),
            feeRatePromise: this.preFetchFeeRate(recipient, amountData, _hash, _abortController, lpVersions),
            usdPricePrefetchPromise: this.preFetchUsdPrice(_abortController.signal),
        };
        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if (lp.services[SwapType.FROM_BTCLN] == null)
                        throw new Error("LP service for processing from btcln swaps not found!");
                    const version = lp.getContractVersion(this.chainIdentifier);
                    const abortController = extendAbortController(_abortController.signal);
                    const liquidityPromise = this.preFetchIntermediaryLiquidity(amountData, lp, abortController, version);
                    const { lnCapacityPromise, resp } = await tryWithRetries(async (retryCount) => {
                        const { lnPublicKey, response } = this._lpApi.initFromBTCLN(this.chainIdentifier, lp.url, nativeTokenAddress, {
                            paymentHash,
                            amount: amountData.amount,
                            claimer: recipient,
                            token: amountData.token.toString(),
                            description: _options.description,
                            descriptionHash: _options.descriptionHash,
                            exactOut: !amountData.exactIn,
                            feeRate: throwIfUndefined(_preFetches.feeRatePromise[version], "Network fee rate pre-fetch failed!"),
                            additionalParams
                        }, this._options.postRequestTimeout, abortController.signal, retryCount > 0 ? false : undefined);
                        let lnCapacityPromise;
                        if (!_options.unsafeSkipLnNodeCheck) {
                            lnCapacityPromise = this.preFetchLnCapacity(lnPublicKey);
                        }
                        else
                            lnPublicKey.catch(() => { });
                        return {
                            lnCapacityPromise,
                            resp: await response
                        };
                    }, undefined, RequestError, abortController.signal);
                    const decodedPr = bolt11Decode(resp.pr);
                    if (decodedPr.millisatoshis == null)
                        throw new IntermediaryError("Invalid returned swap invoice, no msat amount field");
                    if (decodedPr.timeExpireDate == null)
                        throw new IntermediaryError("Invalid returned swap invoice, no expiry date field");
                    const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
                    const swapFeeBtc = resp.swapFee * amountIn / (resp.total + resp.swapFee);
                    try {
                        this.verifyReturnedData(resp, amountData, lp, _options, decodedPr, paymentHash);
                        const [pricingInfo] = await Promise.all([
                            this.verifyReturnedPrice(lp.services[SwapType.FROM_BTCLN], false, amountIn, resp.total, amountData.token, { swapFeeBtc }, _preFetches.pricePrefetchPromise, _preFetches.usdPricePrefetchPromise, abortController.signal),
                            this.verifyIntermediaryLiquidity(resp.total, throwIfUndefined(liquidityPromise, "LP liquidity pre-fetch failed!")),
                            lnCapacityPromise != null ? this.verifyLnNodeCapacity(lp, decodedPr, lnCapacityPromise, abortController.signal) : Promise.resolve()
                        ]);
                        const quote = new FromBTCLNSwap(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: decodedPr.timeExpireDate * 1000,
                            swapFee: resp.swapFee,
                            swapFeeBtc,
                            feeRate: (await _preFetches.feeRatePromise[version]),
                            initialSwapData: await this._contract(version).createSwapData(ChainSwapType.HTLC, lp.getAddress(this.chainIdentifier), recipient, amountData.token, resp.total, _hash[version], this.getRandomSequence(), BigInt(Math.floor(Date.now() / 1000)), false, true, resp.securityDeposit, 0n, nativeTokenAddress),
                            pr: resp.pr,
                            secret: secret?.toString("hex"),
                            exactIn: amountData.exactIn ?? true,
                            contractVersion: version
                        });
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
        const _options = {
            paymentHash: parseHashValueExact32Bytes(options?.paymentHash, "payment hash"),
            description: options?.description,
            descriptionHash: parseHashValueExact32Bytes(options?.descriptionHash, "description hash"),
            unsafeSkipLnNodeCheck: options?.unsafeSkipLnNodeCheck ?? this._options.unsafeSkipLnNodeCheck
        };
        const lpVersions = Intermediary.getContractVersionsForLps(this.chainIdentifier, lps);
        const abortController = extendAbortController(abortSignal);
        const preFetches = {
            pricePrefetchPromise: this.preFetchPrice(amountData, abortController.signal),
            usdPricePrefetchPromise: this.preFetchUsdPrice(abortController.signal),
            feeRatePromise: this.preFetchFeeRate(recipient, amountData, undefined, abortController, lpVersions)
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
                    throw new UserError("Amount less than LNURL-withdraw minimum");
                if (amountData.amount > max)
                    throw new UserError("Amount more than LNURL-withdraw maximum");
            }
            else {
                const amount = (await exactOutAmountPromise);
                abortController.signal.throwIfAborted();
                if ((amount * 95n / 100n) < min)
                    throw new UserError("Amount less than LNURL-withdraw minimum");
                if ((amount * 105n / 100n) > max)
                    throw new UserError("Amount more than LNURL-withdraw maximum");
            }
            return this.create(recipient, amountData, lps, _options, additionalParams, abortSignal, preFetches).map(data => {
                return {
                    quote: data.quote.then(quote => {
                        quote._setLNURLData(withdrawRequest.url, withdrawRequest.k1, withdrawRequest.callback);
                        const amountIn = quote.getInput().rawAmount;
                        if (amountIn < min)
                            throw new UserError("Amount less than LNURL-withdraw minimum");
                        if (amountIn > max)
                            throw new UserError("Amount more than LNURL-withdraw maximum");
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
        const checkStatusSwaps = {};
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
                    (checkStatusSwaps[pastSwap._contractVersion ?? "v1"] ??= []).push(pastSwap);
            }
        }));
        for (let version in checkStatusSwaps) {
            if (this._versionedContracts[version] == null) {
                this.logger.warn(`_checkPastSwaps(): No contract was found for ${this.chainIdentifier} version ${version}! Skipping these swaps!`);
                continue;
            }
            const _checkStatusSwap = checkStatusSwaps[version];
            const swapStatuses = await this._contract(version).getCommitStatuses(_checkStatusSwap.map(val => ({ signer: val._getInitiator(), swapData: val._data })));
            for (let pastSwap of _checkStatusSwap) {
                const shouldSave = await pastSwap._sync(false, swapExpiredStatus[pastSwap.getId()], swapStatuses[pastSwap.getEscrowHash()], true);
                if (shouldSave) {
                    changedSwapSet.add(pastSwap);
                }
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
    async recoverFromSwapDataAndState(init, state, contractVersion, lp) {
        const data = init.data;
        let paymentHash = data.getHTLCHashHint();
        let secret;
        if (state.type === SwapCommitStateType.PAID) {
            secret = await state.getClaimResult();
            paymentHash = Buffer.from(sha256(Buffer.from(secret, "hex"))).toString("hex");
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
            exactIn: false,
            contractVersion
        };
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
