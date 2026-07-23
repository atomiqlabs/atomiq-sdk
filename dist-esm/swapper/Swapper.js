import { BitcoinNetwork, ChainSwapType } from "@atomiqlabs/base";
import { ToBTCLNWrapper } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNWrapper.js";
import { ToBTCWrapper } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCWrapper.js";
import { FromBTCLNWrapper } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNWrapper.js";
import { FromBTCWrapper } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCWrapper.js";
import { IntermediaryDiscovery } from "../intermediaries/IntermediaryDiscovery.js";
import { decode as bolt11Decode } from "@atomiqlabs/bolt11";
import { IntermediaryError } from "../errors/IntermediaryError.js";
import { SwapType } from "../enums/SwapType.js";
import { LnForGasWrapper } from "../swaps/trusted/ln/LnForGasWrapper.js";
import { EventEmitter } from "events";
import { bigIntCompare, bigIntMax, bigIntMin, fromDecimal, objectMap, randomBytes } from "../utils/Utils.js";
import { OutOfBoundsError } from "../errors/RequestError.js";
import { SwapperWithChain } from "./SwapperWithChain.js";
import { OnchainForGasWrapper } from "../swaps/trusted/onchain/OnchainForGasWrapper.js";
import { NETWORK, TEST_NETWORK } from "@scure/btc-signer/utils";
import { UnifiedSwapStorage } from "../storage/UnifiedSwapStorage";
import { UnifiedSwapEventListener } from "../events/UnifiedSwapEventListener";
import { SpvFromBTCWrapper } from "../swaps/spv_swaps/SpvFromBTCWrapper";
import { SpvFromBTCSwap } from "../swaps/spv_swaps/SpvFromBTCSwap";
import { SwapperUtils } from "./SwapperUtils";
import { FromBTCLNAutoWrapper } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoWrapper";
import { UserError } from "../errors/UserError";
import { correctClock } from "../utils/AutomaticClockDriftCorrection";
import { isSwapType, SwapProtocolInfo } from "../utils/SwapUtils";
import { IndexedDBUnifiedStorage } from "../storage-browser/IndexedDBUnifiedStorage";
import { toTokenAmount } from "../types/TokenAmount";
import { BitcoinTokens, isBtcToken, isSCToken } from "../types/Token";
import { getLogger } from "../utils/Logger";
import { isLNURLWithdraw } from "../types/lnurl/LNURLWithdraw";
import { isLNURLPay } from "../types/lnurl/LNURLPay";
import { tryWithRetries } from "../utils/RetryUtils";
import { IEscrowSwap } from "../swaps/escrow_swaps/IEscrowSwap";
import { isLightningInvoiceCreateService } from "../types/wallets/LightningInvoiceCreateService";
import { IntermediaryAPI } from "../intermediaries/apis/IntermediaryAPI";
import { toBitcoinWallet } from "../utils/BitcoinWalletUtils";
import { getSignedKeyBasedAuthHandler } from "../intermediaries/auth/SignedKeyBasedAuth";
/**
 * Core orchestrator for all atomiq swap operations
 *
 * @category Core
 */
