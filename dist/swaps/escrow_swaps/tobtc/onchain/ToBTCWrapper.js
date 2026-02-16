"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToBTCWrapper = void 0;
const ToBTCSwap_1 = require("./ToBTCSwap");
const IToBTCWrapper_1 = require("../IToBTCWrapper");
const base_1 = require("@atomiqlabs/base");
const UserError_1 = require("../../../../errors/UserError");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const SwapType_1 = require("../../../../enums/SwapType");
const Utils_1 = require("../../../../utils/Utils");
const BitcoinUtils_1 = require("../../../../utils/BitcoinUtils");
const IntermediaryAPI_1 = require("../../../../intermediaries/apis/IntermediaryAPI");
const RequestError_1 = require("../../../../errors/RequestError");
const utils_1 = require("@scure/btc-signer/utils");
const RetryUtils_1 = require("../../../../utils/RetryUtils");
const IToBTCSwap_1 = require("../IToBTCSwap");
/**
 * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
 *
 * @category Swaps/Smart chain → Bitcoin
 */
class ToBTCWrapper extends IToBTCWrapper_1.IToBTCWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents Smart chain on-chain event listener
     * @param chain
     * @param contract Chain specific swap contract
     * @param prices Swap pricing handler
     * @param tokens
     * @param swapDataDeserializer Deserializer for chain specific SwapData
     * @param btcRpc Bitcoin RPC api
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, btcRpc, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, {
            bitcoinNetwork: options?.bitcoinNetwork ?? utils_1.TEST_NETWORK,
            safetyFactor: options?.safetyFactor ?? 2,
            maxConfirmations: options?.maxConfirmations ?? 6,
            bitcoinBlocktime: options?.bitcoinBlocktime ?? (60 * 10),
            maxExpectedOnchainSendSafetyFactor: options?.maxExpectedOnchainSendSafetyFactor ?? 4,
            maxExpectedOnchainSendGracePeriodBlocks: options?.maxExpectedOnchainSendGracePeriodBlocks ?? 12,
        }, events);
        this.TYPE = SwapType_1.SwapType.TO_BTC;
        /**
         * @internal
         */
        this._swapDeserializer = ToBTCSwap_1.ToBTCSwap;
        this._btcRpc = btcRpc;
    }
    /**
     * Returns randomly generated random bitcoin transaction nonce to be used for BTC on-chain swaps
     *
     * @returns Escrow nonce
     *
     * @private
     */
    getRandomNonce() {
        const firstPart = BigInt(Math.floor((Date.now() / 1000)) - 700000000);
        return (firstPart << 24n) | base_1.BigIntBufferUtils.fromBuffer((0, Utils_1.randomBytes)(3));
    }
    /**
     * Converts bitcoin address to its corresponding output script
     *
     * @param addr Bitcoin address to get the output script for
     *
     * @returns Output script as Buffer
     * @throws {UserError} if invalid address is specified
     *
     * @private
     */
    btcAddressToOutputScript(addr) {
        try {
            return (0, BitcoinUtils_1.toOutputScript)(this._options.bitcoinNetwork, addr);
        }
        catch (e) {
            throw new UserError_1.UserError("Invalid address specified");
        }
    }
    /**
     * Verifies returned LP data
     *
     * @param signer
     * @param resp LP's response
     * @param amountData
     * @param lp
     * @param options Options as passed to the swap create function
     * @param data LP's returned parsed swap data
     * @param hash Payment hash of the swap
     *
     * @throws {IntermediaryError} if returned data are not correct
     *
     * @private
     */
    verifyReturnedData(signer, resp, amountData, lp, options, data, hash) {
        if (resp.totalFee !== (resp.swapFee + resp.networkFee))
            throw new IntermediaryError_1.IntermediaryError("Invalid totalFee returned");
        if (amountData.exactIn) {
            if (resp.total !== amountData.amount)
                throw new IntermediaryError_1.IntermediaryError("Invalid total returned");
        }
        else {
            if (resp.amount !== amountData.amount)
                throw new IntermediaryError_1.IntermediaryError("Invalid amount returned");
        }
        const maxAllowedBlockDelta = BigInt(options.confirmations +
            options.confirmationTarget +
            this._options.maxExpectedOnchainSendGracePeriodBlocks);
        const maxAllowedExpiryDelta = maxAllowedBlockDelta
            * BigInt(this._options.maxExpectedOnchainSendSafetyFactor)
            * BigInt(this._options.bitcoinBlocktime);
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const maxAllowedExpiryTimestamp = currentTimestamp + maxAllowedExpiryDelta;
        if (data.getExpiry() > maxAllowedExpiryTimestamp) {
            throw new IntermediaryError_1.IntermediaryError("Expiry time returned too high!");
        }
        if (data.getAmount() !== resp.total ||
            data.getClaimHash() !== hash ||
            data.getType() !== base_1.ChainSwapType.CHAIN_NONCED ||
            !data.isPayIn() ||
            !data.isToken(amountData.token) ||
            !data.isClaimer(lp.getAddress(this.chainIdentifier)) ||
            !data.isOfferer(signer) ||
            data.getTotalDeposit() !== 0n) {
            throw new IntermediaryError_1.IntermediaryError("Invalid data returned");
        }
    }
    /**
     * Returns a newly created Smart chain -> Bitcoin swap using the PrTLC based escrow swap protocol,
     *  with the passed amount.
     *
     * @param signer Source chain signer address initiating the swap
     * @param recipient Recipient bitcoin on-chain address
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    create(signer, recipient, amountData, lps, options, additionalParams, abortSignal) {
        if (!this.isInitialized)
            throw new Error("Not initialized, call init() first!");
        const _options = {
            confirmationTarget: options?.confirmationTarget ?? 3,
            confirmations: options?.confirmations ?? 2
        };
        const nonce = this.getRandomNonce();
        const outputScript = this.btcAddressToOutputScript(recipient);
        const _hash = !amountData.exactIn ?
            this._contract.getHashForOnchain(outputScript, amountData.amount, _options.confirmations, nonce).toString("hex") :
            undefined;
        const _abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const pricePreFetchPromise = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise = this.preFetchUsdPrice(_abortController.signal);
        const feeRatePromise = this.preFetchFeeRate(signer, amountData, _hash, _abortController);
        const _signDataPromise = this._contract.preFetchBlockDataForSignatures == null ?
            this.preFetchSignData(Promise.resolve(true)) :
            undefined;
        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if (lp.services[SwapType_1.SwapType.TO_BTC] == null)
                        throw new Error("LP service for processing to btc swaps not found!");
                    const abortController = (0, Utils_1.extendAbortController)(_abortController.signal);
                    const reputationPromise = this.preFetchIntermediaryReputation(amountData, lp, abortController);
                    try {
                        const { signDataPromise, resp } = await (0, RetryUtils_1.tryWithRetries)(async (retryCount) => {
                            const { signDataPrefetch, response } = IntermediaryAPI_1.IntermediaryAPI.initToBTC(this.chainIdentifier, lp.url, {
                                btcAddress: recipient,
                                amount: amountData.amount,
                                confirmationTarget: _options.confirmationTarget,
                                confirmations: _options.confirmations,
                                nonce: nonce,
                                token: amountData.token,
                                offerer: signer,
                                exactIn: amountData.exactIn,
                                feeRate: (0, Utils_1.throwIfUndefined)(feeRatePromise),
                                additionalParams
                            }, this._options.postRequestTimeout, abortController.signal, retryCount > 0 ? false : undefined);
                            return {
                                signDataPromise: _signDataPromise ?? this.preFetchSignData(signDataPrefetch),
                                resp: await response
                            };
                        }, undefined, RequestError_1.RequestError, abortController.signal);
                        let hash = _hash ?? this._contract.getHashForOnchain(outputScript, resp.amount, _options.confirmations, nonce).toString("hex");
                        const data = new this._swapDataDeserializer(resp.data);
                        data.setOfferer(signer);
                        this.verifyReturnedData(signer, resp, amountData, lp, _options, data, hash);
                        const [pricingInfo, signatureExpiry, reputation] = await Promise.all([
                            this.verifyReturnedPrice(lp.services[SwapType_1.SwapType.TO_BTC], true, resp.amount, data.getAmount(), amountData.token, resp, pricePreFetchPromise, usdPricePrefetchPromise, abortController.signal),
                            this.verifyReturnedSignature(signer, data, resp, feeRatePromise, signDataPromise, abortController.signal),
                            reputationPromise
                        ]);
                        abortController.signal.throwIfAborted();
                        if (reputation != null)
                            lp.reputation[amountData.token.toString()] = reputation;
                        const inputWithoutFees = data.getAmount() - resp.swapFee - resp.networkFee;
                        const swapFeeBtc = resp.swapFee * resp.amount / inputWithoutFees;
                        const networkFeeBtc = resp.networkFee * resp.amount / inputWithoutFees;
                        const quote = new ToBTCSwap_1.ToBTCSwap(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: signatureExpiry,
                            swapFee: resp.swapFee,
                            swapFeeBtc,
                            feeRate: (await feeRatePromise),
                            signatureData: resp,
                            data,
                            networkFee: resp.networkFee,
                            networkFeeBtc,
                            address: recipient,
                            amount: resp.amount,
                            confirmationTarget: _options.confirmationTarget,
                            satsPerVByte: Number(resp.satsPervByte),
                            exactIn: amountData.exactIn,
                            requiredConfirmations: _options.confirmations,
                            nonce
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
            confirmationTarget: 1,
            satsPerVByte: 0,
            feeRate: "",
            signatureData: undefined,
            nonce: data.getNonceHint() ?? undefined,
            requiredConfirmations: data.getConfirmationsHint() ?? undefined,
            data,
            networkFee: 0n,
            networkFeeBtc: 0n,
            exactIn: true
        };
        const swap = new ToBTCSwap_1.ToBTCSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = IToBTCSwap_1.ToBTCSwapState.COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }
}
exports.ToBTCWrapper = ToBTCWrapper;
