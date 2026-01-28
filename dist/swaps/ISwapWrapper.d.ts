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
 * @category Swaps
 */
export type ISwapWrapperOptions = {
    getRequestTimeout?: number;
    postRequestTimeout?: number;
};
/**
 * Token configuration for wrapper constructors
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
 * @category Swaps
 */
export type SwapTypeDefinition<T extends ChainType, W extends ISwapWrapper<T, any>, S extends ISwap<T>> = {
    Wrapper: W;
    Swap: S;
};
/**
 * Base abstract class for swap wrapper implementations
 * @category Swaps
 */
export declare abstract class ISwapWrapper<T extends ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D>>, O extends ISwapWrapperOptions = ISwapWrapperOptions> {
    abstract readonly TYPE: SwapType;
    protected readonly logger: import("../utils/Logger").LoggerType;
    abstract readonly swapDeserializer: new (wrapper: D["Wrapper"], data: any) => D["Swap"];
    readonly unifiedStorage: UnifiedSwapStorage<T>;
    readonly unifiedChainEvents: UnifiedSwapEventListener<T>;
    readonly chainIdentifier: T["ChainId"];
    readonly chain: T["ChainInterface"];
    readonly prices: ISwapPrice;
    readonly events: EventEmitter<{
        swapState: [D["Swap"]];
    }>;
    readonly options: O;
    readonly tokens: {
        [tokenAddress: string]: SCToken<T["ChainId"]>;
    };
    readonly pendingSwaps: Map<string, WeakRef<D["Swap"]>>;
    isInitialized: boolean;
    tickInterval?: NodeJS.Timeout;
    /**
     * @param chainIdentifier
     * @param unifiedStorage
     * @param unifiedChainEvents
     * @param chain
     * @param prices Swap pricing handler
     * @param tokens Chain specific token data
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: T["ChainId"], unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], prices: ISwapPrice, tokens: WrapperCtorTokens, options: O, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * Pre-fetches swap price for a given swap
     *
     * @param amountData
     * @param abortSignal
     * @protected
     * @returns Price of the token in uSats (micro sats)
     */
    protected preFetchPrice(amountData: {
        token: string;
    }, abortSignal?: AbortSignal): Promise<bigint | undefined>;
    /**
     * Pre-fetches bitcoin's USD price
     *
     * @param abortSignal
     * @protected
     */
    protected preFetchUsdPrice(abortSignal?: AbortSignal): Promise<number | undefined>;
    /**
     * Verifies returned  price for swaps
     *
     * @param lpServiceData Service data for the service in question (TO_BTCLN, TO_BTC, etc.) of the given intermediary
     * @param send Whether this is a send (SOL -> SC) or receive (BTC -> SC) swap
     * @param amountSats Amount in BTC
     * @param amountToken Amount in token
     * @param token Token used in the swap
     * @param feeData Fee data as returned by the intermediary
     * @param pricePrefetchPromise Price pre-fetch promise
     * @param usdPricePrefetchPromise
     * @param abortSignal
     * @protected
     * @returns Price info object
     * @throws {IntermediaryError} if the calculated fee is too high
     */
    protected verifyReturnedPrice(lpServiceData: {
        swapBaseFee: number;
        swapFeePPM: number;
    }, send: boolean, amountSats: bigint, amountToken: bigint, token: string, feeData: {
        networkFee?: bigint;
    }, pricePrefetchPromise?: Promise<bigint | undefined>, usdPricePrefetchPromise?: Promise<number | undefined>, abortSignal?: AbortSignal): Promise<PriceInfoType>;
    abstract readonly pendingSwapStates: Array<D["Swap"]["state"]>;
    abstract readonly tickSwapState?: Array<D["Swap"]["state"]>;
    /**
     * Processes a single SC on-chain event
     * @private
     * @param event
     * @param swap
     */
    protected abstract processEvent?(event: ChainEvent<T["Data"]>, swap: D["Swap"]): Promise<void>;
    /**
     * Initializes the swap wrapper, needs to be called before any other action can be taken
     */
    init(noTimers?: boolean, noCheckPastSwaps?: boolean): Promise<void>;
    protected startTickInterval(): void;
    protected _checkPastSwaps(pastSwaps: D["Swap"][]): Promise<{
        changedSwaps: D["Swap"][];
        removeSwaps: D["Swap"][];
    }>;
    checkPastSwaps(pastSwaps?: D["Swap"][], noSave?: boolean): Promise<{
        removeSwaps: D["Swap"][];
        changedSwaps: D["Swap"][];
    }>;
    tick(swaps?: D["Swap"][]): Promise<void>;
    saveSwapData(swap: D["Swap"]): Promise<void>;
    removeSwapData(swap: D["Swap"]): Promise<void>;
    /**
     * Un-subscribes from event listeners on Solana
     */
    stop(): Promise<void>;
    /**
     * Returns the smart chain's native token used to pay for fees
     */
    getNativeToken(): SCToken<T["ChainId"]>;
}
