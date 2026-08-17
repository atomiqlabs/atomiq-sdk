import { IFromBTCWrapper } from "../IFromBTCWrapper.js";
import { FromBTCSwap, FromBTCSwapState } from "./FromBTCSwap.js";
import { ChainSwapType } from "@atomiqlabs/base";
import { Intermediary } from "../../../../intermediaries/Intermediary.js";
import { Buffer } from "buffer";
import { IntermediaryError } from "../../../../errors/IntermediaryError.js";
import { SwapType } from "../../../../enums/SwapType.js";
import { extendAbortController, mapArrayToObject, randomBytes, throwIfUndefined } from "../../../../utils/Utils.js";
import { toOutputScript } from "../../../../utils/BitcoinUtils.js";
import { RequestError } from "../../../../errors/RequestError.js";
import { TEST_NETWORK } from "@scure/btc-signer/utils";
import { tryWithRetries } from "../../../../utils/RetryUtils.js";
/**
 * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation
 *  of the swap escrow on the destination chain.
 *
 * @category Swaps/Legacy/Bitcoin → Smart chain
 */
export class FromBTCWrapper extends IFromBTCWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param prices Pricing to use
     * @param tokens
     * @param versionedContracts
     * @param versionedSynchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param lpApi
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, versionedContracts, versionedSynchronizer, btcRpc, lpApi, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, lpApi, {
            ...options,
            bitcoinNetwork: options?.bitcoinNetwork ?? TEST_NETWORK,
            safetyFactor: options?.safetyFactor ?? 2,
            blocksTillTxConfirms: options?.blocksTillTxConfirms ?? 12,
            maxConfirmations: options?.maxConfirmations ?? 6,
            minSendWindow: options?.minSendWindow ?? 30 * 60,
            bitcoinBlocktime: options?.bitcoinBlocktime ?? 10 * 60
        }, versionedContracts, events);
        this.TYPE = SwapType.FROM_BTC;
        /**
         * @internal
         */
        this.tickSwapState = [FromBTCSwapState.PR_CREATED, FromBTCSwapState.CLAIM_COMMITED, FromBTCSwapState.EXPIRED];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            FromBTCSwapState.PR_CREATED,
            FromBTCSwapState.QUOTE_SOFT_EXPIRED,
            FromBTCSwapState.CLAIM_COMMITED,
            FromBTCSwapState.BTC_TX_CONFIRMED,
            FromBTCSwapState.EXPIRED
        ];
        /**
         * @internal
         */
        this._claimableSwapStates = [FromBTCSwapState.BTC_TX_CONFIRMED];
        /**
         * @internal
         */
        this._swapDeserializer = FromBTCSwap;
        /**
         * @internal
         */
        this._synchronizer = (version) => {
            const _version = version ?? "v1";
            const data = this.versionedSynchronizer[_version];
            if (data == null)
                throw new Error(`Invalid contract version ${_version} requested`);
            return data.synchronizer;
        };
        this.btcRelay = (version) => {
            const _version = version ?? "v1";
            const data = this.versionedBtcRelay[_version];
            if (data == null)
                throw new Error(`Invalid contract version ${_version} requested`);
            return data.btcRelay;
        };
        this.versionedBtcRelay = {};
        this.versionedSynchronizer = {};
        this._btcRpc = btcRpc;
        this.versionedBtcRelay = versionedContracts;
        this.versionedSynchronizer = versionedSynchronizer;
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventInitialize(swap, event) {
        if (swap._state === FromBTCSwapState.PR_CREATED || swap._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = FromBTCSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * @inheritDoc
     * @internal
     */
    async processEventClaim(swap, event) {
        if (swap._state !== FromBTCSwapState.FAILED && swap._state !== FromBTCSwapState.CLAIM_CLAIMED) {
            await swap._setBitcoinTxId(Buffer.from(event.result, "hex").reverse().toString("hex")).catch(e => {
                this.logger.warn("processEventClaim(): Error setting bitcoin txId: ", e);
            });
            swap._state = FromBTCSwapState.CLAIM_CLAIMED;
            return true;
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    processEventRefund(swap, event) {
        if (swap._state !== FromBTCSwapState.CLAIM_CLAIMED && swap._state !== FromBTCSwapState.FAILED) {
            swap._state = FromBTCSwapState.FAILED;
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
     * @param contractVersion
     *
     * @private
     */
    async preFetchClaimerBounty(signer, amountData, options, abortController, contractVersion) {
        const startTimestamp = BigInt(Math.floor(Date.now() / 1000));
        if (options.unsafeZeroWatchtowerFee) {
            return {
                feePerBlock: 0n,
                safetyFactor: options.blockSafetyFactor,
                startTimestamp: startTimestamp,
                addBlock: 0n,
                addFee: 0n
            };
        }
        const dummyAmount = BigInt(Math.floor(Math.random() * 0x1000000));
        const dummySwapData = await this._contract(contractVersion).createSwapData(ChainSwapType.CHAIN, signer, signer, amountData.token, dummyAmount, this._contract(contractVersion).getHashForOnchain(randomBytes(20), dummyAmount, 3).toString("hex"), this.getRandomSequence(), startTimestamp, false, true, BigInt(Math.floor(Math.random() * 0x10000)), BigInt(Math.floor(Math.random() * 0x10000)));
        try {
            const [feePerBlock, btcRelayData, currentBtcBlock, claimFeeRate] = await Promise.all([
                this.btcRelay(contractVersion).getFeePerBlock(),
                this.btcRelay(contractVersion).getTipData(),
                this._btcRpc.getTipHeight(),
                this._contract(contractVersion).getClaimFee(signer, dummySwapData)
            ]);
            if (btcRelayData == null)
                throw new Error("Btc relay not initialized!");
            const currentBtcRelayBlock = btcRelayData.blockheight;
            const addBlock = Math.max(currentBtcBlock - currentBtcRelayBlock, 0);
            return {
                feePerBlock: feePerBlock * options.feeSafetyFactorPPM / 1000000n,
                safetyFactor: options.blockSafetyFactor,
                startTimestamp: startTimestamp,
                addBlock: BigInt(addBlock),
                addFee: claimFeeRate * options.feeSafetyFactorPPM / 1000000n
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
        const blocksDelta = tsDelta / BigInt(this._options.bitcoinBlocktime) * options.blockSafetyFactor;
        const totalBlock = blocksDelta + claimerBounty.addBlock;
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
                throw new IntermediaryError("Invalid amount returned");
        }
        else {
            if (resp.total !== amountData.amount)
                throw new IntermediaryError("Invalid total returned");
        }
        const requiredConfirmations = resp.confirmations;
        if (requiredConfirmations > this._options.maxConfirmations)
            throw new IntermediaryError("Requires too many confirmations");
        const totalClaimerBounty = this.getClaimerBounty(data, options, claimerBounty);
        if (data.getClaimerBounty() !== totalClaimerBounty ||
            data.getType() != ChainSwapType.CHAIN ||
            data.getSequence() !== sequence ||
            data.getAmount() !== resp.total ||
            data.isPayIn() ||
            !data.isToken(amountData.token) ||
            !data.isOfferer(lp.getAddress(this.chainIdentifier)) ||
            !data.isClaimer(signer) ||
            !data.isDepositToken(depositToken) ||
            data.hasSuccessAction()) {
            throw new IntermediaryError("Invalid data returned");
        }
        //Check that we have enough time to send the TX and for it to confirm
        const expiry = this._getOnchainSendTimeout(data, requiredConfirmations);
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        if ((expiry - currentTimestamp) < BigInt(this._options.minSendWindow)) {
            throw new IntermediaryError("Send window too low");
        }
        const version = lp.getContractVersion(this.chainIdentifier);
        const lockingScript = toOutputScript(this._options.bitcoinNetwork, resp.btcAddress);
        const desiredExtraData = this._contract(version).getExtraData(lockingScript, resp.amount, requiredConfirmations);
        const desiredClaimHash = this._contract(version).getHashForOnchain(lockingScript, resp.amount, requiredConfirmations);
        if (!desiredClaimHash.equals(Buffer.from(data.getClaimHash(), "hex"))) {
            throw new IntermediaryError("Invalid claim hash returned!");
        }
        const extraData = data.getExtraData();
        if (extraData == null || !desiredExtraData.equals(Buffer.from(extraData, "hex"))) {
            throw new IntermediaryError("Invalid extra data returned!");
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
        let feeSafetyFactorPPM = 1500000n;
        if (typeof (options?.feeSafetyFactor) === "bigint") {
            feeSafetyFactorPPM = options.feeSafetyFactor * 1000000n;
        }
        else if (typeof (options?.feeSafetyFactor) === "number") {
            feeSafetyFactorPPM = BigInt(Math.floor(options.feeSafetyFactor * 1000000));
        }
        const lpVersions = Intermediary.getContractVersionsForLps(this.chainIdentifier, lps);
        const _options = {
            blockSafetyFactor: options?.blockSafetyFactor != null ? BigInt(options.blockSafetyFactor) : 1n,
            feeSafetyFactorPPM,
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false
        };
        const sequence = this.getRandomSequence();
        const _abortController = extendAbortController(abortSignal);
        const pricePrefetchPromise = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise = this.preFetchUsdPrice(_abortController.signal);
        const claimerBountyPrefetchPromise = mapArrayToObject(lpVersions, (contractVersion) => {
            return this.preFetchClaimerBounty(recipient, amountData, _options, _abortController, contractVersion);
        });
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const feeRatePromise = this.preFetchFeeRate(recipient, amountData, undefined, _abortController, lpVersions);
        const _signDataPromise = mapArrayToObject(lpVersions, (contractVersion) => {
            return this._contract(contractVersion).preFetchBlockDataForSignatures == null ?
                this.preFetchSignData(Promise.resolve(true), contractVersion) :
                undefined;
        });
        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if (lp.services[SwapType.FROM_BTC] == null)
                        throw new Error("LP service for processing from btc swaps not found!");
                    const version = lp.getContractVersion(this.chainIdentifier);
                    const abortController = extendAbortController(_abortController.signal);
                    const liquidityPromise = this.preFetchIntermediaryLiquidity(amountData, lp, abortController, version);
                    try {
                        const { signDataPromise, resp } = await tryWithRetries(async (retryCount) => {
                            const { signDataPrefetch, response } = this._lpApi.initFromBTC(this.chainIdentifier, lp.url, nativeTokenAddress, {
                                claimer: recipient,
                                amount: amountData.amount,
                                token: amountData.token.toString(),
                                exactOut: !amountData.exactIn,
                                sequence,
                                claimerBounty: throwIfUndefined(claimerBountyPrefetchPromise[version], "Watchtower fee pre-fetch failed!"),
                                feeRate: throwIfUndefined(feeRatePromise[version], "Network fee rate pre-fetch failed!"),
                                additionalParams
                            }, this._options.postRequestTimeout, abortController.signal, retryCount > 0 ? false : undefined);
                            let signDataPromise = _signDataPromise[version];
                            if (signDataPromise == null) {
                                signDataPromise = this.preFetchSignData(signDataPrefetch, version);
                            }
                            else
                                signDataPrefetch.catch(() => { });
                            return {
                                signDataPromise,
                                resp: await response
                            };
                        }, undefined, e => e instanceof RequestError, abortController.signal);
                        const data = new (this._swapDataDeserializer(version))(resp.data);
                        data.setClaimer(recipient);
                        const swapFeeBtc = resp.swapFee * resp.amount / (data.getAmount() + resp.swapFee);
                        this.verifyReturnedData(recipient, resp, amountData, lp, _options, data, sequence, (await claimerBountyPrefetchPromise[version]), nativeTokenAddress);
                        const [pricingInfo, signatureExpiry] = await Promise.all([
                            //Get intermediary's liquidity
                            this.verifyReturnedPrice(lp.services[SwapType.FROM_BTC], false, resp.amount, resp.total, amountData.token, { swapFeeBtc }, pricePrefetchPromise, usdPricePrefetchPromise, abortController.signal),
                            this.verifyReturnedSignature(recipient, data, resp, feeRatePromise[version], signDataPromise, version, abortController.signal),
                            this.verifyIntermediaryLiquidity(data.getAmount(), throwIfUndefined(liquidityPromise, "LP liquidity pre-fetch failed!")),
                        ]);
                        const quote = new FromBTCSwap(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: signatureExpiry,
                            swapFee: resp.swapFee,
                            swapFeeBtc,
                            feeRate: (await feeRatePromise[version]),
                            signatureData: resp,
                            data,
                            address: resp.btcAddress,
                            amount: resp.amount,
                            exactIn: amountData.exactIn ?? true,
                            requiredConfirmations: resp.confirmations,
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
     * @inheritDoc
     */
    async recoverFromSwapDataAndState(init, state, contractVersion, lp) {
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
            exactIn: false,
            contractVersion
        };
        const swap = new FromBTCSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = FromBTCSwapState.CLAIM_COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }
}
