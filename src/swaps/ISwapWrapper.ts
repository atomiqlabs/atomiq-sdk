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

export type ISwapWrapperOptions = {
    getRequestTimeout?: number,
    postRequestTimeout?: number
};

export type WrapperCtorTokens<T extends MultiChain = MultiChain> = {
    ticker: string,
    name: string,
    chains: {[chainId in ChainIds<T>]?: {
        address: string,
        decimals: number,
        displayDecimals?: number
    }}
}[];

export type SwapTypeDefinition<T extends ChainType, W extends ISwapWrapper<T, any>, S extends ISwap<T>> = {
    Wrapper: W;
    Swap: S;
};

export abstract class ISwapWrapper<
    T extends ChainType,
    D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D>>,
    O extends ISwapWrapperOptions = ISwapWrapperOptions
> {
    abstract readonly TYPE: SwapType;
    protected readonly logger = getLogger(this.constructor.name+": ");

    public readonly abstract swapDeserializer: new (wrapper: D["Wrapper"], data: any) => D["Swap"];

    readonly unifiedStorage: UnifiedSwapStorage<T>;
    readonly unifiedChainEvents: UnifiedSwapEventListener<T>;

    readonly chainIdentifier: T["ChainId"];
    readonly chain: T["ChainInterface"];
    readonly prices: ISwapPrice;
    readonly events: EventEmitter<{swapState: [D["Swap"]]}>;
    readonly options: O;
    readonly tokens: {
        [tokenAddress: string]: SCToken<T["ChainId"]>
    };
    readonly pendingSwaps: Map<string, WeakRef<D["Swap"]>> = new Map();

    isInitialized: boolean = false;
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
     * @param amountData
     * @param abortSignal
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
     * @param abortSignal
     * @protected
     */
    protected preFetchUsdPrice(abortSignal?: AbortSignal): Promise<number | undefined> {
        return this.prices.preFetchUsdPrice(abortSignal).catch(e => {
            this.logger.error("preFetchPrice.usd(): Error: ", e);
            return undefined;
        })
    }

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

    public abstract readonly pendingSwapStates: Array<D["Swap"]["state"]>;
    public abstract readonly tickSwapState?: Array<D["Swap"]["state"]>;

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

    protected startTickInterval(): void {
        if(this.tickSwapState==null || this.tickSwapState.length===0) return;
        this.tickInterval = setInterval(() => {
            this.tick();
        }, 1000);
    }

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

    async checkPastSwaps(pastSwaps?: D["Swap"][], noSave?: boolean): Promise<{ removeSwaps: D["Swap"][], changedSwaps: D["Swap"][] }> {
        if (pastSwaps == null) pastSwaps = await this.unifiedStorage.query<D["Swap"]>(
            [[{key: "type", value: this.TYPE}, {key: "state", value: this.pendingSwapStates}]],
            (val: any) => new this.swapDeserializer(this, val)
        );

        const {removeSwaps, changedSwaps} = await this._checkPastSwaps(pastSwaps);

        if (!noSave) {
            await this.unifiedStorage.removeAll(removeSwaps);
            await this.unifiedStorage.saveAll(changedSwaps);
        }

        return {
            removeSwaps,
            changedSwaps
        }
    }

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

    saveSwapData(swap: D["Swap"]): Promise<void> {
        if(!swap.isInitiated()) {
            this.logger.debug("saveSwapData(): Swap "+swap.getId()+" not initiated, saving to pending swaps");
            this.pendingSwaps.set(swap.getId(), new WeakRef<D["Swap"]>(swap));
            return Promise.resolve();
        } else {
            this.pendingSwaps.delete(swap.getId());
        }
        return this.unifiedStorage.save(swap);
    }

    removeSwapData(swap: D["Swap"]): Promise<void> {
        this.pendingSwaps.delete(swap.getId());
        if(!swap.isInitiated()) return Promise.resolve();
        return this.unifiedStorage.remove(swap);
    }

    /**
     * Un-subscribes from event listeners on Solana
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