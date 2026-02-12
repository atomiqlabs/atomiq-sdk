/// <reference types="node" />
/// <reference types="node" />
import { ChainEvent, ChainType } from "@atomiqlabs/base";
import { EventEmitter } from "events";
import { ISwap } from "./ISwap";
import { ISwapPrice } from "../prices/abstract/ISwapPrice";
import { ChainIds, MultiChain } from "../swapper/Swapper";
import { UnifiedSwapEventListener } from "../events/UnifiedSwapEventListener";
import { SwapType } from "../enums/SwapType";
import { UnifiedSwapStorage } from "../storage/UnifiedSwapStorage";
import { SCToken } from "../types/Token";
import { PriceInfoType } from "../types/PriceInfoType";
/**
 * Options for swap wrapper configuration
 *
 * @category Swaps
 */
export type ISwapWrapperOptions = {
    getRequestTimeout?: number;
    postRequestTimeout?: number;
};
/**
 * Token configuration for wrapper constructors
 *
 * @category Swaps
 */
export type WrapperCtorTokens<T extends MultiChain = MultiChain> = {
    ticker: string;
    name: string;
    chains: {
        [chainId in ChainIds<T>]?: {
            address: string;
            decimals: number;
            displayDecimals?: number;
        };
    };
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
export declare abstract class ISwapWrapper<T extends ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D>>, O extends ISwapWrapperOptions = ISwapWrapperOptions> {
    /**
     * Swap type
     */
    abstract readonly TYPE: SwapType;
    /**
     * Function for deserializing swaps
     * @internal
     */
    abstract readonly _swapDeserializer: new (wrapper: D["Wrapper"], data: any) => D["Swap"];
    /**
     * Logger instance
     * @internal
     */
    protected readonly logger: import("../utils/Logger").LoggerType;
    /**
     * Persistent storage backend for the swaps
     * @internal
     */
    protected readonly unifiedStorage: UnifiedSwapStorage<T>;
    /**
     * Smart chain events listener for listening to and parsing of on-chain events
     * @internal
     */
    protected readonly unifiedChainEvents: UnifiedSwapEventListener<T>;
    /**
     * States of the swaps where {@link ISwap._tick} should be called every second
     * @internal
     */
    protected readonly tickSwapState?: Array<D["Swap"]["_state"]>;
    /**
     * In-memory mapping of pending (not initiated) swaps, utilizing weak references to automatically
     *  free memory when swaps are dereferenced in not initiated state
     * @internal
     */
    protected readonly pendingSwaps: Map<string, WeakRef<D["Swap"]>>;
    /**
     * Whether this wrapper is initialized (have to call {@link init} to initialize a wrapper)
     * @internal
     */
    protected isInitialized: boolean;
    /**
     * An interval for calling tick functions on the underlying swaps
     * @internal
     */
    protected tickInterval?: NodeJS.Timeout;
    /**
     * States of the swaps in pending (non-final state), these are checked automatically on initial swap synchronization
     * @internal
     */
    abstract readonly _pendingSwapStates: Array<D["Swap"]["_state"]>;
    /**
     * Chain interface of the underlying smart chain
     * @internal
     */
    readonly _chain: T["ChainInterface"];
    /**
     * Pricing API
     * @internal
     */
    readonly _prices: ISwapPrice;
    /**
     * Wrapper options
     * @internal
     */
    readonly _options: O;
    /**
     * Tokens indexed by their token address
     * @internal
     */
    readonly _tokens: {
        [tokenAddress: string]: SCToken<T["ChainId"]>;
    };
    /**
     * Chain identifier string of this wrapper
     */
    readonly chainIdentifier: T["ChainId"];
    /**
     * Event emitter emitting `"swapState"` event when swap's state changes
     */
    readonly events: EventEmitter<{
        swapState: [D["Swap"]];
    }>;
    constructor(chainIdentifier: T["ChainId"], unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], prices: ISwapPrice, tokens: WrapperCtorTokens, options: O, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * Pre-fetches swap price for a given swap
     *
     * @param amountData Amount data
     * @param abortSignal Abort signal
     * @returns Price of the token in uSats (micro sats)
     * @internal
     */
    protected preFetchPrice(amountData: {
        token: string;
    }, abortSignal?: AbortSignal): Promise<bigint | undefined>;
    /**
     * Pre-fetches bitcoin's USD price
     *
     * @param abortSignal Abort signal
     * @internal
     */
    protected preFetchUsdPrice(abortSignal?: AbortSignal): Promise<number | undefined>;
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
    protected verifyReturnedPrice(lpServiceData: {
        swapBaseFee: number;
        swapFeePPM: number;
    }, send: boolean, amountSats: bigint, amountToken: bigint, token: string, feeData: {
        networkFee?: bigint;
    }, pricePrefetchPromise?: Promise<bigint | undefined>, usdPricePrefetchPromise?: Promise<number | undefined>, abortSignal?: AbortSignal): Promise<PriceInfoType>;
    /**
     * Processes a single smart chain on-chain event
     *
     * @param event Smart chain event to process
     * @param swap A swap related to the event
     * @internal
     */
    protected abstract processEvent?(event: ChainEvent<T["Data"]>, swap: D["Swap"]): Promise<void>;
    /**
     * Starts the interval calling the {@link ISwap._tick} on all the known swaps in tick-enabled states
     * @internal
     */
    protected startTickInterval(): void;
    /**
     * Runs checks on passed swaps, syncing their state from on-chain data
     *
     * @param pastSwaps Swaps to check
     * @internal
     */
    protected _checkPastSwaps(pastSwaps: D["Swap"][]): Promise<{
        changedSwaps: D["Swap"][];
        removeSwaps: D["Swap"][];
    }>;
    /**
     * Initializes the swap wrapper, needs to be called before any other action can be taken
     *
     * @param noTimers Whether to skip scheduling a tick timer for the swaps, if the tick timer is not initiated
     *  the swap states depending on e.g. expiry can be out of sync with the actual expiration of the swap
     * @param noCheckPastSwaps Whether to skip checking past swaps on initialization (by default all pending swaps
     *  are re-checked on init, and their state is synchronized from the on-chain data)
     */
    init(noTimers?: boolean, noCheckPastSwaps?: boolean): Promise<void>;
    /**
     * Un-subscribes from event listeners on the smart chain, terminates the tick interval and stops this wrapper
     */
    stop(): Promise<void>;
    /**
     * Runs checks on all the known pending swaps, syncing their state from on-chain data
     *
     * @param pastSwaps Optional array of past swaps to check, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     * @param noSave Whether to skip saving the swap changes in the persistent storage
     */
    checkPastSwaps(pastSwaps?: D["Swap"][], noSave?: boolean): Promise<{
        removeSwaps: D["Swap"][];
        changedSwaps: D["Swap"][];
    }>;
    /**
     * Invokes {@link ISwap._tick} on all the known swaps
     *
     * @param swaps Optional array of swaps to invoke `_tick()` on, otherwise all relevant swaps will be fetched
     *  from the persistent storage
     */
    tick(swaps?: D["Swap"][]): Promise<void>;
    /**
     * Returns the smart chain's native token used to pay for fees
     * @internal
     */
    _getNativeToken(): SCToken<T["ChainId"]>;
    /**
     * Saves the swap, if it is not initiated it is only saved to pending swaps
     *
     * @param swap Swap to save
     *
     * @internal
     */
    _saveSwapData(swap: D["Swap"]): Promise<void>;
    /**
     * Removes the swap from the persistent storage and pending swaps
     *
     * @param swap Swap to remove
     *
     * @internal
     */
    _removeSwapData(swap: D["Swap"]): Promise<void>;
    /**
     * Retrieves a swap by its ID from the pending swap mapping
     *
     * @param id
     *
     * @internal
     */
    _getPendingSwap(id: string): D["Swap"] | null;
}
