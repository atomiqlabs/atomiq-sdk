import {ChainEvent, ChainType} from "@atomiqlabs/base";
import {EventEmitter} from "events";
import {ISwap} from "./ISwap";
import {ISwapPrice} from "../prices/abstract/ISwapPrice";
import {IntermediaryError} from "../errors/IntermediaryError";
import {ChainIds, MultiChain} from "../swapper/Swapper";
import {UnifiedSwapEventListener} from "../events/UnifiedSwapEventListener";
import {SwapType} from "../enums/SwapType";
import {UnifiedSwapStorage} from "../storage/UnifiedSwapStorage";
import {SCToken} from "../types/Token";
import {getLogger} from "../utils/Logger";
import {PriceInfoType} from "../types/PriceInfoType";

/**
 * Options for swap wrapper configuration
 *
 * @category Swaps
 */
export type ISwapWrapperOptions = {
    getRequestTimeout?: number,
    postRequestTimeout?: number
};

/**
 * Token configuration for wrapper constructors
 *
 * @category Swaps
 */
export type WrapperCtorTokens<T extends MultiChain = MultiChain> = {
    ticker: string,
    name: string,
    chains: {[chainId in ChainIds<T>]?: {
        address: string,
        decimals: number,
        displayDecimals?: number
    }}
}[];

/**
 * Type definition linking wrapper and swap types
 *
 * @category Swaps
 */
export type SwapTypeDefinition<T extends ChainType, W extends ISwapWrapper<T, any>, S extends ISwap<T>> = {
    Wrapper: W;
    Swap: S;
};

/**
 * Base abstract class for swap handler implementations
 *
 * @category Swaps
 */
export abstract class ISwapWrapper<
    T extends ChainType,
    D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D>>,
    O extends ISwapWrapperOptions = ISwapWrapperOptions
