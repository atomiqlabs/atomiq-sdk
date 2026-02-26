"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ISwapWrapper = void 0;
const events_1 = require("events");
const IntermediaryError_1 = require("../errors/IntermediaryError");
const Logger_1 = require("../utils/Logger");
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
        this.unifiedStorage = unifiedStorage;
        this.unifiedChainEvents = unifiedChainEvents;
        this.chainIdentifier = chainIdentifier;
        this._chain = chain;
        this._prices = prices;
        this.events = events || new events_1.EventEmitter();
        this._options = options;
        this._tokens = {};
        for (let tokenData of tokens) {
            const chainData = tokenData.chains[chainIdentifier];
            if (chainData == null)
                continue;
            this._tokens[chainData.address] = {
                chain: "SC",
                chainId: this.chainIdentifier,
                address: chainData.address,
                decimals: chainData.decimals,
                ticker: tokenData.ticker,
                name: tokenData.name,
                displayDecimals: chainData.displayDecimals
            };
        }
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
        this.tickInterval = setInterval(() => {
            this.tick();
        }, 1000);
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
     * Runs {@link ISwap._tick} on passed swaps
     *
     * @param swaps Swaps to run the tick for
     * @internal
     */
    async _tick(swaps) {
        await Promise.all(swaps.map(value => value._tick(true)));
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
        if (!noTimers)
            this.startTickInterval();
        // this.logger.info("init(): Swap wrapper initialized");
        this.isInitialized = true;
    }
    /**
     * Un-subscribes from event listeners on the smart chain, terminates the tick interval and stops this wrapper
     */
    async stop() {
        this.isInitialized = false;
        this.unifiedChainEvents.unregisterListener(this.TYPE);
        this.logger.info("stop(): Swap wrapper stopped");
        if (this.tickInterval != null)
            clearInterval(this.tickInterval);
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
        const { removeSwaps, changedSwaps } = await this._checkPastSwaps(pastSwaps);
        if (!noSave) {
            await this.unifiedStorage.removeAll(removeSwaps);
            await this.unifiedStorage.saveAll(changedSwaps);
            changedSwaps.forEach(swap => swap._emitEvent());
            removeSwaps.forEach(swap => swap._emitEvent());
        }
        return {
            removeSwaps,
            changedSwaps
        };
    }
    /**
     * Invokes {@link ISwap._tick} on all the known swaps
     *
     * @param swaps Optional array of swaps to invoke `_tick()` on, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     */
    async tick(swaps) {
        if (swaps == null)
            swaps = await this.unifiedStorage.query([[{ key: "type", value: this.TYPE }, { key: "state", value: this.tickSwapState }]], (val) => new this._swapDeserializer(this, val));
        const pendingSwaps = [];
        for (let pendingSwap of this.pendingSwaps.values()) {
            const value = pendingSwap.deref();
            if (value == null)
                continue;
            pendingSwaps.push(value);
        }
        await this._tick(swaps.concat(pendingSwaps));
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
}
exports.ISwapWrapper = ISwapWrapper;