export class Swapper extends EventEmitter {
    /**
     * @internal
     */
    constructor(bitcoinRpc, lightningApi, bitcoinSynchronizer, chainsData, pricing, tokens, messenger, options) {
        super();
        this.logger = getLogger(this.constructor.name + ": ");
        this.initialized = false;
        /**
         * Helper information about various swap protocol and their features:
         * - `requiresInputWallet`: Whether a swap requires a connected wallet on the input chain able to sign
         *  arbitrary transaction
         * - `requiresOutputWallet`: Whether a swap requires a connected wallet on the output chain able to sign
         *  arbitrary transactions
         * - `supportsGasDrop`: Whether a swap supports the "gas drop" feature, allowing to user to receive a small
         *  amount of native token as part of the swap when swapping to smart chains
         *
         * Uses a `Record` type here, use the {@link SwapProtocolInfo} import for a literal readonly type, with
         *  pre-filled exact values in the type.
         */
        this.SwapTypeInfo = SwapProtocolInfo;
        const storagePrefix = options?.storagePrefix ?? "atomiq-";
        options ??= {};
        options.saveUninitializedSwaps ??= true;
        options.bitcoinNetwork = options.bitcoinNetwork == null ? BitcoinNetwork.TESTNET : options.bitcoinNetwork;
        const swapStorage = options.swapStorage ??= (name) => new IndexedDBUnifiedStorage(name);
        this.options = options;
        this.bitcoinNetwork = options.bitcoinNetwork;
        this._btcNetwork = options.bitcoinNetwork === BitcoinNetwork.MAINNET ? NETWORK :
            (options.bitcoinNetwork === BitcoinNetwork.TESTNET || options.bitcoinNetwork === BitcoinNetwork.TESTNET4) ? TEST_NETWORK : {
                bech32: 'bcrt',
                pubKeyHash: 111,
                scriptHash: 196,
                wif: 239
            };
        this.Utils = new SwapperUtils(this);
        this.prices = pricing;
        this._bitcoinRpc = bitcoinRpc;
        this.messenger = messenger;
        this._tokens = {};
        this._tokensByTicker = {};
        for (let tokenData of tokens) {
            const chainId = tokenData.chainId;
            this._tokens[chainId] ??= {};
            this._tokensByTicker[chainId] ??= {};
            this._tokens[chainId][tokenData.address] = this._tokensByTicker[chainId][tokenData.ticker] = tokenData;
        }
        const lpApi = new IntermediaryAPI(this.options.signedKeyBasedAuth != null
            ? getSignedKeyBasedAuthHandler(this.options.signedKeyBasedAuth.certificate, this.options.signedKeyBasedAuth.privateKey)
            : undefined);
        this.lpApi = lpApi;
        this.swapStateListener = (swap) => {
            this.emit("swapState", swap);
        };
        this._chains = objectMap(chainsData, (chainData, key) => {
            let { chainInterface, chainEvents, chainId, btcRelay, swapContract, swapDataConstructor, spvVaultContract, spvVaultWithdrawalDataConstructor, spvVaultDataConstructor, defaultVersion, versions } = chainData;
            defaultVersion ??= "v1";
            if (versions == null) {
                versions = {
                    [defaultVersion]: {
                        btcRelay,
                        swapContract,
                        swapDataConstructor,
                        spvVaultContract,
                        spvVaultDataConstructor,
                        spvVaultWithdrawalDataConstructor
                    }
                };
            }
            const versionedContracts = objectMap(versions, (value, key) => {
                return {
                    swapContract: value.swapContract,
                    spvVaultContract: value.spvVaultContract,
                    btcRelay: value.btcRelay,
                    synchronizer: bitcoinSynchronizer(value.btcRelay)
                };
            });
            const storageHandler = swapStorage(storagePrefix + chainId);
            const unifiedSwapStorage = new UnifiedSwapStorage(storageHandler, this.options.noSwapCache);
            const unifiedChainEvents = new UnifiedSwapEventListener(unifiedSwapStorage, chainEvents);
            const wrappers = {};
            wrappers[SwapType.TO_BTCLN] = new ToBTCLNWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], versions, lpApi, {
                getRequestTimeout: this.options.getRequestTimeout,
                postRequestTimeout: this.options.postRequestTimeout,
                saveUninitializedSwaps: this.options.saveUninitializedSwaps,
            });
            wrappers[SwapType.TO_BTC] = new ToBTCWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], versions, this._bitcoinRpc, lpApi, {
                getRequestTimeout: this.options.getRequestTimeout,
                postRequestTimeout: this.options.postRequestTimeout,
                saveUninitializedSwaps: this.options.saveUninitializedSwaps,
                bitcoinNetwork: this._btcNetwork
            });
            wrappers[SwapType.FROM_BTCLN] = new FromBTCLNWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], versions, lightningApi, lpApi, {
                getRequestTimeout: this.options.getRequestTimeout,
                postRequestTimeout: this.options.postRequestTimeout,
                saveUninitializedSwaps: this.options.saveUninitializedSwaps,
                unsafeSkipLnNodeCheck: this.bitcoinNetwork === BitcoinNetwork.TESTNET4 || this.bitcoinNetwork === BitcoinNetwork.REGTEST
            });
            wrappers[SwapType.FROM_BTC] = new FromBTCWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], versions, versionedContracts, this._bitcoinRpc, lpApi, {
                getRequestTimeout: this.options.getRequestTimeout,
                postRequestTimeout: this.options.postRequestTimeout,
                saveUninitializedSwaps: this.options.saveUninitializedSwaps,
                bitcoinNetwork: this._btcNetwork
            });
            wrappers[SwapType.TRUSTED_FROM_BTCLN] = new LnForGasWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], lpApi, {
                getRequestTimeout: this.options.getRequestTimeout,
                postRequestTimeout: this.options.postRequestTimeout,
                saveUninitializedSwaps: this.options.saveUninitializedSwaps,
            });
            wrappers[SwapType.TRUSTED_FROM_BTC] = new OnchainForGasWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], bitcoinRpc, lpApi, {
                getRequestTimeout: this.options.getRequestTimeout,
                postRequestTimeout: this.options.postRequestTimeout,
                saveUninitializedSwaps: this.options.saveUninitializedSwaps,
                bitcoinNetwork: this._btcNetwork
            });
            // This is gated on the default version of the contracts
            if (spvVaultContract != null) {
                wrappers[SwapType.SPV_VAULT_FROM_BTC] = new SpvFromBTCWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], versions, versionedContracts, bitcoinRpc, lpApi, {
                    getRequestTimeout: this.options.getRequestTimeout,
                    postRequestTimeout: this.options.postRequestTimeout,
                    saveUninitializedSwaps: this.options.saveUninitializedSwaps,
                    bitcoinNetwork: this._btcNetwork
                });
            }
            // This is gated on the default version of the contracts
            if (swapContract.supportsInitWithoutClaimer) {
                wrappers[SwapType.FROM_BTCLN_AUTO] = new FromBTCLNAutoWrapper(key, unifiedSwapStorage, unifiedChainEvents, chainInterface, pricing, this._tokens[chainId], versions, lightningApi, this.messenger, lpApi, {
                    getRequestTimeout: this.options.getRequestTimeout,
                    postRequestTimeout: this.options.postRequestTimeout,
                    saveUninitializedSwaps: this.options.saveUninitializedSwaps,
                    unsafeSkipLnNodeCheck: this.bitcoinNetwork === BitcoinNetwork.TESTNET4 || this.bitcoinNetwork === BitcoinNetwork.REGTEST
                });
            }
            Object.keys(wrappers).forEach(key => wrappers[key].events.on("swapState", this.swapStateListener));
            const reviver = (val) => {
                const wrapper = wrappers[val.type];
                if (wrapper == null)
                    return null;
                return new wrapper._swapDeserializer(wrapper, val);
            };
            return {
                chainEvents,
                chainInterface,
                wrappers,
                unifiedChainEvents,
                unifiedSwapStorage,
                defaultVersion,
                reviver,
                versionedContracts
            };
        });
        const contracts = objectMap(chainsData, (data) => data.versions ?? { [data.defaultVersion ?? "v1"]: { swapContract: data.swapContract, spvVaultContract: data.spvVaultContract } });
        if (options.intermediaryUrl != null) {
            this.intermediaryDiscovery = new IntermediaryDiscovery(contracts, lpApi, options.registryUrl, Array.isArray(options.intermediaryUrl) ? options.intermediaryUrl : [options.intermediaryUrl], options.getRequestTimeout);
        }
        else {
            this.intermediaryDiscovery = new IntermediaryDiscovery(contracts, lpApi, options.registryUrl, undefined, options.getRequestTimeout);
        }
        this.intermediaryDiscovery.on("removed", (intermediaries) => {
            this.emit("lpsRemoved", intermediaries);
        });
        this.intermediaryDiscovery.on("added", (intermediaries) => {
            this.emit("lpsAdded", intermediaries);
        });
    }
    async _init() {
        this.logger.debug("init(): Initializing swapper");
        const abortController = new AbortController();
        const promises = [];
        let automaticClockDriftCorrectionPromise = undefined;
        if (this.options.automaticClockDriftCorrection) {
            promises.push(automaticClockDriftCorrectionPromise = tryWithRetries(correctClock, undefined, undefined, abortController.signal).catch((err) => {
                abortController.abort(err);
            }));
        }
        this.logger.debug("init(): Initializing intermediary discovery");
        if (!this.options.dontFetchLPs)
            promises.push(this.intermediaryDiscovery.init(abortController.signal).catch(err => {
                if (abortController.signal.aborted)
                    return;
                this.logger.error("init(): Failed to fetch intermediaries/LPs: ", err);
            }));
        if (this.options.defaultTrustedIntermediaryUrl != null) {
            promises.push(this.intermediaryDiscovery.getIntermediary(this.options.defaultTrustedIntermediaryUrl, abortController.signal)
                .then(val => {
                if (val == null)
                    throw new Error("Cannot get trusted LP");
                this.defaultTrustedIntermediary = val;
            })
                .catch(err => {
                if (abortController.signal.aborted)
                    return;
                this.logger.error("init(): Failed to contact trusted LP url: ", err);
            }));
        }
        if (automaticClockDriftCorrectionPromise != null) {
            //We should await the promises here before checking the swaps
            await automaticClockDriftCorrectionPromise;
        }
        const chainPromises = [];
        for (let chainIdentifier in this._chains) {
            chainPromises.push((async () => {
                const { chainInterface, versionedContracts, unifiedChainEvents, unifiedSwapStorage, wrappers, reviver } = this._chains[chainIdentifier];
                try {
                    const _chainInterface = chainInterface;
                    if (_chainInterface.verifyNetwork != null) {
                        await _chainInterface.verifyNetwork(this.bitcoinNetwork);
                    }
                    for (let contractVersion in versionedContracts) {
                        await versionedContracts[contractVersion].swapContract.start();
                        this.logger.debug("init(): Intialized swap contract: " + chainIdentifier + ` version: ${contractVersion}`);
                    }
                    await unifiedSwapStorage.init();
                    if (unifiedSwapStorage.storage instanceof IndexedDBUnifiedStorage) {
                        //Try to migrate the data here
                        const storagePrefix = chainIdentifier === "SOLANA" ?
                            "SOLv4-" + this.bitcoinNetwork + "-Swaps-" :
                            "atomiqsdk-" + this.bitcoinNetwork + chainIdentifier + "-Swaps-";
                        await unifiedSwapStorage.storage.tryMigrate([
                            [storagePrefix + "FromBTC", SwapType.FROM_BTC],
                            [storagePrefix + "FromBTCLN", SwapType.FROM_BTCLN],
                            [storagePrefix + "ToBTC", SwapType.TO_BTC],
                            [storagePrefix + "ToBTCLN", SwapType.TO_BTCLN]
                        ], (obj) => {
                            const swap = reviver(obj);
                            if (swap._randomNonce == null) {
                                const oldIdentifierHash = swap.getId();
                                swap._randomNonce = randomBytes(16).toString("hex");
                                const newIdentifierHash = swap.getId();
                                this.logger.info("init(): Found older swap version without randomNonce, replacing, old hash: " + oldIdentifierHash +
                                    " new hash: " + newIdentifierHash);
                            }
                            return swap;
                        });
                    }
                    await unifiedChainEvents.start(this.options.noEvents);
                    this.logger.debug("init(): Initialized events: " + chainIdentifier);
                }
                catch (e) {
                    if (!this.options.gracefullyHandleChainErrors)
                        throw e;
                    this.logger.error(`init(): Failed to initialize ${chainIdentifier} (skipped): `, e);
                    delete this._chains[chainIdentifier];
                    return;
                }
                for (let key in wrappers) {
                    // this.logger.debug("init(): Initializing "+SwapType[key]+": "+chainIdentifier);
                    await wrappers[key].init(this.options.noTimers, this.options.dontCheckPastSwaps);
                }
            })());
        }
        await Promise.all(chainPromises);
        await Promise.all(promises);
        this.logger.debug("init(): Initializing messenger");
        await this.messenger.init();
    }
    /**
     * Initializes the swap storage and loads existing swaps, needs to be called before any other action
     */
    async init() {
        if (this.initialized)
            return;
        if (this.initPromise != null) {
            await this.initPromise;
            return;
        }
        try {
            const promise = this._init();
            this.initPromise = promise;
            await promise;
            delete this.initPromise;
            this.initialized = true;
        }
        catch (e) {
            delete this.initPromise;
            throw e;
        }
    }
    /**
     * Whether the SDK is initialized (after {@link init} is called)
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Stops listening for onchain events and closes this Swapper instance
     */
    async stop() {
        if (this.initPromise)
            await this.initPromise;
        for (let chainIdentifier in this._chains) {
            const { wrappers, unifiedChainEvents } = this._chains[chainIdentifier];
            for (let key in wrappers) {
                const wrapper = wrappers[key];
                wrapper.events.removeListener("swapState", this.swapStateListener);
                await wrapper.stop();
            }
            await unifiedChainEvents.stop();
            await this.messenger.stop();
        }
        this.initialized = false;
    }
    /**
     * Creates swap & handles intermediary, quote selection
     *
     * @param chainIdentifier
     * @param create Callback to create the
     * @param amountData Amount data as passed to the function
     * @param swapType Swap type of the execution
     * @param maxWaitTimeMS Maximum waiting time after the first intermediary returns the quote
     * @private
     * @throws {Error} when no intermediary was found
     * @throws {Error} if the chain with the provided identifier cannot be found
     */
    async createSwap(chainIdentifier, create, amountData, swapType, maxWaitTimeMS = 2000) {
        if (!this.initialized)
            throw new Error("Swapper not initialized, init first with swapper.init()!");
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        let candidates;
        const inBtc = swapType === SwapType.TO_BTCLN || swapType === SwapType.TO_BTC ? !amountData.exactIn : amountData.exactIn;
        if (!inBtc || amountData.amount == null) {
            //Get candidates not based on the amount
            candidates = this.intermediaryDiscovery.getSwapCandidates(chainIdentifier, swapType, amountData.token);
        }
        else {
            candidates = this.intermediaryDiscovery.getSwapCandidates(chainIdentifier, swapType, amountData.token, amountData.amount);
        }
        let swapLimitsChanged = false;
        if (candidates.length === 0) {
            this.logger.warn("createSwap(): No valid intermediary found to execute the swap with, reloading intermediary database...");
            await this.intermediaryDiscovery.reloadIntermediaries();
            swapLimitsChanged = true;
            if (!inBtc || amountData.amount == null) {
                //Get candidates not based on the amount
                candidates = this.intermediaryDiscovery.getSwapCandidates(chainIdentifier, swapType, amountData.token);
            }
            else {
                candidates = this.intermediaryDiscovery.getSwapCandidates(chainIdentifier, swapType, amountData.token, amountData.amount);
                if (candidates.length === 0) {
                    const min = this.intermediaryDiscovery.getSwapMinimum(chainIdentifier, swapType, amountData.token);
                    const max = this.intermediaryDiscovery.getSwapMaximum(chainIdentifier, swapType, amountData.token);
                    if (min != null && max != null) {
                        if (amountData.amount < BigInt(min))
                            throw new OutOfBoundsError("Swap amount too low! Try swapping a higher amount.", 200, BigInt(min), BigInt(max));
                        if (amountData.amount > BigInt(max))
                            throw new OutOfBoundsError("Swap amount too high! Try swapping a lower amount.", 200, BigInt(min), BigInt(max));
                    }
                }
            }
            if (candidates.length === 0)
                throw new Error("No intermediary found for the requested pair and amount! You can try swapping different pair or higher/lower amount.");
        }
        const abortController = new AbortController();
        this.logger.debug("createSwap() Swap candidates: ", candidates.map(lp => lp.url).join());
        const quotePromises = await create(candidates, abortController.signal, this._chains[chainIdentifier]);
        const promiseAll = new Promise((resolve, reject) => {
            let min;
            let max;
            let error;
            let numResolved = 0;
            let quotes = [];
            let timeout;
            quotePromises.forEach(data => {
                data.quote.then(quote => {
                    if (numResolved === 0) {
                        timeout = setTimeout(() => {
                            abortController.abort(new Error("Timed out waiting for quote!"));
                            resolve(quotes);
                        }, maxWaitTimeMS);
                    }
                    numResolved++;
                    quotes.push({
                        quote,
                        intermediary: data.intermediary
                    });
                    if (numResolved === quotePromises.length) {
                        clearTimeout(timeout);
                        resolve(quotes);
                        return;
                    }
                }).catch(e => {
                    numResolved++;
                    if (e instanceof IntermediaryError) {
                        //Blacklist that node
                        this.intermediaryDiscovery.removeIntermediary(data.intermediary);
                        swapLimitsChanged = true;
                    }
                    else if (e instanceof OutOfBoundsError) {
                        if (min == null || max == null) {
                            min = e.min;
                            max = e.max;
                        }
                        else {
                            min = bigIntMin(min, e.min);
                            max = bigIntMax(max, e.max);
                        }
                        data.intermediary.swapBounds[swapType] ??= {};
                        data.intermediary.swapBounds[swapType][chainIdentifier] ??= {};
                        const tokenBoundsData = (data.intermediary.swapBounds[swapType][chainIdentifier][amountData.token] ??= { input: {}, output: {} });
                        if (amountData.exactIn) {
                            tokenBoundsData.input = { min: e.min, max: e.max };
                        }
                        else {
                            tokenBoundsData.output = { min: e.min, max: e.max };
                        }
                        swapLimitsChanged = true;
                    }
                    this.logger.warn("createSwap(): Intermediary " + data.intermediary.url + " error: ", e);
                    error = e;
                    if (numResolved === quotePromises.length) {
                        if (timeout != null)
                            clearTimeout(timeout);
                        if (quotes.length > 0) {
                            resolve(quotes);
                            return;
                        }
                        if (min != null && max != null) {
                            let msg = "Swap amount too high or too low! Try swapping a different amount.";
                            if (amountData.amount != null) {
                                if (min > amountData.amount)
                                    msg = "Swap amount too low! Try swapping a higher amount.";
                                if (max < amountData.amount)
                                    msg = "Swap amount too high! Try swapping a lower amount.";
                            }
                            reject(new OutOfBoundsError(msg, 400, min, max));
                            return;
                        }
                        reject(error);
                    }
                });
            });
        });
        try {
            const quotes = await promiseAll;
            //TODO: Intermediary's reputation is not taken into account!
            quotes.sort((a, b) => {
                if (amountData.exactIn) {
                    //Compare outputs
                    return bigIntCompare(b.quote.getOutput().rawAmount, a.quote.getOutput().rawAmount);
                }
                else {
                    //Compare inputs
                    return bigIntCompare(a.quote.getInput().rawAmount, b.quote.getInput().rawAmount);
                }
            });
            this.logger.debug("createSwap(): Sorted quotes, best price to worst: ", quotes);
            if (swapLimitsChanged)
                this.emit("swapLimitsChanged");
            const quote = quotes[0].quote;
            await quote._save();
            return quote;
        }
        catch (e) {
            if (swapLimitsChanged)
                this.emit("swapLimitsChanged");
            throw e;
        }
    }
    /**
     * Creates Smart chain -> Bitcoin ({@link SwapType.TO_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param address Recipient's bitcoin address
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to use exact in instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCSwap(chainIdentifier, signer, tokenAddress, address, amount, exactIn = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (address.startsWith("bitcoin:")) {
            address = address.substring(8).split("?")[0];
        }
        if (!this.Utils.isValidBitcoinAddress(address))
            throw new Error("Invalid bitcoin address");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(signer, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        signer = this._chains[chainIdentifier].chainInterface.normalizeAddress(signer);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => Promise.resolve(chain.wrappers[SwapType.TO_BTC].create(signer, address, amountData, candidates, options, additionalParams, abortSignal)), amountData, SwapType.TO_BTC);
    }
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param paymentRequest BOLT11 lightning network invoice to be paid (needs to have a fixed amount), and the swap
     *  amount is taken from this fixed amount, hence only exact output swaps are supported
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createToBTCLNSwap(chainIdentifier, signer, tokenAddress, paymentRequest, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (paymentRequest.startsWith("lightning:"))
            paymentRequest = paymentRequest.substring(10);
        if (!this.Utils.isValidLightningInvoice(paymentRequest))
            throw new Error("Invalid lightning network invoice");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(signer, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        signer = this._chains[chainIdentifier].chainInterface.normalizeAddress(signer);
        const parsedPR = bolt11Decode(paymentRequest);
        if (parsedPR.millisatoshis == null)
            throw new Error("Invalid lightning network invoice, no msat value field!");
        const amountData = {
            amount: (BigInt(parsedPR.millisatoshis) + 999n) / 1000n,
            token: tokenAddress,
            exactIn: false
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => chain.wrappers[SwapType.TO_BTCLN].create(signer, paymentRequest, amountData, candidates, options, additionalParams, abortSignal), amountData, SwapType.TO_BTCLN);
    }
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via LNURL-pay link
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param lnurlPay LNURL-pay link to use for the payment
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createToBTCLNSwapViaLNURL(chainIdentifier, signer, tokenAddress, lnurlPay, amount, exactIn = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (typeof (lnurlPay) === "string" && !this.Utils.isValidLNURL(lnurlPay))
            throw new Error("Invalid LNURL-pay link");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(signer, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        signer = this._chains[chainIdentifier].chainInterface.normalizeAddress(signer);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => chain.wrappers[SwapType.TO_BTCLN].createViaLNURL(signer, typeof (lnurlPay) === "string" ? (lnurlPay.startsWith("lightning:") ? lnurlPay.substring(10) : lnurlPay) : lnurlPay.params, amountData, candidates, options, additionalParams, abortSignal), amountData, SwapType.TO_BTCLN);
    }
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via {@link LightningInvoiceCreateService}
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param service Invoice create service object which facilitates the creation of fixed amount LN invoices
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createToBTCLNSwapViaInvoiceCreateService(chainIdentifier, signer, tokenAddress, service, amount, exactIn = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(signer, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        signer = this._chains[chainIdentifier].chainInterface.normalizeAddress(signer);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => chain.wrappers[SwapType.TO_BTCLN].createViaInvoiceCreateService(signer, Promise.resolve(service), amountData, candidates, options, additionalParams, abortSignal), amountData, SwapType.TO_BTCLN);
    }
    /**
     * Creates Bitcoin -> Smart chain ({@link SwapType.SPV_VAULT_FROM_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     * @param postQuoteCreateCallback
     */
    async createFromBTCSwapNew(chainIdentifier, recipient, tokenAddress, amount, exactOut = false, additionalParams = this.options.defaultAdditionalParameters, options, postQuoteCreateCallback = (quote) => Promise.resolve(quote)) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (this._chains[chainIdentifier].wrappers[SwapType.SPV_VAULT_FROM_BTC] == null)
            throw new Error("Chain " + chainIdentifier + " doesn't support new BTC swap protocol (spv vault swaps)!");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount: amount ?? undefined,
            token: tokenAddress,
            exactIn: !exactOut
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => Promise.resolve(chain.wrappers[SwapType.SPV_VAULT_FROM_BTC].create(recipient, amountData, candidates, options, additionalParams, abortSignal).map(({ quote, intermediary }) => ({ quote: quote.then(postQuoteCreateCallback), intermediary }))), amountData, SwapType.SPV_VAULT_FROM_BTC);
    }
    /**
     * Creates Bitcoin -> Smart chain ({@link SwapType.SPV_VAULT_FROM_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param intermediateWallet The intermediate wallet to use for the swap
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createFromBTCSwapNewWithUtxosExactIn(chainIdentifier, intermediateWallet, recipient, tokenAddress, amount, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (this._chains[chainIdentifier].wrappers[SwapType.SPV_VAULT_FROM_BTC] == null)
            throw new Error("Chain " + chainIdentifier + " doesn't support new BTC swap protocol (spv vault swaps)!");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount: amount ?? undefined,
            token: tokenAddress,
            exactIn: true
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => Promise.resolve(chain.wrappers[SwapType.SPV_VAULT_FROM_BTC].createWithUtxosExactIn(recipient, amountData, candidates, toBitcoinWallet(intermediateWallet, this._bitcoinRpc, this.bitcoinNetwork), options, additionalParams, abortSignal)), { token: tokenAddress, exactIn: true }, SwapType.SPV_VAULT_FROM_BTC);
    }
    /**
     * Creates LEGACY Bitcoin -> Smart chain ({@link SwapType.FROM_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createFromBTCSwap(chainIdentifier, recipient, tokenAddress, amount, exactOut = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn: !exactOut
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => Promise.resolve(chain.wrappers[SwapType.FROM_BTC].create(recipient, amountData, candidates, options, additionalParams, abortSignal)), amountData, SwapType.FROM_BTC);
    }
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createFromBTCLNSwap(chainIdentifier, recipient, tokenAddress, amount, exactOut = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn: !exactOut
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => Promise.resolve(chain.wrappers[SwapType.FROM_BTCLN].create(recipient, amountData, candidates, options, additionalParams, abortSignal)), amountData, SwapType.FROM_BTCLN);
    }
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createFromBTCLNSwapViaLNURL(chainIdentifier, recipient, tokenAddress, lnurl, amount, exactOut = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (typeof (lnurl) === "string" && !this.Utils.isValidLNURL(lnurl))
            throw new Error("Invalid LNURL-withdraw link");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn: !exactOut
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => chain.wrappers[SwapType.FROM_BTCLN].createViaLNURL(recipient, typeof (lnurl) === "string" ? (lnurl.startsWith("lightning:") ? lnurl.substring(10) : lnurl) : lnurl.params, amountData, candidates, options, additionalParams, abortSignal), amountData, SwapType.FROM_BTCLN);
    }
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createFromBTCLNSwapNew(chainIdentifier, recipient, tokenAddress, amount, exactOut = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (this._chains[chainIdentifier].wrappers[SwapType.FROM_BTCLN_AUTO] == null)
            throw new Error("Chain " + chainIdentifier + " doesn't support new lightning swap protocol (from btcln auto)!");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn: !exactOut
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => Promise.resolve(chain.wrappers[SwapType.FROM_BTCLN_AUTO].create(recipient, amountData, candidates, options, additionalParams, abortSignal)), amountData, SwapType.FROM_BTCLN_AUTO);
    }
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    async createFromBTCLNSwapNewViaLNURL(chainIdentifier, recipient, tokenAddress, lnurl, amount, exactOut = false, additionalParams = this.options.defaultAdditionalParameters, options) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (this._chains[chainIdentifier].wrappers[SwapType.FROM_BTCLN_AUTO] == null)
            throw new Error("Chain " + chainIdentifier + " doesn't support new lightning swap protocol (from btcln auto)!");
        if (typeof (lnurl) === "string" && !this.Utils.isValidLNURL(lnurl))
            throw new Error("Invalid LNURL-withdraw link");
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const amountData = {
            amount,
            token: tokenAddress,
            exactIn: !exactOut
        };
        return this.createSwap(chainIdentifier, (candidates, abortSignal, chain) => chain.wrappers[SwapType.FROM_BTCLN_AUTO].createViaLNURL(recipient, typeof (lnurl) === "string" ? (lnurl.startsWith("lightning:") ? lnurl.substring(10) : lnurl) : lnurl.params, amountData, candidates, options, additionalParams, abortSignal), amountData, SwapType.FROM_BTCLN_AUTO);
    }
    /**
     * Creates a trusted Bitcoin Lightning -> Smart chain ({@link SwapType.TRUSTED_FROM_BTCLN}) gas swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param amount Amount of native token to receive, in base units
     * @param trustedIntermediaryOrUrl  URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    async createTrustedLNForGasSwap(chainIdentifier, recipient, amount, trustedIntermediaryOrUrl) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const useUrl = trustedIntermediaryOrUrl ?? this.defaultTrustedIntermediary ?? this.options.defaultTrustedIntermediaryUrl;
        if (useUrl == null)
            throw new Error("No trusted intermediary specified!");
        const swap = await this._chains[chainIdentifier].wrappers[SwapType.TRUSTED_FROM_BTCLN].create(recipient, amount, useUrl);
        await swap._save();
        return swap;
    }
    /**
     * Creates a trusted Bitcoin -> Smart chain ({@link SwapType.TRUSTED_FROM_BTC}) gas swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param amount Amount of native token to receive, in base units
     * @param refundAddress Bitcoin refund address, in case the swap fails the funds are refunded here
     * @param trustedIntermediaryOrUrl URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    async createTrustedOnchainForGasSwap(chainIdentifier, recipient, amount, refundAddress, trustedIntermediaryOrUrl) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        if (!this._chains[chainIdentifier].chainInterface.isValidAddress(recipient, true))
            throw new Error("Invalid " + chainIdentifier + " address");
        recipient = this._chains[chainIdentifier].chainInterface.normalizeAddress(recipient);
        const useUrl = trustedIntermediaryOrUrl ?? this.defaultTrustedIntermediary ?? this.options.defaultTrustedIntermediaryUrl;
        if (useUrl == null)
            throw new Error("No trusted intermediary specified!");
        const swap = await this._chains[chainIdentifier].wrappers[SwapType.TRUSTED_FROM_BTC].create(recipient, amount, useUrl, refundAddress);
        await swap._save();
        return swap;
    }
    /**
     * Creates a swap from srcToken to dstToken, of a specific token amount, either specifying input amount (exactIn=true)
     *  or output amount (exactIn=false), NOTE: For regular -> BTC-LN (lightning) swaps the passed amount is ignored and
     *  invoice's pre-set amount is used instead.
     * @deprecated Use {@link swap} instead
     *
     * @param signer Smartchain (Solana, Starknet, etc.) address of the user
     * @param srcToken Source token of the swap, user pays this token
     * @param dstToken Destination token of the swap, user receives this token
     * @param amount Amount of the swap
     * @param exactIn Whether the amount specified is an input amount (exactIn=true) or an output amount (exactIn=false)
     * @param addressLnurlLightningInvoice Bitcoin on-chain address, lightning invoice, LNURL-pay to pay or
     *  LNURL-withdrawal to withdraw money from
     */
    create(signer, srcToken, dstToken, amount, exactIn, addressLnurlLightningInvoice) {
        if (srcToken.chain === "BTC") {
            return this.swap(srcToken, dstToken, amount, exactIn, addressLnurlLightningInvoice, signer);
        }
        else {
            return this.swap(srcToken, dstToken, amount, exactIn, signer, addressLnurlLightningInvoice);
        }
    }
    /**
     * Creates a swap from srcToken to dstToken, of a specific token amount, either specifying input amount (if `exactIn=true`)
     *  or output amount (if `exactIn=false`), NOTE: For regular Smart chain -> BTC-LN (lightning) swaps the passed amount is ignored and
     *  invoice's pre-set amount is used instead, use LNURL-pay links for dynamic amounts
     *
     * @param _srcToken Source token of the swap, user pays this token
     * @param _dstToken Destination token of the swap, user receives this token
     * @param _amount Amount of the swap either in base units as {bigint} or in human readable format (with decimals) as {string}
     * @param exactIn Whether the amount specified is an input amount (exactIn=true) or an output amount (exactIn=false)
     * @param src Source wallet/lnurl-withdraw of the swap
     * @param dst Destination smart chain address, bitcoin on-chain address, lightning invoice, LNURL-pay
     * @param options Options for the swap
     */
    swap(_srcToken, _dstToken, _amount, exactIn, src, dst, options) {
        if (typeof (src) === "string")
            src = this.Utils.stripAddress(src);
        if (typeof (dst) === "string")
            dst = this.Utils.stripAddress(dst);
        const srcToken = typeof (_srcToken) === "string" ? this.getToken(_srcToken) : _srcToken;
        const dstToken = typeof (_dstToken) === "string" ? this.getToken(_dstToken) : _dstToken;
        const amount = _amount == null ? null : (typeof (_amount) === "bigint" ? _amount : fromDecimal(_amount, exactIn ? srcToken.decimals : dstToken.decimals));
        if (isBtcToken(srcToken)) {
            if (isSCToken(dstToken)) {
                if (typeof (dst) !== "string")
                    throw new Error("Destination for BTC/BTC-LN -> smart chain swaps must be a smart chain address!");
                if (srcToken.lightning) {
                    //FROM_BTCLN
                    if (amount == null)
                        throw new Error("Amount cannot be null for from btc swaps!");
                    if (src != null) {
                        if (typeof (src) !== "string" && !isLNURLWithdraw(src))
                            throw new Error("LNURL must be a string or LNURLWithdraw object!");
                        return this.supportsSwapType(dstToken.chainId, SwapType.FROM_BTCLN_AUTO) ?
                            this.createFromBTCLNSwapNewViaLNURL(dstToken.chainId, dst, dstToken.address, src, amount, !exactIn, undefined, options) :
                            this.createFromBTCLNSwapViaLNURL(dstToken.chainId, dst, dstToken.address, src, amount, !exactIn, undefined, options);
                    }
                    else {
                        return this.supportsSwapType(dstToken.chainId, SwapType.FROM_BTCLN_AUTO) ?
                            this.createFromBTCLNSwapNew(dstToken.chainId, dst, dstToken.address, amount, !exactIn, undefined, options) :
                            this.createFromBTCLNSwap(dstToken.chainId, dst, dstToken.address, amount, !exactIn, undefined, options);
                    }
                }
                else {
                    //FROM_BTC
                    if (this.supportsSwapType(dstToken.chainId, SwapType.SPV_VAULT_FROM_BTC)) {
                        if (src != null && typeof (src) !== "string") {
                            if (exactIn)
                                return this.createFromBTCSwapNewWithUtxosExactIn(dstToken.chainId, src, dst, dstToken.address, amount, undefined, options);
                            if (amount == null)
                                throw new Error("Amount cannot be null for from btc swaps!");
                            const spvOptions = options;
                            return this.createFromBTCSwapNew(dstToken.chainId, dst, dstToken.address, amount, true, undefined, { ...spvOptions, sourceWalletUtxos: undefined }, async (swap) => {
                                await swap.setSwapModeIntermediateWallet(src, await spvOptions?.sourceWalletUtxos, await spvOptions?.bitcoinFeeRate, spvOptions?.sourceWalletCpfpAssumption);
                                return swap;
                            });
                        }
                        if (amount == null)
                            throw new Error("Amount cannot be null for from btc swaps!");
                        return this.createFromBTCSwapNew(dstToken.chainId, dst, dstToken.address, amount, !exactIn, undefined, options);
                    }
                    else {
                        if (amount == null)
                            throw new Error("Amount cannot be null for from btc swaps!");
                        return this.createFromBTCSwap(dstToken.chainId, dst, dstToken.address, amount, !exactIn, undefined, options);
                    }
                }
            }
        }
        else if (isSCToken(srcToken)) {
            if (isBtcToken(dstToken)) {
                if (typeof (src) !== "string")
                    throw new Error("Source address for BTC/BTC-LN -> smart chain swaps must be a smart chain address!");
                if (dstToken.lightning) {
                    //TO_BTCLN
                    if (typeof (dst) !== "string" && !isLNURLPay(dst))
                        throw new Error("Destination LNURL link/lightning invoice must be a string or LNURLPay object!");
                    if (isLNURLPay(dst) || this.Utils.isValidLNURL(dst)) {
                        if (amount == null)
                            throw new Error("Amount cannot be null for to btcln swaps via LNURL-pay!");
                        return this.createToBTCLNSwapViaLNURL(srcToken.chainId, src, srcToken.address, dst, amount, !!exactIn, undefined, options);
                    }
                    else if (isLightningInvoiceCreateService(dst)) {
                        if (amount == null)
                            throw new Error("Amount cannot be null for to btcln swaps via InvoiceCreateService!");
                        return this.createToBTCLNSwapViaInvoiceCreateService(srcToken.chainId, src, srcToken.address, dst, amount, !!exactIn, undefined, options);
                    }
                    else if (this.Utils.isLightningInvoice(dst)) {
                        if (!this.Utils.isValidLightningInvoice(dst))
                            throw new Error("Invalid lightning invoice specified, lightning invoice MUST contain pre-set amount!");
                        if (exactIn)
                            throw new Error("Only exact out swaps are possible with lightning invoices, use LNURL links for exact in lightning swaps!");
                        return this.createToBTCLNSwap(srcToken.chainId, src, srcToken.address, dst, undefined, options);
                    }
                    else {
                        throw new Error("Supplied parameter is not LNURL link nor lightning invoice (bolt11)!");
                    }
                }
                else {
                    //TO_BTC
                    if (typeof (dst) !== "string")
                        throw new Error("Destination bitcoin address must be a string!");
                    if (amount == null)
                        throw new Error("Amount cannot be null for to btc swaps!");
                    return this.createToBTCSwap(srcToken.chainId, src, srcToken.address, dst, amount, !!exactIn, undefined, options);
                }
            }
        }
        throw new Error("Unsupported swap type");
    }
    async getAllSwaps(chainId, signer) {
        const queryParams = [];
        if (signer != null)
            queryParams.push({ key: "initiator", value: signer });
        if (chainId == null) {
            const res = await Promise.all(Object.keys(this._chains).map((chainId) => {
                const { unifiedSwapStorage, reviver } = this._chains[chainId];
                return unifiedSwapStorage.query([queryParams], reviver);
            }));
            return res.flat();
        }
        else {
            const { unifiedSwapStorage, reviver } = this._chains[chainId];
            return await unifiedSwapStorage.query([queryParams], reviver);
        }
    }
    async getPendingSwaps(chainId, signer) {
        if (chainId == null) {
            const res = await Promise.all(Object.keys(this._chains).map((chainId) => {
                const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
                const queryParams = [];
                for (let key in wrappers) {
                    const wrapper = wrappers[key];
                    const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
                    if (signer != null)
                        swapTypeQueryParams.push({ key: "initiator", value: signer });
                    swapTypeQueryParams.push({ key: "state", value: wrapper._pendingSwapStates });
                    queryParams.push(swapTypeQueryParams);
                }
                return unifiedSwapStorage.query(queryParams, reviver);
            }));
            return res.flat();
        }
        else {
            const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
            const queryParams = [];
            for (let key in wrappers) {
                const wrapper = wrappers[key];
                const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
                if (signer != null)
                    swapTypeQueryParams.push({ key: "initiator", value: signer });
                swapTypeQueryParams.push({ key: "state", value: wrapper._pendingSwapStates });
                queryParams.push(swapTypeQueryParams);
            }
            return await unifiedSwapStorage.query(queryParams, reviver);
        }
    }
    async getActionableSwaps(chainId, signer) {
        if (chainId == null) {
            return (await this.getPendingSwaps()).filter(swap => swap.requiresAction());
        }
        else {
            return (await this.getPendingSwaps(chainId, signer)).filter(swap => swap.requiresAction());
        }
    }
    async getRefundableSwaps(chainId, signer) {
        if (chainId == null) {
            const res = await Promise.all(Object.keys(this._chains).map((chainId) => {
                const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
                const queryParams = [];
                for (let wrapper of [wrappers[SwapType.TO_BTCLN], wrappers[SwapType.TO_BTC]]) {
                    const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
                    if (signer != null)
                        swapTypeQueryParams.push({ key: "initiator", value: signer });
                    swapTypeQueryParams.push({ key: "state", value: wrapper._refundableSwapStates });
                    queryParams.push(swapTypeQueryParams);
                }
                return unifiedSwapStorage.query(queryParams, reviver);
            }));
            return res.flat().filter(swap => swap.isRefundable());
        }
        else {
            const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
            const queryParams = [];
            for (let wrapper of [wrappers[SwapType.TO_BTCLN], wrappers[SwapType.TO_BTC]]) {
                const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
                if (signer != null)
                    swapTypeQueryParams.push({ key: "initiator", value: signer });
                swapTypeQueryParams.push({ key: "state", value: wrapper._refundableSwapStates });
                queryParams.push(swapTypeQueryParams);
            }
            const result = await unifiedSwapStorage.query(queryParams, reviver);
            return result.filter(swap => swap.isRefundable());
        }
    }
    async getClaimableSwaps(chainId, signer) {
        if (chainId == null) {
            const res = await Promise.all(Object.keys(this._chains).map((chainId) => {
                const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
                const queryParams = [];
                for (let wrapper of [wrappers[SwapType.FROM_BTC], wrappers[SwapType.FROM_BTCLN], wrappers[SwapType.SPV_VAULT_FROM_BTC], wrappers[SwapType.FROM_BTCLN_AUTO]]) {
                    if (wrapper == null)
                        continue;
                    const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
                    if (signer != null)
                        swapTypeQueryParams.push({ key: "initiator", value: signer });
                    swapTypeQueryParams.push({ key: "state", value: wrapper._claimableSwapStates });
                    queryParams.push(swapTypeQueryParams);
                }
                return unifiedSwapStorage.query(queryParams, reviver);
            }));
            return res.flat().filter(swap => swap.isClaimable());
        }
        else {
            const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
            const queryParams = [];
            for (let wrapper of [wrappers[SwapType.FROM_BTC], wrappers[SwapType.FROM_BTCLN], wrappers[SwapType.SPV_VAULT_FROM_BTC], wrappers[SwapType.FROM_BTCLN_AUTO]]) {
                if (wrapper == null)
                    continue;
                const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
                if (signer != null)
                    swapTypeQueryParams.push({ key: "initiator", value: signer });
                swapTypeQueryParams.push({ key: "state", value: wrapper._claimableSwapStates });
                queryParams.push(swapTypeQueryParams);
            }
            const result = await unifiedSwapStorage.query(queryParams, reviver);
            return result.filter(swap => swap.isClaimable());
        }
    }
    async getSwapById(id, chainId, signer) {
        //Check in pending swaps first
        if (chainId != null) {
            for (let key in this._chains[chainId].wrappers) {
                const wrapper = this._chains[chainId].wrappers[key];
                const result = wrapper._getPendingSwap(id);
                if (result != null) {
                    if (signer != null) {
                        if (result._getInitiator() === signer)
                            return result;
                    }
                    else {
                        return result;
                    }
                }
            }
        }
        else {
            for (let chainId in this._chains) {
                for (let key in this._chains[chainId].wrappers) {
                    const wrapper = this._chains[chainId].wrappers[key];
                    const result = wrapper._getPendingSwap(id);
                    if (result != null) {
                        if (signer != null) {
                            if (result._getInitiator() === signer)
                                return result;
                        }
                        else {
                            return result;
                        }
                    }
                }
            }
        }
        const queryParams = [];
        if (signer != null)
            queryParams.push({ key: "initiator", value: signer });
        queryParams.push({ key: "id", value: id });
        if (chainId == null) {
            const res = await Promise.all(Object.keys(this._chains).map((chainId) => {
                const { unifiedSwapStorage, reviver } = this._chains[chainId];
                return unifiedSwapStorage.query([queryParams], reviver);
            }));
            return res.flat()[0];
        }
        else {
            const { unifiedSwapStorage, reviver } = this._chains[chainId];
            return (await unifiedSwapStorage.query([queryParams], reviver))[0];
        }
    }
    /**
     * Returns the swap with a proper return type, or `undefined` if not found or has wrong type
     *
     * @param id An ID of the swap ({@link ISwap.getId})
     * @param chainId Chain identifier of the smart chain where the swap was initiated
     * @param swapType Type of the swap
     * @param signer An optional required smart chain signer address to fetch the swap for
     */
    async getTypedSwapById(id, chainId, swapType, signer) {
        let _swapType = swapType;
        if (swapType === SwapType.FROM_BTC && this.supportsSwapType(chainId, SwapType.SPV_VAULT_FROM_BTC))
            _swapType = SwapType.SPV_VAULT_FROM_BTC;
        if (swapType === SwapType.FROM_BTCLN && this.supportsSwapType(chainId, SwapType.FROM_BTCLN_AUTO))
            _swapType = SwapType.FROM_BTCLN_AUTO;
        const wrapper = this._chains[chainId].wrappers[_swapType];
        if (wrapper == null)
            return;
        const result = wrapper._getPendingSwap(id);
        if (result != null) {
            if (signer != null) {
                if (result._getInitiator() === signer)
                    return result;
            }
            else {
                return result;
            }
        }
        const queryParams = [];
        if (signer != null)
            queryParams.push({ key: "initiator", value: signer });
        queryParams.push({ key: "id", value: id });
        const { unifiedSwapStorage, reviver } = this._chains[chainId];
        const swap = (await unifiedSwapStorage.query([queryParams], reviver))[0];
        if (isSwapType(swap, swapType))
            return swap;
    }
    async syncSwapsForChain(chainId, signer) {
        const { unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
        const queryParams = [];
        for (let key in wrappers) {
            const wrapper = wrappers[key];
            const swapTypeQueryParams = [{ key: "type", value: wrapper.TYPE }];
            if (signer != null)
                swapTypeQueryParams.push({ key: "initiator", value: signer });
            swapTypeQueryParams.push({ key: "state", value: wrapper._pendingSwapStates });
            queryParams.push(swapTypeQueryParams);
        }
        this.logger.debug("_syncSwaps(): Querying swaps swaps for chain " + chainId + "!");
        const swaps = await unifiedSwapStorage.query(queryParams, reviver);
        this.logger.debug("_syncSwaps(): Syncing " + swaps.length + " swaps!");
        const changedSwaps = [];
        const removeSwaps = [];
        const assortedSwaps = {};
        swaps.forEach(swap => {
            (assortedSwaps[swap.getType()] ??= []).push(swap);
        });
        for (let key in assortedSwaps) {
            const swapType = key;
            const wrapperSwaps = assortedSwaps[swapType];
            const wrapper = wrappers[swapType];
            const result = await wrapper.checkPastSwaps(wrapperSwaps, true);
            changedSwaps.push(...result.changedSwaps);
            removeSwaps.push(...result.removeSwaps);
        }
        this.logger.debug("_syncSwaps(): Done syncing " + swaps.length + " swaps, saving " + changedSwaps.length + " changed swaps, removing " + removeSwaps.length + " swaps!");
        await unifiedSwapStorage.saveAll(changedSwaps, true);
        await unifiedSwapStorage.removeAll(removeSwaps, true);
        changedSwaps.forEach(swap => swap._emitEvent());
        removeSwaps.forEach(swap => swap._emitEvent());
    }
    /**
     * Deletes the swaps from the persistent storage backend. Note that some data (like lightning network
     *  amounts and bolt11 invoices) are purely off-chain and can never be recovered later just from
     *  on-chain data!
     *
     * @param chainId Optional, to only delete swaps for this smart chain
     * @param signer Optional, to only delete swaps for this smart chain signer (`chainId` param must be
     *  set to delete only signer's swaps)
     */
    async wipeStorage(chainId, signer) {
        if (chainId == null) {
            const swaps = await this.getAllSwaps();
            const chainSwaps = {};
            swaps.forEach(swap => (chainSwaps[swap.chainIdentifier] ??= []).push(swap));
            for (let chainId in chainSwaps) {
                const currentChainSwaps = chainSwaps[chainId];
                if (this._chains[chainId] == null) {
                    this.logger.warn(`wipeStorage(): Attempted to remove ${currentChainSwaps.length} swaps on ${chainId}, but smart chain not known!`);
                    continue;
                }
                await this._chains[chainId].unifiedSwapStorage.removeAll(currentChainSwaps);
                this.logger.debug(`wipeStorage(): Successfully removed ${currentChainSwaps.length} swaps on ${chainId}!`);
            }
        }
        else {
            if (this._chains[chainId] == null)
                throw new Error(`wipeStorage(): Smart chain with identifier ${chainId} not found!`);
            const swaps = await this.getAllSwaps(chainId, signer);
            await this._chains[chainId].unifiedSwapStorage.removeAll(swaps);
            this.logger.debug(`wipeStorage(): Successfully removed ${swaps.length} swaps on ${chainId}!`);
        }
    }
    /**
     * Synchronizes swaps from on-chain, this is ran automatically when SDK is initialized, hence
     *  should only be ran manually when `dontCheckPastSwaps=true` is passed in the swapper options,
     *  also deletes expired quotes
     *
     * @param chainId Optional chain identifier to only run swap sync for a single smart chain
     * @param signer Optional signer to only run swap sync for swaps initiated by this signer
     */
    async _syncSwaps(chainId, signer) {
        if (chainId == null) {
            await Promise.all(Object.keys(this._chains).map((chainId) => {
                return this.syncSwapsForChain(chainId, signer);
            }));
        }
        else {
            await this.syncSwapsForChain(chainId, signer);
        }
    }
    /**
     * When the swapper is initiated with the `noEvents` config this function allows you to manually poll for on-chain
     *  events. It returns an events cursor which you should save and pass to the next call to the `poll()` function.
     *
     * @param chainId Chain for which to poll the chain events listener for
     * @param lastEventCursorState Event cursor state returned from the last call to the `poll()` function
     */
    async _pollChainEvents(chainId, lastEventCursorState) {
        const chain = this._chains[chainId];
        if (chain == null)
            throw new Error(`Invalid chain id ${chainId}!`);
        return chain.unifiedChainEvents.poll(lastEventCursorState);
    }
    /**
     * Recovers swaps from on-chain historical data.
     *
     * Please note that the recovered swaps might not be complete (i.e. missing amounts or addresses), as some
     *  of the swap data is purely off-chain and can never be recovered purely from on-chain data. This
     *  functions tries to recover as much swap data as possible.
     *
     * @param chainId Smart chain identifier string to recover the swaps from
     * @param signer Signer address to recover the swaps for
     * @param startBlockheight Optional starting blockheight for swap data recovery, will only check swaps
     *  initiated after this blockheight
     */
    async recoverSwaps(chainId, signer, startBlockheight) {
        //TODO: Recover swaps from all the known contract versions
        const { versionedContracts, unifiedSwapStorage, reviver, wrappers } = this._chains[chainId];
        const recoveredSwaps = [];
        let someVersionSupportsRecovery = false;
        const recoveredEscrowStates = {};
        const recoveredSpvStates = {};
        for (let contractVersion in versionedContracts) {
            const { swapContract, spvVaultContract } = versionedContracts[contractVersion];
            if (swapContract.getHistoricalSwaps == null ||
                (spvVaultContract != null && spvVaultContract.getHistoricalWithdrawalStates == null)) {
                this.logger.warn(`recoverSwaps(): Swap data recovery not supported on ${chainId}, with contract version ${contractVersion}`);
                continue;
            }
            someVersionSupportsRecovery = true;
            const { swaps } = await swapContract.getHistoricalSwaps(signer, startBlockheight);
            const spvVaultData = wrappers[SwapType.SPV_VAULT_FROM_BTC] == null
                ? undefined
                : await spvVaultContract?.getHistoricalWithdrawalStates(signer, startBlockheight);
            for (let key in swaps)
                recoveredEscrowStates[key] = { ...swaps[key], contractVersion };
            if (spvVaultData != null)
                for (let key in spvVaultData.withdrawals)
                    (recoveredSpvStates[contractVersion] ??= {})[key] = spvVaultData.withdrawals[key];
        }
        if (!someVersionSupportsRecovery)
            throw new Error(`Historical swap recovery is not supported for ${chainId}`);
        const escrowHashes = Object.keys(recoveredEscrowStates);
        for (let contractVersion in recoveredSpvStates)
            Object.keys(recoveredSpvStates[contractVersion]).forEach(btcTxId => escrowHashes.push(btcTxId));
        this.logger.debug(`recoverSwaps(): Loaded on-chain data for ${escrowHashes.length} swaps`);
        this.logger.debug(`recoverSwaps(): Fetching if swap escrowHashes are known: ${escrowHashes.join(", ")}`);
        const knownSwapsArray = await unifiedSwapStorage.query([[{ key: "escrowHash", value: escrowHashes }]], reviver);
        const knownSwaps = {};
        knownSwapsArray.forEach(val => {
            const escrowHash = val._getEscrowHash();
            if (escrowHash != null)
                knownSwaps[escrowHash] = val;
        });
        this.logger.debug(`recoverSwaps(): Fetched known swaps escrowHashes: ${Object.keys(knownSwaps).join(", ")}`);
        for (let escrowHash in recoveredEscrowStates) {
            const { init, state, contractVersion } = recoveredEscrowStates[escrowHash];
            const knownSwap = knownSwaps[escrowHash];
            const { swapContract } = versionedContracts[contractVersion];
            if (knownSwap == null) {
                if (init == null) {
                    this.logger.warn(`recoverSwaps(escrow): Fetched ${escrowHash} swap state, but swap not found locally!`);
                    continue;
                }
            }
            else if (knownSwap instanceof IEscrowSwap) {
                this.logger.debug(`recoverSwaps(escrow): Forcibly updating ${escrowHash} swap: swap already known and in local storage!`);
                if ((knownSwap._contractVersion ?? "v1") !== contractVersion) {
                    this.logger.debug(`recoverSwaps(escrow): Skipping ${escrowHash} swap: swap uses contract version ${knownSwap._contractVersion ?? "v1"}, but state comes from ${contractVersion}!`);
                    continue;
                }
                if (await knownSwap._forciblySetOnchainState(state)) {
                    await knownSwap._save();
                }
                continue;
            }
            else {
                this.logger.debug(`recoverSwaps(escrow): Skipping ${escrowHash} swap: swap already known and in local storage!`);
                continue;
            }
            const data = init.data;
            //Classify swap
            let swap;
            let typeIdentified = false;
            if (data.getType() === ChainSwapType.HTLC) {
                if (data.isOfferer(signer)) {
                    //To BTCLN
                    typeIdentified = true;
                    const lp = this.intermediaryDiscovery.intermediaries.find(val => val.supportsChain(chainId) && data.isClaimer(val.getAddress(chainId)));
                    swap = await wrappers[SwapType.TO_BTCLN].recoverFromSwapDataAndState(init, state, contractVersion, lp);
                }
                else if (data.isClaimer(signer)) {
                    //From BTCLN
                    typeIdentified = true;
                    const lp = this.intermediaryDiscovery.intermediaries.find(val => val.supportsChain(chainId) && data.isOfferer(val.getAddress(chainId)));
                    if (swapContract.supportsInitWithoutClaimer && wrappers[SwapType.FROM_BTCLN_AUTO] != null) {
                        swap = await wrappers[SwapType.FROM_BTCLN_AUTO].recoverFromSwapDataAndState(init, state, contractVersion, lp);
                    }
                    else {
                        swap = await wrappers[SwapType.FROM_BTCLN].recoverFromSwapDataAndState(init, state, contractVersion, lp);
                    }
                }
            }
            else if (data.getType() === ChainSwapType.CHAIN_NONCED) {
                //To BTC
                typeIdentified = true;
                const lp = this.intermediaryDiscovery.intermediaries.find(val => val.supportsChain(chainId) && data.isClaimer(val.getAddress(chainId)));
                swap = await wrappers[SwapType.TO_BTC].recoverFromSwapDataAndState(init, state, contractVersion, lp);
            }
            else if (data.getType() === ChainSwapType.CHAIN) {
                //From BTC
                typeIdentified = true;
                const lp = this.intermediaryDiscovery.intermediaries.find(val => val.supportsChain(chainId) && data.isOfferer(val.getAddress(chainId)));
                swap = await wrappers[SwapType.FROM_BTC].recoverFromSwapDataAndState(init, state, contractVersion, lp);
            }
            if (swap != null) {
                recoveredSwaps.push(swap);
            }
            else {
                if (typeIdentified)
                    this.logger.debug(`recoverSwaps(escrow): Swap data type correctly identified but swap returned is null for swap ${escrowHash}`);
            }
        }
        for (let contractVersion in recoveredSpvStates) {
            const { spvVaultContract } = versionedContracts[contractVersion];
            const spvVaultData = recoveredSpvStates[contractVersion];
            const vaultsData = await spvVaultContract.getMultipleVaultData(Object.keys(spvVaultData)
                .map(btcTxId => ({
                owner: spvVaultData[btcTxId].owner,
                vaultId: spvVaultData[btcTxId].vaultId
            })));
            for (let btcTxId in spvVaultData) {
                const state = spvVaultData[btcTxId];
                const knownSwap = knownSwaps[btcTxId];
                if (knownSwap != null) {
                    if (knownSwap instanceof SpvFromBTCSwap) {
                        this.logger.debug(`recoverSwaps(spv_vault): Forcibly updating ${btcTxId} swap: swap already known and in local storage!`);
                        //TODO: Forcibly set on-chain state to the swap
                        // if(await knownSwap._forciblySetOnchainState(state)) {
                        //     await knownSwap._save();
                        // }
                        continue;
                    }
                    else {
                        this.logger.debug(`recoverSwaps(spv_vault): Skipping ${btcTxId} swap: swap already known and in local storage!`);
                        continue;
                    }
                }
                const lp = this.intermediaryDiscovery.intermediaries.find(val => val.supportsChain(chainId) && state.owner.toLowerCase() === val.getAddress(chainId).toLowerCase());
                const swap = await wrappers[SwapType.SPV_VAULT_FROM_BTC].recoverFromState(state, contractVersion, vaultsData[state.owner]?.[state.vaultId.toString(10)], lp);
                if (swap != null) {
                    recoveredSwaps.push(swap);
                }
                else {
                    this.logger.debug(`recoverSwaps(spv_vault): Swap data type correctly identified but swap returned is null for swap ${btcTxId}`);
                }
            }
        }
        this.logger.debug(`recoverSwaps(): Successfully recovered ${recoveredSwaps.length} swaps!`);
        return recoveredSwaps;
    }
    /**
     * Returns the {@link Token} object for a given token
     *
     * @param tickerOrAddress Token to return the object for, can use multiple formats:
     *  - a) token ticker, such as `"BTC"`, `"SOL"`, etc.
     *  - b) token ticker prefixed with smart chain identifier, such as `"SOLANA-SOL"`, `"SOLANA-USDC"`, etc.
     *  - c) token address
     */
    getToken(tickerOrAddress) {
        //Btc tokens - BTC, BTCLN, BTC-LN
        if (tickerOrAddress === "BTC" || tickerOrAddress === "BITCOIN-BTC")
            return BitcoinTokens.BTC;
        if (tickerOrAddress === "BTCLN" || tickerOrAddress === "BTC-LN" || tickerOrAddress === "LIGHTNING-BTC")
            return BitcoinTokens.BTCLN;
        //Check if the ticker is in format <chainId>-<ticker>, i.e. SOLANA-USDC, STARKNET-WBTC
        if (tickerOrAddress.includes("-")) {
            const [chainId, ticker] = tickerOrAddress.split("-");
            const token = this._tokensByTicker[chainId]?.[ticker];
            if (token == null)
                throw new UserError(`Not found ticker: ${ticker} for chainId: ${chainId}`);
            return token;
        }
        const possibleTokens = [];
        for (let chainId in this._chains) {
            const chain = this._chains[chainId];
            if (chain.chainInterface.isValidToken(tickerOrAddress)) {
                //Try to find in known token addresses
                const token = this._tokens[chainId]?.[tickerOrAddress];
                if (token != null)
                    return token;
            }
            else {
                //Check in known tickers
                const token = this._tokensByTicker[chainId]?.[tickerOrAddress];
                if (token != null)
                    possibleTokens.push(token);
            }
        }
        if (possibleTokens.length === 0)
            throw new UserError(`Specified token address or ticker ${tickerOrAddress} not found!`);
        //In case we've found the token in multiple chains
        if (possibleTokens.length > 1)
            throw new UserError(`A ticker ${tickerOrAddress} has been found in multiple chains, narrow it down by using <chainId>-${tickerOrAddress} notation`);
        return possibleTokens[0];
    }
    /**
     * Creates a child swapper instance with a given smart chain
     *
     * @param chainIdentifier Smart chain identifier for the created child swapper instance
     */
    withChain(chainIdentifier) {
        if (this._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return new SwapperWithChain(this, chainIdentifier);
    }
    /**
     * Returns an array of all the supported smart chains
     */
    getSmartChains() {
        return Object.keys(this._chains);
    }
    /**
     * Returns whether the SDK supports a given swap type on a given chain based on currently known LPs
     *
     * @param chainId Smart chain identifier string
     * @param swapType Swap protocol type
     */
    supportsSwapType(chainId, swapType) {
        return (this._chains[chainId]?.wrappers[swapType] != null);
    }
    /**
     * Returns type of the swap based on input and output tokens specified
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapType(srcToken, dstToken) {
        if (isSCToken(srcToken)) {
            if (!isBtcToken(dstToken))
                throw new Error("Swap not supported");
            if (dstToken.lightning) {
                return SwapType.TO_BTCLN;
            }
            else {
                return SwapType.TO_BTC;
            }
        }
        else if (isBtcToken(srcToken)) {
            if (!isSCToken(dstToken))
                throw new Error("Swap not supported");
            if (srcToken.lightning) {
                if (this.supportsSwapType(dstToken.chainId, SwapType.FROM_BTCLN_AUTO)) {
                    return SwapType.FROM_BTCLN_AUTO;
                }
                else {
                    return SwapType.FROM_BTCLN;
                }
            }
            else {
                if (this.supportsSwapType(dstToken.chainId, SwapType.SPV_VAULT_FROM_BTC)) {
                    return SwapType.SPV_VAULT_FROM_BTC;
                }
                else {
                    return SwapType.FROM_BTC;
                }
            }
        }
        throw new Error("Swap not supported");
    }
    /**
     * Returns minimum/maximum limits for inputs and outputs for a swap between given tokens
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapLimits(srcToken, dstToken) {
        const swapType = this.getSwapType(srcToken, dstToken);
        const scToken = isSCToken(srcToken) ? srcToken : isSCToken(dstToken) ? dstToken : null;
        if (scToken == null)
            throw new Error("At least one token needs to be a smart chain token!");
        const result = {
            input: {},
            output: {}
        };
        for (let lp of this.intermediaryDiscovery.intermediaries) {
            const lpMinMax = lp.getSwapLimits(swapType, scToken.chainId, scToken.address);
            if (lpMinMax == null)
                continue;
            result.input.min = result.input.min == null ? lpMinMax.input.min : bigIntMin(result.input.min, lpMinMax.input.min);
            result.input.max = result.input.max == null ? lpMinMax.input.max : bigIntMax(result.input.max, lpMinMax.input.max);
            result.output.min = result.output.min == null ? lpMinMax.output.min : bigIntMin(result.output.min, lpMinMax.output.min);
            result.output.max = result.output.max == null ? lpMinMax.output.max : bigIntMax(result.output.max, lpMinMax.output.max);
        }
        return {
            input: {
                min: toTokenAmount(result.input.min ?? 1n, srcToken, this.prices),
                max: result.input.max == null ? undefined : toTokenAmount(result.input.max, srcToken, this.prices),
            },
            output: {
                min: toTokenAmount(result.output.min ?? 1n, dstToken, this.prices),
                max: result.output.max == null ? undefined : toTokenAmount(result.output.max, dstToken, this.prices),
            }
        };
    }
    /**
     * Returns an array of supported tokens either on the input or on the output of a swap
     *
     * @param input Whether to return input tokens or output tokens
     */
    getSupportedTokens(input) {
        const tokens = {};
        let lightning = false;
        let btc = false;
        this.intermediaryDiscovery.intermediaries.forEach(lp => {
            for (let swapType of [SwapType.TO_BTC, SwapType.TO_BTCLN, SwapType.FROM_BTC, SwapType.FROM_BTCLN, SwapType.SPV_VAULT_FROM_BTC, SwapType.FROM_BTCLN_AUTO]) {
                if (lp.services[swapType]?.chainTokens == null)
                    continue;
                for (let chainId of this.getSmartChains()) {
                    if (this.supportsSwapType(chainId, SwapType.SPV_VAULT_FROM_BTC) ? swapType === SwapType.FROM_BTC : swapType === SwapType.SPV_VAULT_FROM_BTC)
                        continue;
                    if (this.supportsSwapType(chainId, SwapType.FROM_BTCLN_AUTO) ? swapType === SwapType.FROM_BTCLN : swapType === SwapType.FROM_BTCLN_AUTO)
                        continue;
                    const chainTokens = lp.services[swapType]?.chainTokens?.[chainId];
                    if (chainTokens == null)
                        continue;
                    for (let tokenAddress of chainTokens) {
                        if (input) {
                            if (swapType === SwapType.TO_BTC || swapType === SwapType.TO_BTCLN) {
                                tokens[chainId] ??= new Set();
                                tokens[chainId].add(tokenAddress);
                            }
                            if (swapType === SwapType.FROM_BTCLN || swapType === SwapType.FROM_BTCLN_AUTO) {
                                lightning = true;
                            }
                            if (swapType === SwapType.FROM_BTC || swapType === SwapType.SPV_VAULT_FROM_BTC) {
                                btc = true;
                            }
                        }
                        else {
                            if (swapType === SwapType.FROM_BTCLN || swapType === SwapType.FROM_BTC || swapType === SwapType.SPV_VAULT_FROM_BTC || swapType === SwapType.FROM_BTCLN_AUTO) {
                                tokens[chainId] ??= new Set();
                                tokens[chainId].add(tokenAddress);
                            }
                            if (swapType === SwapType.TO_BTCLN) {
                                lightning = true;
                            }
                            if (swapType === SwapType.TO_BTC) {
                                btc = true;
                            }
                        }
                    }
                }
            }
        });
        const output = [];
        if (lightning)
            output.push(BitcoinTokens.BTCLN);
        if (btc)
            output.push(BitcoinTokens.BTC);
        for (let chainId in tokens) {
            tokens[chainId].forEach(tokenAddress => {
                const token = this._tokens?.[chainId]?.[tokenAddress];
                if (token != null)
                    output.push(token);
            });
        }
        return output;
    }
    /**
     * Returns a set of supported tokens by all the intermediaries offering a specific swap service
     *
     * @param _swapType Swap service type to check supported tokens for
     */
    getSupportedTokensForSwapType(_swapType) {
        const tokens = {};
        this.intermediaryDiscovery.intermediaries.forEach(lp => {
            for (let chainId of this.getSmartChains()) {
                let swapType = _swapType;
                if (swapType === SwapType.FROM_BTC && this.supportsSwapType(chainId, SwapType.SPV_VAULT_FROM_BTC))
                    swapType = SwapType.SPV_VAULT_FROM_BTC;
                if (swapType === SwapType.FROM_BTCLN && this.supportsSwapType(chainId, SwapType.FROM_BTCLN_AUTO))
                    swapType = SwapType.FROM_BTCLN_AUTO;
                if (lp.services[swapType]?.chainTokens == null)
                    break;
                const chainTokens = lp.services[swapType]?.chainTokens?.[chainId];
                if (chainTokens == null)
                    continue;
                for (let tokenAddress of chainTokens) {
                    tokens[chainId] ??= new Set();
                    tokens[chainId].add(tokenAddress);
                }
            }
        });
        const output = [];
        for (let chainId in tokens) {
            tokens[chainId].forEach(tokenAddress => {
                const token = this._tokens?.[chainId]?.[tokenAddress];
                if (token != null)
                    output.push(token);
            });
        }
        return output;
    }
    /**
     * Returns the set of supported token addresses by all the intermediaries we know of offering a specific swapType service
     *
     * @param chainIdentifier Chain identifier string
     * @param swapType Specific swap type for which to obtain supported tokens
     */
    getSupportedTokenAddresses(chainIdentifier, swapType) {
        const set = new Set();
        this.intermediaryDiscovery.intermediaries.forEach(lp => {
            const chainTokens = lp.services[swapType]?.chainTokens?.[chainIdentifier];
            if (chainTokens == null)
                return;
            chainTokens.forEach(token => set.add(token));
        });
        return set;
    }
    /**
     * Returns tokens that you can swap to (if input=true) from a given token,
     *  or tokens that you can swap from (if input=false) to a given token
     */
    getSwapCounterTokens(token, input) {
        if (isSCToken(token)) {
            const result = [];
            if (input) {
                //TO_BTC or TO_BTCLN
                if (this.getSupportedTokenAddresses(token.chainId, SwapType.TO_BTCLN).has(token.address)) {
                    result.push(BitcoinTokens.BTCLN);
                }
                if (this.getSupportedTokenAddresses(token.chainId, SwapType.TO_BTC).has(token.address)) {
                    result.push(BitcoinTokens.BTC);
                }
            }
            else {
                //FROM_BTC or FROM_BTCLN
                const fromLightningSwapType = this.supportsSwapType(token.chainId, SwapType.FROM_BTCLN_AUTO) ? SwapType.FROM_BTCLN_AUTO : SwapType.FROM_BTCLN;
                if (this.getSupportedTokenAddresses(token.chainId, fromLightningSwapType).has(token.address)) {
                    result.push(BitcoinTokens.BTCLN);
                }
                const fromOnchainSwapType = this.supportsSwapType(token.chainId, SwapType.SPV_VAULT_FROM_BTC) ? SwapType.SPV_VAULT_FROM_BTC : SwapType.FROM_BTC;
                if (this.getSupportedTokenAddresses(token.chainId, fromOnchainSwapType).has(token.address)) {
                    result.push(BitcoinTokens.BTC);
                }
            }
            return result;
        }
        else {
            if (input) {
                if (token.lightning) {
                    return this.getSupportedTokensForSwapType(SwapType.FROM_BTCLN);
                }
                else {
                    return this.getSupportedTokensForSwapType(SwapType.FROM_BTC);
                }
            }
            else {
                if (token.lightning) {
                    return this.getSupportedTokensForSwapType(SwapType.TO_BTCLN);
                }
                else {
                    return this.getSupportedTokensForSwapType(SwapType.TO_BTC);
                }
            }
        }
    }
}