> {
    /**
     * Swap type
     */
    abstract readonly TYPE: SwapType;
    protected readonly logger = getLogger(this.constructor.name+": ");

    /**
     * Function for deserializing swaps
     */
    public readonly abstract swapDeserializer: new (wrapper: D["Wrapper"], data: any) => D["Swap"];

    /**
     * Persistent storage backend for the swaps
     */
    readonly unifiedStorage: UnifiedSwapStorage<T>;
    /**
     * Smart chain events listener for listening to and parsing of on-chain events
     */
    readonly unifiedChainEvents: UnifiedSwapEventListener<T>;

    /**
     * Chain identifier string of this wrapper
     */
    readonly chainIdentifier: T["ChainId"];
    /**
     * Chain interface of the underlying smart chain
     */
    readonly chain: T["ChainInterface"];
    /**
     * Pricing API
     */
    readonly prices: ISwapPrice;
    /**
     * Event emitter emitting `"swapState"` event when swap's state changes
     */
    readonly events: EventEmitter<{swapState: [D["Swap"]]}>;
    /**
     * Wrapper options
     */
    readonly options: O;
    /**
     * Tokens indexed by their token address
     */
    readonly tokens: {
        [tokenAddress: string]: SCToken<T["ChainId"]>
    };
    /**
     * In-memory mapping of pending (not initiated) swaps, utilizing weak references to automatically
     *  free memory when swaps are dereferenced in not initiated state
     */
    readonly pendingSwaps: Map<string, WeakRef<D["Swap"]>> = new Map();

    /**
     * Whether this wrapper is initialized (have to call {@link init} to initialize a wrapper)
     */
    isInitialized: boolean = false;
    /**
     * An interval for calling tick functions on the underlying swaps
     */
    tickInterval?: NodeJS.Timeout;

    constructor(
        chainIdentifier: T["ChainId"],
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        options: O,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        this.unifiedStorage = unifiedStorage;
        this.unifiedChainEvents = unifiedChainEvents;

        this.chainIdentifier = chainIdentifier;
        this.chain = chain;
        this.prices = prices;
        this.events = events || new EventEmitter();
        this.options = options;
        this.tokens = {};
        for(let tokenData of tokens) {
            const chainData = tokenData.chains[chainIdentifier];
            if(chainData==null) continue;
            this.tokens[chainData.address] = {
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
     * @protected
     * @returns Price of the token in uSats (micro sats)
     */
    protected preFetchPrice(amountData: { token: string }, abortSignal?: AbortSignal): Promise<bigint | undefined> {
        return this.prices.preFetchPrice(this.chainIdentifier, amountData.token, abortSignal).catch(e => {
            this.logger.error("preFetchPrice.token(): Error: ", e);
            return undefined;
        });
    }

    /**
     * Pre-fetches bitcoin's USD price
     *
     * @param abortSignal Abort signal
     * @protected
     */
    protected preFetchUsdPrice(abortSignal?: AbortSignal): Promise<number | undefined> {
        return this.prices.preFetchUsdPrice(abortSignal).catch(e => {
            this.logger.error("preFetchPrice.usd(): Error: ", e);
            return undefined;
        })
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
     * @protected
     * @returns Price info object
     * @throws {IntermediaryError} if the calculated fee is too high
     */
    protected async verifyReturnedPrice(
        lpServiceData: {swapBaseFee: number, swapFeePPM: number},
        send: boolean,
        amountSats: bigint,
        amountToken: bigint,
        token: string,
        feeData: {
            networkFee?: bigint
        },
        pricePrefetchPromise: Promise<bigint | undefined> = Promise.resolve(undefined),
        usdPricePrefetchPromise: Promise<number | undefined> = Promise.resolve(undefined),
        abortSignal?: AbortSignal
    ): Promise<PriceInfoType> {
        const swapBaseFee = BigInt(lpServiceData.swapBaseFee);
        const swapFeePPM = BigInt(lpServiceData.swapFeePPM);
        if(send && feeData.networkFee!=null) amountToken = amountToken - feeData.networkFee;

        const [isValidAmount, usdPrice] = await Promise.all([
            send ?
                this.prices.isValidAmountSend(this.chainIdentifier, amountSats, swapBaseFee, swapFeePPM, amountToken, token, abortSignal, await pricePrefetchPromise) :
                this.prices.isValidAmountReceive(this.chainIdentifier, amountSats, swapBaseFee, swapFeePPM, amountToken, token, abortSignal, await pricePrefetchPromise),
            usdPricePrefetchPromise.then(value => {
                if(value!=null) return value;
                return this.prices.preFetchUsdPrice(abortSignal);
            })
        ]);
        if(!isValidAmount.isValid) throw new IntermediaryError("Fee too high");
        isValidAmount.realPriceUsdPerBitcoin = usdPrice;

        return isValidAmount;
    }

    /**
     * States of the swaps in pending (non-final state), these are checked automatically on initial swap synchronization
     */
    public abstract readonly pendingSwapStates: Array<D["Swap"]["state"]>;
    /**
     * States of the swaps where {@link ISwap._tick} should be called every second
     */
    public abstract readonly tickSwapState?: Array<D["Swap"]["state"]>;

    /**
     * Processes a single smart chain on-chain event
     *
     * @param event Smart chain event to process
     * @param swap A swap related to the event
     * @private
     */
    protected abstract processEvent?(event: ChainEvent<T["Data"]>, swap: D["Swap"]): Promise<void>;

    /**
     * Initializes the swap wrapper, needs to be called before any other action can be taken
     *
     * @param noTimers Whether to skip scheduling a tick timer for the swaps, if the tick timer is not initiated
     *  the swap states depending on e.g. expiry can be out of sync with the actual expiration of the swap
     * @param noCheckPastSwaps Whether to skip checking past swaps on initialization (by default all pending swaps
     *  are re-checked on init, and their state is synchronized from the on-chain data)
     */
    public async init(noTimers: boolean = false, noCheckPastSwaps: boolean = false): Promise<void> {
        if(this.isInitialized) return;

        if(!noCheckPastSwaps) {
            //Save events received in the meantime into the event queue and process them only after we've checked and
            // processed all the past swaps
            let eventQueue: {
                event: ChainEvent<T["Data"]>,
                swap: D["Swap"]
            }[] = [];
            const initListener = (event: ChainEvent<T["Data"]>, swap: D["Swap"]) => {
                eventQueue.push({event, swap});
                return Promise.resolve();
            }
            if(this.processEvent!=null) this.unifiedChainEvents.registerListener(this.TYPE, initListener, this.swapDeserializer.bind(null, this));

            await this.checkPastSwaps();

            if(this.processEvent!=null) {
                //Process accumulated event queue
                for(let event of eventQueue) {
                    await this.processEvent(event.event, event.swap);
                }

                //Unregister the temporary event handler
                this.unifiedChainEvents.unregisterListener(this.TYPE);
            }
        }

        if(this.processEvent!=null) this.unifiedChainEvents.registerListener(this.TYPE, this.processEvent.bind(this), this.swapDeserializer.bind(null, this));

        if(!noTimers) this.startTickInterval();

        // this.logger.info("init(): Swap wrapper initialized");

        this.isInitialized = true;
    }

    /**
     * Starts the interval calling the {@link ISwap._tick} on all the known swaps in tick-enabled states
     * @protected
     */
    protected startTickInterval(): void {
        if(this.tickSwapState==null || this.tickSwapState.length===0) return;
        this.tickInterval = setInterval(() => {
            this.tick();
        }, 1000);
    }

    /**
     * Runs checks on passed swaps, syncing their state from on-chain data
     *
     * @param pastSwaps Swaps to check
     * @protected
     */
    protected async _checkPastSwaps(pastSwaps: D["Swap"][]): Promise<{changedSwaps: D["Swap"][], removeSwaps: D["Swap"][]}> {
        const changedSwaps: D["Swap"][] = [];
        const removeSwaps: D["Swap"][] = [];

        await Promise.all(pastSwaps.map((swap: D["Swap"]) =>
            swap._sync(false).then(changed => {
                if(swap.isQuoteExpired()) {
                    removeSwaps.push(swap);
                    this.logger.debug("_checkPastSwaps(): Removing expired swap: "+swap.getId());
                } else {
                    if(changed) changedSwaps.push(swap);
                }
            }).catch(e => this.logger.error("_checkPastSwaps(): Error when checking swap "+swap.getId()+": ", e))
        ));

        return {changedSwaps, removeSwaps};
    }

    /**
     * Runs checks on all the known pending swaps, syncing their state from on-chain data
     *
     * @param pastSwaps Optional array of past swaps to check, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     * @param noSave Whether to skip saving the swap changes in the persistent storage
     */
    async checkPastSwaps(pastSwaps?: D["Swap"][], noSave?: boolean): Promise<{ removeSwaps: D["Swap"][], changedSwaps: D["Swap"][] }> {
        if (pastSwaps == null) pastSwaps = await this.unifiedStorage.query<D["Swap"]>(
            [[{key: "type", value: this.TYPE}, {key: "state", value: this.pendingSwapStates}]],
            (val: any) => new this.swapDeserializer(this, val)
        );

        const {removeSwaps, changedSwaps} = await this._checkPastSwaps(pastSwaps);

        if (!noSave) {
            await this.unifiedStorage.removeAll(removeSwaps);
            await this.unifiedStorage.saveAll(changedSwaps);
            changedSwaps.forEach(swap => swap._emitEvent());
            removeSwaps.forEach(swap => swap._emitEvent());
        }

        return {
            removeSwaps,
            changedSwaps
        }
    }

    /**
     * Invokes {@link ISwap._tick} on all the known swaps
     *
     * @param swaps Optional array of swaps to invoke `_tick()` on, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     */
    async tick(swaps?: D["Swap"][]): Promise<void> {
        if(swaps==null) swaps = await this.unifiedStorage.query<D["Swap"]>(
            [[{key: "type", value: this.TYPE}, {key: "state", value: this.tickSwapState}]],
            (val: any) => new this.swapDeserializer(this, val)
        );

        for(let pendingSwap of this.pendingSwaps.values()) {
            const value = pendingSwap.deref();
            if(value != null) value._tick(true);
        }

        swaps.forEach(value => {
            value._tick(true)
        });
    }

    /**
     * Saves the swap, if it is not initiated it is only saved to pending swaps
     *
     * @param swap Swap to save
     *
     * @internal
     */
    _saveSwapData(swap: D["Swap"]): Promise<void> {
        if(!swap.isInitiated()) {
            this.logger.debug("saveSwapData(): Swap "+swap.getId()+" not initiated, saving to pending swaps");
            this.pendingSwaps.set(swap.getId(), new WeakRef<D["Swap"]>(swap));
            return Promise.resolve();
        } else {
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
    _removeSwapData(swap: D["Swap"]): Promise<void> {
        this.pendingSwaps.delete(swap.getId());
        if(!swap.isInitiated()) return Promise.resolve();
        return this.unifiedStorage.remove(swap);
    }

    /**
     * Un-subscribes from event listeners on the smart chain, terminates the tick interval and stops this wrapper
     */
    public async stop() {
        this.isInitialized = false;
        this.unifiedChainEvents.unregisterListener(this.TYPE);
        this.logger.info("stop(): Swap wrapper stopped");
        if(this.tickInterval!=null) clearInterval(this.tickInterval);
    }

    /**
     * Returns the smart chain's native token used to pay for fees
     */
    public getNativeToken(): SCToken<T["ChainId"]> {
        return this.tokens[this.chain.getNativeCurrencyAddress()];
    }

}