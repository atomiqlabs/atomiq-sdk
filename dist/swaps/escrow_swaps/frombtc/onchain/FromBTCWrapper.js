"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromBTCWrapper = void 0;
const IFromBTCWrapper_1 = require("../IFromBTCWrapper");
const FromBTCSwap_1 = require("./FromBTCSwap");
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const SwapType_1 = require("../../../../enums/SwapType");
const Utils_1 = require("../../../../utils/Utils");
const BitcoinUtils_1 = require("../../../../utils/BitcoinUtils");
const IntermediaryAPI_1 = require("../../../../intermediaries/apis/IntermediaryAPI");
const RequestError_1 = require("../../../../errors/RequestError");
const utils_1 = require("@scure/btc-signer/utils");
const RetryUtils_1 = require("../../../../utils/RetryUtils");
/**
 * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation
 *  of the swap escrow on the destination chain.
 *
 * @category Swaps/Legacy/Bitcoin → Smart chain
 */
class FromBTCWrapper extends IFromBTCWrapper_1.IFromBTCWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Pricing to use
     * @param tokens
     * @param swapDataDeserializer Deserializer for SwapData
     * @param btcRelay
     * @param synchronizer Btc relay synchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, btcRelay, synchronizer, btcRpc, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, {
            bitcoinNetwork: options?.bitcoinNetwork ?? utils_1.TEST_NETWORK,
            safetyFactor: options?.safetyFactor ?? 2,
            blocksTillTxConfirms: options?.blocksTillTxConfirms ?? 12,
            maxConfirmations: options?.maxConfirmations ?? 6,
            minSendWindow: options?.minSendWindow ?? 30 * 60,
            bitcoinBlocktime: options?.bitcoinBlocktime ?? 10 * 60
        }, events);
        this.TYPE = SwapType_1.SwapType.FROM_BTC;
        /**
         * @internal
         */
        this.tickSwapState = [FromBTCSwap_1.FromBTCSwapState.PR_CREATED, FromBTCSwap_1.FromBTCSwapState.CLAIM_COMMITED, FromBTCSwap_1.FromBTCSwapState.EXPIRED];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            FromBTCSwap_1.FromBTCSwapState.PR_CREATED,
            FromBTCSwap_1.FromBTCSwapState.QUOTE_SOFT_EXPIRED,
            FromBTCSwap_1.FromBTCSwapState.CLAIM_COMMITED,
            FromBTCSwap_1.FromBTCSwapState.BTC_TX_CONFIRMED,
            FromBTCSwap_1.FromBTCSwapState.EXPIRED
        ];
        /**
         * @internal
         */
        this._claimableSwapStates = [FromBTCSwap_1.FromBTCSwapState.BTC_TX_CONFIRMED];
        /**
         * @internal
         */
        this._swapDeserializer = FromBTCSwap_1.FromBTCSwap;
        this.btcRelay = btcRelay;
        this._synchronizer = synchronizer;
        this._btcRpc = btcRpc;
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventInitialize(swap, event) {
        if (swap._state === FromBTCSwap_1.FromBTCSwapState.PR_CREATED || swap._state === FromBTCSwap_1.FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = FromBTCSwap_1.FromBTCSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * @inheritDoc
     * @internal
     */
    async processEventClaim(swap, event) {
        if (swap._state !== FromBTCSwap_1.FromBTCSwapState.FAILED && swap._state !== FromBTCSwap_1.FromBTCSwapState.CLAIM_CLAIMED) {
            await swap._setBitcoinTxId(buffer_1.Buffer.from(event.result, "hex").reverse().toString("hex")).catch(e => {
                this.logger.warn("processEventClaim(): Error setting bitcoin txId: ", e);
            });
            swap._state = FromBTCSwap_1.FromBTCSwapState.CLAIM_CLAIMED;
            return true;
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventRefund(swap, event) {
        if (swap._state !== FromBTCSwap_1.FromBTCSwapState.CLAIM_CLAIMED && swap._state !== FromBTCSwap_1.FromBTCSwapState.FAILED) {
            swap._state = FromBTCSwap_1.FromBTCSwapState.FAILED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * Returns the swap expiry, leaving enough time for the user to send a transaction and for it to confirm
     *
     * @param data Swap data
     * @param requiredConfirmations Confirmations required on the bitcoin side to settle the swap
     *
     * @internal
     */
    _getOnchainSendTimeout(data, requiredConfirmations) {
        const tsDelta = (this._options.blocksTillTxConfirms + requiredConfirmations) * this._options.bitcoinBlocktime * this._options.safetyFactor;
        return data.getExpiry() - BigInt(tsDelta);
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
    async preFetchClaimerBounty(signer, amountData, options, abortController) {
        const startTimestamp = BigInt(Math.floor(Date.now() / 1000));
        if (options.unsafeZeroWatchtowerFee) {
            return {
                feePerBlock: 0n,
                safetyFactor: options.blockSafetyFactor,
                startTimestamp: startTimestamp,
                addBlock: 0,
                addFee: 0n
            };
        }
        const dummyAmount = BigInt(Math.floor(Math.random() * 0x1000000));
        const dummySwapData = await this._contract.createSwapData(base_1.ChainSwapType.CHAIN, signer, signer, amountData.token, dummyAmount, this._contract.getHashForOnchain((0, Utils_1.randomBytes)(20), dummyAmount, 3).toString("hex"), this.getRandomSequence(), startTimestamp, false, true, BigInt(Math.floor(Math.random() * 0x10000)), BigInt(Math.floor(Math.random() * 0x10000)));
        try {
            const [feePerBlock, btcRelayData, currentBtcBlock, claimFeeRate] = await Promise.all([
                this.btcRelay.getFeePerBlock(),
                this.btcRelay.getTipData(),
                this._btcRpc.getTipHeight(),
                this._contract.getClaimFee(signer, dummySwapData)
            ]);
            if (btcRelayData == null)
                throw new Error("Btc relay not initialized!");
            const currentBtcRelayBlock = btcRelayData.blockheight;
            const addBlock = Math.max(currentBtcBlock - currentBtcRelayBlock, 0);
            return {
                feePerBlock: feePerBlock * options.feeSafetyFactor,
                safetyFactor: options.blockSafetyFactor,
                startTimestamp: startTimestamp,
                addBlock,
                addFee: claimFeeRate * options.feeSafetyFactor
            };
        }
        catch (e) {
            abortController.abort(e);
            return undefined;
        }
    }
    /**
     * Returns calculated claimer bounty calculated from the claimer bounty data as fetched from preFetchClaimerBounty()
     *
     * @param data Parsed swap data returned from the intermediary
     * @param options Options as passed to the swap creation function
     * @param claimerBounty Claimer bounty data as fetched from {@link preFetchClaimerBounty} function
     *
     * @private
     */
    getClaimerBounty(data, options, claimerBounty) {
        const tsDelta = data.getExpiry() - claimerBounty.startTimestamp;
        const blocksDelta = tsDelta / BigInt(this._options.bitcoinBlocktime) * BigInt(options.blockSafetyFactor);
        const totalBlock = blocksDelta + BigInt(claimerBounty.addBlock);
        return claimerBounty.addFee + (totalBlock * claimerBounty.feePerBlock);
    }
    /**
     * Verifies response returned from intermediary
     *
     * @param signer
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param data Parsed swap data returned by the intermediary
     * @param sequence Required swap sequence
     * @param claimerBounty Claimer bount data as returned from the preFetchClaimerBounty() pre-fetch promise
     * @param depositToken
     *
     * @throws {IntermediaryError} in case the response is invalid
     *
     * @private
     */
    verifyReturnedData(signer, resp, amountData, lp, options, data, sequence, claimerBounty, depositToken) {
        if (amountData.exactIn) {
            if (resp.amount !== amountData.amount)
                throw new IntermediaryError_1.IntermediaryError("Invalid amount returned");
        }
        else {
            if (resp.total !== amountData.amount)
                throw new IntermediaryError_1.IntermediaryError("Invalid total returned");
        }
        const requiredConfirmations = resp.confirmations;
        if (requiredConfirmations > this._options.maxConfirmations)
            throw new IntermediaryError_1.IntermediaryError("Requires too many confirmations");
        const totalClaimerBounty = this.getClaimerBounty(data, options, claimerBounty);
        if (data.getClaimerBounty() !== totalClaimerBounty ||
            data.getType() != base_1.ChainSwapType.CHAIN ||
            data.getSequence() !== sequence ||
            data.getAmount() !== resp.total ||
            data.isPayIn() ||
            !data.isToken(amountData.token) ||
            !data.isOfferer(lp.getAddress(this.chainIdentifier)) ||
            !data.isClaimer(signer) ||
            !data.isDepositToken(depositToken) ||
            data.hasSuccessAction()) {
            throw new IntermediaryError_1.IntermediaryError("Invalid data returned");
        }
        //Check that we have enough time to send the TX and for it to confirm
        const expiry = this._getOnchainSendTimeout(data, requiredConfirmations);
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        if ((expiry - currentTimestamp) < BigInt(this._options.minSendWindow)) {
            throw new IntermediaryError_1.IntermediaryError("Send window too low");
        }
        const lockingScript = (0, BitcoinUtils_1.toOutputScript)(this._options.bitcoinNetwork, resp.btcAddress);
        const desiredExtraData = this._contract.getExtraData(lockingScript, resp.amount, requiredConfirmations);
        const desiredClaimHash = this._contract.getHashForOnchain(lockingScript, resp.amount, requiredConfirmations);
        if (!desiredClaimHash.equals(buffer_1.Buffer.from(data.getClaimHash(), "hex"))) {
            throw new IntermediaryError_1.IntermediaryError("Invalid claim hash returned!");
        }
        const extraData = data.getExtraData();
        if (extraData == null || !desiredExtraData.equals(buffer_1.Buffer.from(extraData, "hex"))) {
            throw new IntermediaryError_1.IntermediaryError("Invalid extra data returned!");
        }
    }
    /**
     * Returns a newly created legacy Bitcoin -> Smart chain swap using the PrTLC based escrow swap protocol,
     *  with the passed amount.
     *
     * @param recipient Smart chain signer's address on the destination chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    create(recipient, amountData, lps, options, additionalParams, abortSignal) {
        const _options = {
            blockSafetyFactor: options?.blockSafetyFactor ?? 1,
            feeSafetyFactor: options?.feeSafetyFactor ?? 2n,
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false
        };
        const sequence = this.getRandomSequence();
        const _abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const pricePrefetchPromise = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise = this.preFetchUsdPrice(_abortController.signal);
        const claimerBountyPrefetchPromise = this.preFetchClaimerBounty(recipient, amountData, _options, _abortController);
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const feeRatePromise = this.preFetchFeeRate(recipient, amountData, undefined, _abortController);
        const _signDataPromise = this._contract.preFetchBlockDataForSignatures == null ?
            this.preFetchSignData(Promise.resolve(true)) :
            undefined;
        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if (lp.services[SwapType_1.SwapType.FROM_BTC] == null)
                        throw new Error("LP service for processing from btc swaps not found!");
                    const abortController = (0, Utils_1.extendAbortController)(_abortController.signal);
                    const liquidityPromise = this.preFetchIntermediaryLiquidity(amountData, lp, abortController);
                    try {
                        const { signDataPromise, resp } = await (0, RetryUtils_1.tryWithRetries)(async (retryCount) => {
                            const { signDataPrefetch, response } = IntermediaryAPI_1.IntermediaryAPI.initFromBTC(this.chainIdentifier, lp.url, nativeTokenAddress, {
                                claimer: recipient,
                                amount: amountData.amount,
                                token: amountData.token.toString(),
                                exactOut: !amountData.exactIn,
                                sequence,
                                claimerBounty: (0, Utils_1.throwIfUndefined)(claimerBountyPrefetchPromise),
                                feeRate: (0, Utils_1.throwIfUndefined)(feeRatePromise),
                                additionalParams
                            }, this._options.postRequestTimeout, abortController.signal, retryCount > 0 ? false : undefined);
                            return {
                                signDataPromise: _signDataPromise ?? this.preFetchSignData(signDataPrefetch),
                                resp: await response
                            };
                        }, undefined, e => e instanceof RequestError_1.RequestError, abortController.signal);
                        const data = new this._swapDataDeserializer(resp.data);
                        data.setClaimer(recipient);
                        this.verifyReturnedData(recipient, resp, amountData, lp, _options, data, sequence, (await claimerBountyPrefetchPromise), nativeTokenAddress);
                        const [pricingInfo, signatureExpiry] = await Promise.all([
                            //Get intermediary's liquidity
                            this.verifyReturnedPrice(lp.services[SwapType_1.SwapType.FROM_BTC], false, resp.amount, resp.total, amountData.token, {}, pricePrefetchPromise, usdPricePrefetchPromise, abortController.signal),
                            this.verifyReturnedSignature(recipient, data, resp, feeRatePromise, signDataPromise, abortController.signal),
                            this.verifyIntermediaryLiquidity(data.getAmount(), (0, Utils_1.throwIfUndefined)(liquidityPromise)),
                        ]);
                        const quote = new FromBTCSwap_1.FromBTCSwap(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: signatureExpiry,
                            swapFee: resp.swapFee,
                            swapFeeBtc: resp.swapFee * resp.amount / (data.getAmount() - resp.swapFee),
                            feeRate: (await feeRatePromise),
                            signatureData: resp,
                            data,
                            address: resp.btcAddress,
                            amount: resp.amount,
                            exactIn: amountData.exactIn ?? true,
                            requiredConfirmations: resp.confirmations
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
     * @inheritDoc
     */
    async recoverFromSwapDataAndState(init, state, lp) {
        const data = init.data;
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
            data,
            exactIn: false
        };
        const swap = new FromBTCSwap_1.FromBTCSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = FromBTCSwap_1.FromBTCSwapState.CLAIM_COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }
}
exports.FromBTCWrapper = FromBTCWrapper;
