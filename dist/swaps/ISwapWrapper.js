"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ISwapWrapper = exports.DEFAULT_MAX_PARALLEL_SWAP_SYNCS = exports.DEFAULT_MAX_PARALLEL_SWAP_TICKS = void 0;
const base_1 = require("@atomiqlabs/base");
const events_1 = require("events");
const IntermediaryError_1 = require("../errors/IntermediaryError");
const Logger_1 = require("../utils/Logger");
const TokenUtils_1 = require("../utils/TokenUtils");
const UserError_1 = require("../errors/UserError");
exports.DEFAULT_MAX_PARALLEL_SWAP_TICKS = 50;
exports.DEFAULT_MAX_PARALLEL_SWAP_SYNCS = 50;
/**
 * Base abstract class for swap handler implementations
 *
 * @category Swaps/Base
 */
class ISwapWrapper {
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, events) {
        /**
         * Logger instance
         * @internal
         */
        this.logger = (0, Logger_1.getLogger)(this.constructor.name + ": ");
        /**
         * In-memory mapping of pending (not initiated) swaps, utilizing weak references to automatically
         *  free memory when swaps are dereferenced in not initiated state
         * @internal
         */
        this.pendingSwaps = new Map();
        /**
         * Whether this wrapper is initialized (have to call {@link init} to initialize a wrapper)
         * @internal
         */
        this.isInitialized = false;
        if (options?.maxParallelSwapTicks != null && options.maxParallelSwapTicks < 1)
            throw new Error("maxParallelSwapTicks must be at least 1!");
        if (options?.maxParallelSwapSyncs != null && options.maxParallelSwapSyncs < 1)
            throw new Error("maxParallelSwapSyncs must be at least 1!");
        this.unifiedStorage = unifiedStorage;
        this.unifiedChainEvents = unifiedChainEvents;
        this.chainIdentifier = chainIdentifier;
        this._chain = chain;
        this._prices = prices;
        this.events = events || new events_1.EventEmitter();
        this._options = options;
        this._tokens = tokens;
    }
    /**
     * Parses the provided gas amount from its `string` or `bigint` representation to `bigint` base units.
     *
     * Defaults to `0n` if no gasAmount is provided
     *
     * @param gasAmount
     * @internal
     */
    parseGasAmount(gasAmount) {
        let result;
        if (typeof (gasAmount) === "string") {
            result = (0, TokenUtils_1.fromHumanReadableString)(gasAmount, this._getNativeToken());
            if (result == null)
                throw new UserError_1.UserError("Invalid `gasAmount` option provided, not a numerical string!");
        }
        else {
            result = gasAmount;
        }
        return result ?? 0n;
    }
    /**
     * Pre-fetches swap price for a given swap
     *
     * @param amountData Amount data
     * @param abortSignal Abort signal
     * @returns Price of the token in uSats (micro sats)
     * @internal
     */
    preFetchPrice(amountData, abortSignal) {
        return this._prices.preFetchPrice(this.chainIdentifier, amountData.token, abortSignal).catch(e => {
            this.logger.error("preFetchPrice.token(): Error: ", e);
            return undefined;
        });
    }
    /**
     * Pre-fetches bitcoin's USD price
     *
     * @param abortSignal Abort signal
     * @internal
     */
    preFetchUsdPrice(abortSignal) {
        return this._prices.preFetchUsdPrice(abortSignal).catch(e => {
            this.logger.error("preFetchPrice.usd(): Error: ", e);
            return undefined;
        });
    }
    /**
     * Verifies returned price for swaps
     *
     * @param lpServiceData Service data for the service in question (TO_BTCLN, TO_BTC, etc.) of the given intermediary
     * @param send Whether this is a send (Smart chain -> Bitcoin) or receive (Bitcoin -> Smart chain) swap
     * @param amountSats Amount in BTC
     * @param amountToken Amount in token
     * @param token Token used in the swap
     * @param feeData Fee data as returned by the intermediary
     * @param pricePrefetchPromise Optional price pre-fetch promise
     * @param usdPricePrefetchPromise Optiona USD price pre-fetch promise
     * @param abortSignal Abort signal
     * @returns Price info object
     * @throws {IntermediaryError} if the calculated fee is too high
     *
     * @internal
     */
    async verifyReturnedPrice(lpServiceData, send, amountSats, amountToken, token, feeData, pricePrefetchPromise = Promise.resolve(undefined), usdPricePrefetchPromise = Promise.resolve(undefined), abortSignal) {
        const swapBaseFee = BigInt(lpServiceData.swapBaseFee);
        const swapFeePPM = BigInt(lpServiceData.swapFeePPM);
        if (send && feeData.networkFee != null)
            amountToken = amountToken - feeData.networkFee;
        const [isValidAmount, usdPrice] = await Promise.all([
            send ?
                this._prices.isValidAmountSend(this.chainIdentifier, amountSats, swapBaseFee, swapFeePPM, amountToken, token, abortSignal, await pricePrefetchPromise) :
                this._prices.isValidAmountReceive(this.chainIdentifier, amountSats, swapBaseFee, swapFeePPM, amountToken, token, abortSignal, await pricePrefetchPromise),
            usdPricePrefetchPromise.then(value => {
                if (value != null)
                    return value;
                return this._prices.preFetchUsdPrice(abortSignal);
            })
        ]);
        if (!isValidAmount.isValid)
            throw new IntermediaryError_1.IntermediaryError("Fee too high");
        isValidAmount.realPriceUsdPerBitcoin = usdPrice;
        return isValidAmount;
    }
    /**
     * Starts the interval calling the {@link ISwap._tick} on all the known swaps in tick-enabled states
     * @internal
     */
    startTickInterval() {
        if (this.tickSwapState == null || this.tickSwapState.length === 0)
            return;
        if (this.tickAbortController != null)
            this.tickAbortController.abort("New tick interval has been started!");
        const abortController = this.tickAbortController = new AbortController();
        let run;
        run = async () => {
            if (!this.isInitialized)
                return;
            await this.tick(undefined, abortController.signal).catch(e => {
                if (abortController.signal.aborted)
                    return;
                this.logger.warn("startTickInterval(): Tick on swaps failed, error: ", e);
            });
            if (abortController.signal.aborted)
                return;
            if (!this.isInitialized)
                return;
            this.tickInterval = setTimeout(run, 1000);
        };
        run();
    }
    /**
     * Runs checks on passed swaps, syncing their state from on-chain data
     *
     * @param pastSwaps Swaps to check
     * @internal
     */
    async _checkPastSwaps(pastSwaps) {
        const changedSwaps = [];
        const removeSwaps = [];
        await Promise.all(pastSwaps.map((swap) => swap._sync(false).then(changed => {
            if (swap.isQuoteExpired()) {
                removeSwaps.push(swap);
                this.logger.debug("_checkPastSwaps(): Removing expired swap: " + swap.getId());
            }
            else {
                if (changed)
                    changedSwaps.push(swap);
            }
        }).catch(e => this.logger.error("_checkPastSwaps(): Error when checking swap " + swap.getId() + ": ", e))));
        return { changedSwaps, removeSwaps };
    }
    /**
     * Initializes the swap wrapper, needs to be called before any other action can be taken
     *
     * @param noTimers Whether to skip scheduling a tick timer for the swaps, if the tick timer is not initiated
     *  the swap states depending on e.g. expiry can be out of sync with the actual expiration of the swap
     * @param noCheckPastSwaps Whether to skip checking past swaps on initialization (by default all pending swaps
     *  are re-checked on init, and their state is synchronized from the on-chain data)
     */
    async init(noTimers = false, noCheckPastSwaps = false) {
        if (this.isInitialized)
            return;
        if (!noCheckPastSwaps) {
            //Save events received in the meantime into the event queue and process them only after we've checked and
            // processed all the past swaps
            let eventQueue = [];
            const initListener = (event, swap) => {
                eventQueue.push({ event, swap });
                return Promise.resolve();
            };
            if (this.processEvent != null)
                this.unifiedChainEvents.registerListener(this.TYPE, initListener, this._swapDeserializer.bind(null, this));
            await this.checkPastSwaps();
            if (this.processEvent != null) {
                //Process accumulated event queue
                for (let event of eventQueue) {
                    await this.processEvent(event.event, event.swap);
                }
                //Unregister the temporary event handler
                this.unifiedChainEvents.unregisterListener(this.TYPE);
            }
        }
        if (this.processEvent != null)
            this.unifiedChainEvents.registerListener(this.TYPE, this.processEvent.bind(this), this._swapDeserializer.bind(null, this));
        this.isInitialized = true;
        if (!noTimers)
            this.startTickInterval();
        // this.logger.info("init(): Swap wrapper initialized");
    }
    /**
     * Un-subscribes from event listeners on the smart chain, terminates the tick interval and stops this wrapper
     */
    async stop() {
        this.isInitialized = false;
        this.unifiedChainEvents.unregisterListener(this.TYPE);
        this.logger.info("stop(): Swap wrapper stopped");
        if (this.tickInterval != null) {
            clearTimeout(this.tickInterval);
            delete this.tickInterval;
        }
        if (this.tickAbortController != null) {
            this.tickAbortController.abort("Wrapper instance stopped!");
            delete this.tickAbortController;
        }
    }
    /**
     * Runs checks on all the known pending swaps, syncing their state from on-chain data
     *
     * @param pastSwaps Optional array of past swaps to check, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     * @param noSave Whether to skip saving the swap changes in the persistent storage
     */
    async checkPastSwaps(pastSwaps, noSave) {
        if (pastSwaps == null)
            pastSwaps = await this.unifiedStorage.query([[{ key: "type", value: this.TYPE }, { key: "state", value: this._pendingSwapStates }]], (val) => new this._swapDeserializer(this, val));
        const maxParallelSyncs = this._options.maxParallelSwapSyncs ?? exports.DEFAULT_MAX_PARALLEL_SWAP_SYNCS;
        const totalRemoveSwaps = [];
        const totalChangedSwaps = [];
        for (let i = 0; i < pastSwaps.length; i += maxParallelSyncs) {
            const { removeSwaps, changedSwaps } = await this._checkPastSwaps(pastSwaps.slice(i, i + maxParallelSyncs));
            if (!noSave) {
                await this.unifiedStorage.removeAll(removeSwaps);
                await this.unifiedStorage.saveAll(changedSwaps);
                changedSwaps.forEach(swap => swap._emitEvent());
                removeSwaps.forEach(swap => swap._emitEvent());
            }
            totalRemoveSwaps.push(...removeSwaps);
            totalChangedSwaps.push(...changedSwaps);
        }
        return {
            removeSwaps: totalRemoveSwaps,
            changedSwaps: totalChangedSwaps
        };
    }
    /**
     * Invokes {@link ISwap._tick} on all the known swaps
     *
     * @param swaps Optional array of swaps to invoke `_tick()` on, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     * @param abortSignal Abort signal
     */
    async tick(swaps, abortSignal) {
        if (swaps == null)
            swaps = await this.unifiedStorage.query([[{ key: "type", value: this.TYPE }, { key: "state", value: this.tickSwapState }]], (val) => new this._swapDeserializer(this, val));
        abortSignal?.throwIfAborted();
        const parallelTicks = this._options.maxParallelSwapTicks ?? exports.DEFAULT_MAX_PARALLEL_SWAP_TICKS;
        let promises = [];
        for (let pendingSwap of this.pendingSwaps.values()) {
            const value = pendingSwap.deref();
            if (value != null)
                promises.push(value._tick(true).catch(e => {
                    this.logger.warn(`tick(): Error ticking swap ${value.getId()}: `, e);
                }));
            if (promises.length >= parallelTicks) {
                await Promise.all(promises);
                abortSignal?.throwIfAborted();
                promises = [];
            }
        }
        for (let value of swaps) {
            promises.push(value._tick(true).catch(e => {
                this.logger.warn(`tick(): Error ticking swap ${value.getId()}: `, e);
            }));
            if (promises.length >= parallelTicks) {
                await Promise.all(promises);
                abortSignal?.throwIfAborted();
                promises = [];
            }
        }
        if (promises.length > 0)
            await Promise.all(promises);
        abortSignal?.throwIfAborted();
    }
    /**
     * Returns the smart chain's native token used to pay for fees
     * @internal
     */
    _getNativeToken() {
        return this._tokens[this._chain.getNativeCurrencyAddress()];
    }
    /**
     * Saves the swap, if it is not initiated it is only saved to pending swaps
     *
     * @param swap Swap to save
     *
     * @internal
     */
    _saveSwapData(swap) {
        if (!swap.isInitiated()) {
            this.logger.debug("saveSwapData(): Swap " + swap.getId() + " not initiated, saving to pending swaps");
            this.pendingSwaps.set(swap.getId(), new WeakRef(swap));
            return Promise.resolve();
        }
        else {
            this.pendingSwaps.delete(swap.getId());
        }
        return this.unifiedStorage.save(swap);
    }
    /**
     * Removes the swap from the persistent storage and pending swaps
     *
     * @param swap Swap to remove
     *
     * @internal
     */
    _removeSwapData(swap) {
        this.pendingSwaps.delete(swap.getId());
        if (!swap.isInitiated())
            return Promise.resolve();
        return this.unifiedStorage.remove(swap);
    }
    /**
     * Retrieves a swap by its ID from the pending swap mapping
     *
     * @param id
     *
     * @internal
     */
    _getPendingSwap(id) {
        return this.pendingSwaps.get(id)?.deref() ?? null;
    }
    /**
     * @internal
     */
    async _getSignerAddress(signer) {
        let address = undefined;
        if (signer != null) {
            if (typeof (signer) === "string") {
                address = signer;
            }
            else if ((0, base_1.isAbstractSigner)(signer)) {
                address = signer.getAddress();
            }
            else {
                address = (await this._chain.wrapSigner(signer)).getAddress();
            }
        }
        return address;
    }
}
exports.ISwapWrapper = ISwapWrapper;
