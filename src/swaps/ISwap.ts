import {SwapType} from "../enums/SwapType";
import {EventEmitter} from "events";
import {ISwapWrapper, SwapTypeDefinition} from "./ISwapWrapper";
import {ChainType} from "@atomiqlabs/base";
import {randomBytes, toBigInt} from "../utils/Utils";
import {SwapDirection} from "../enums/SwapDirection";
import {Fee} from "../types/fees/Fee";
import {FeeBreakdown} from "../types/fees/FeeBreakdown";
import {PercentagePPM, ppmToPercentage} from "../types/fees/PercentagePPM";
import {TokenAmount} from "../types/TokenAmount";
import {isSCToken, Token} from "../types/Token";
import {SwapExecutionAction} from "../types/SwapExecutionAction";
import {LoggerType} from "../utils/Logger";
import {isPriceInfoType, PriceInfoType} from "../types/PriceInfoType";
import {SwapStateInfo} from "../types/SwapStateInfo";

/**
 * Initialization data for creating a swap
 *
 * @category Swaps/Base
 */
export type ISwapInit = {
    pricingInfo: PriceInfoType,
    url?: string,
    expiry: number,
    swapFee: bigint,
    swapFeeBtc: bigint,
    exactIn: boolean
};

/**
 * Type guard to check if an object is an ISwapInit
 *
 * @category Swaps/Base
 */
export function isISwapInit(obj: any): obj is ISwapInit {
    return typeof obj === 'object' &&
        obj != null &&
        isPriceInfoType(obj.pricingInfo) &&
        (obj.url==null || typeof obj.url === 'string') &&
        typeof obj.expiry === 'number' &&
        typeof(obj.swapFee) === "bigint" &&
        typeof(obj.swapFeeBtc) === "bigint" &&
        (typeof obj.exactIn === 'boolean');
}

/**
 * Base abstract class for all swap types
 *
 * @category Swaps/Base
 */
export abstract class ISwap<
    T extends ChainType = ChainType,
    D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, ISwap<T, any, any>>,
    S extends number = number
> {
    /**
     * Swap type
     */
    protected readonly abstract TYPE: SwapType;

    /**
     * Description for the states
     * @internal
     */
    protected readonly abstract swapStateDescription: Record<S, string>;
    /**
     * Name of the states
     * @internal
     */
    protected readonly abstract swapStateName: (state: number) => string;
    /**
     * Swap logger
     * @internal
     */
    protected readonly abstract logger: LoggerType;
    /**
     * Current newest defined version of the swap
     * @internal
     */
    protected readonly currentVersion: number = 1;
    /**
     * Wrapper instance holding this swap
     * @internal
     */
    protected readonly wrapper: D["Wrapper"];


    /**
     * The current version of the swap
     * @internal
     */
    protected version: number;
    /**
     * Whether a swap was initialized, a swap is considered initialize on first interaction with it, i.e.
     *  calling commit() on a Smart chain -> Bitcoin swaps, calling waitForPayment() or similar on the other
     *  direction. Not initiated swaps are not saved to the persistent storage by default (see
     *  {@link SwapperOptions.saveUninitializedSwaps})
     * @internal
     */
    protected initiated: boolean = false;
    /**
     * Expiration of the swap quote
     * @internal
     */
    protected expiry: number;
    /**
     * Pricing information of the swap
     * @internal
     */
    protected pricingInfo?: PriceInfoType;
    /**
     * Swap fee in the non-bitcoin token
     * @internal
     */
    protected swapFee: bigint;
    /**
     * Swap fee in bitcoin satoshis
     * @internal
     */
    protected swapFeeBtc: bigint;


    /**
     * Swap state
     * @internal
     */
    _state: S = 0 as S;
    /**
     * Random nonce to differentiate the swap from others with the same identifier hash (i.e. when quoting the same swap
     *  from multiple LPs)
     * @internal
     */
    _randomNonce: string;


    /**
     * Event emitter emitting `"swapState"` event when swap's state changes
     */
    readonly events: EventEmitter<{swapState: [D["Swap"]]}> = new EventEmitter();
    /**
     * URL of the intermediary (LP) used for this swap, already has the swap service specific path appended
     */
    readonly url?: string;
    /**
     * Smart chain identifier string corresponding to this swap
     */
    readonly chainIdentifier: T["ChainId"];
    /**
     * Whether a swap is an exact input swap
     */
    readonly exactIn: boolean;
    /**
     * A UNIX milliseconds timestamps of when this swap was created
     */
    createdAt: number;

    protected constructor(wrapper: D["Wrapper"], obj: any);
    protected constructor(wrapper: D["Wrapper"], swapInit: ISwapInit);
    protected constructor(
        wrapper: D["Wrapper"],
        swapInitOrObj: ISwapInit | any,
    ) {
        this.chainIdentifier = wrapper.chainIdentifier;
        this.wrapper = wrapper;
        if(isISwapInit(swapInitOrObj)) {
            this.pricingInfo = swapInitOrObj.pricingInfo;
            this.url = swapInitOrObj.url;
            this.expiry = swapInitOrObj.expiry;
            this.swapFee = swapInitOrObj.swapFee;
            this.swapFeeBtc = swapInitOrObj.swapFeeBtc;
            this.exactIn = swapInitOrObj.exactIn;
            this.version = this.currentVersion;
            this.createdAt = Date.now();
            this._randomNonce = randomBytes(16).toString("hex");
        } else {
            this.expiry = swapInitOrObj.expiry;
            this.url = swapInitOrObj.url;

            this._state = swapInitOrObj.state;

            if(
                swapInitOrObj._isValid!=null && swapInitOrObj._differencePPM!=null && swapInitOrObj._satsBaseFee!=null &&
                swapInitOrObj._feePPM!=null && swapInitOrObj._swapPriceUSatPerToken!=null
            ) {
                this.pricingInfo = {
                    isValid: swapInitOrObj._isValid,
                    differencePPM: BigInt(swapInitOrObj._differencePPM),
                    satsBaseFee: BigInt(swapInitOrObj._satsBaseFee),
                    feePPM: BigInt(swapInitOrObj._feePPM),
                    realPriceUSatPerToken: toBigInt(swapInitOrObj._realPriceUSatPerToken),
                    realPriceUsdPerBitcoin: swapInitOrObj._realPriceUsdPerBitcoin,
                    swapPriceUSatPerToken: BigInt(swapInitOrObj._swapPriceUSatPerToken),
                };
            }

            this.swapFee = toBigInt(swapInitOrObj.swapFee);
            this.swapFeeBtc = toBigInt(swapInitOrObj.swapFeeBtc);

            this.version = swapInitOrObj.version;
            this.initiated = swapInitOrObj.initiated;
            this.exactIn = swapInitOrObj.exactIn;
            this.createdAt = swapInitOrObj.createdAt ?? swapInitOrObj.expiry;

            this._randomNonce = swapInitOrObj.randomNonce;
        }
        if(this.version!==this.currentVersion) {
            this.upgradeVersion();
        }
        if(this.initiated==null) this.initiated = true;
    }

    /**
     * Called when swap is deserialized to potentially update the version of the data for the swap
     *
     * @internal
     */
    protected abstract upgradeVersion(): void;

    /**
     * Waits till the swap reaches a specific state
     *
     * @param targetState The state to wait for
     * @param type Whether to wait for the state exactly or also to a state with a higher number
     * @param abortSignal Abort signal
     * @internal
     */
    protected waitTillState(targetState: S, type: "eq" | "gte" | "neq" = "eq", abortSignal?: AbortSignal): Promise<void> {
        //TODO: This doesn't hold strong reference to the swap, hence if no other strong reference to the
        // swap exists, it will just never resolve!
        return new Promise((resolve, reject) => {
            let listener: () => void;
            listener = () => {
                if(type==="eq" ? this._state===targetState : type==="gte" ? this._state>=targetState : this._state!=targetState) {
                    resolve();
                    this.events.removeListener("swapState", listener);
                }
            };
            this.events.on("swapState", listener);
            if(abortSignal!=null) abortSignal.addEventListener("abort", () => {
                this.events.removeListener("swapState", listener);
                reject(abortSignal.reason);
            });
        });
    }

    /**
     * Returns a list of steps or transactions required to finish and settle the swap
     *
     * @param options Additional options for executing the swap
     */
    public abstract txsExecute(options?: any): Promise<SwapExecutionAction<T>[]>;

    //////////////////////////////
    //// Pricing

    /**
     * This attempts to populate missing fields in the pricing info based on the swap amounts
     *
     * @internal
     */
    protected tryRecomputeSwapPrice(): void {
        if(this.pricingInfo==null) return;
        if(this.pricingInfo.swapPriceUSatPerToken==null) {
            const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
            const input = this.getInput();
            const output = this.getOutput();
            if(input.isUnknown || output.isUnknown) return;
            if(isSCToken(input.token) && this.getDirection()===SwapDirection.TO_BTC) {
                this.pricingInfo = this.wrapper._prices.recomputePriceInfoSend(
                    this.chainIdentifier,
                    output.rawAmount!,
                    this.pricingInfo.satsBaseFee,
                    this.pricingInfo.feePPM,
                    input.rawAmount!,
                    input.token.address
                );
                this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
            } else if(isSCToken(output.token) && this.getDirection()===SwapDirection.FROM_BTC) {
                this.pricingInfo = this.wrapper._prices.recomputePriceInfoReceive(
                    this.chainIdentifier,
                    input.rawAmount!,
                    this.pricingInfo.satsBaseFee,
                    this.pricingInfo.feePPM,
                    output.rawAmount!,
                    output.token.address
                );
                this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
            }
        }
    }

    /**
     * Re-fetches & revalidates the price data based on the current market prices
     */
    public async refreshPriceData(): Promise<void> {
        if(this.pricingInfo==null) return;
        const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
        const input = this.getInput();
        const output = this.getOutput();
        if(input.isUnknown || output.isUnknown) return;

        if(isSCToken(input.token) && this.getDirection()===SwapDirection.TO_BTC) {
            this.pricingInfo = await this.wrapper._prices.isValidAmountSend(
                this.chainIdentifier,
                output.rawAmount!,
                this.pricingInfo.satsBaseFee,
                this.pricingInfo.feePPM,
                input.rawAmount!,
                input.token.address
            );
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        } else if(isSCToken(output.token) && this.getDirection()===SwapDirection.FROM_BTC) {
            this.pricingInfo = await this.wrapper._prices.isValidAmountReceive(
                this.chainIdentifier,
                input.rawAmount!,
                this.pricingInfo.satsBaseFee,
                this.pricingInfo.feePPM,
                output.rawAmount!,
                output.token.address
            );
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
    }

    /**
     * Checks if the pricing for the swap is valid, according to max allowed price difference set in the ISwapPrice
     */
    public hasValidPrice(): boolean {
        if(this.pricingInfo==null) throw new Error("Pricing info not found, cannot check price validity!");
        return this.pricingInfo.isValid;
    }

    /**
     * Returns pricing info about the swap
     */
    public getPriceInfo(): {
        marketPrice?: number,
        swapPrice: number,
        difference: PercentagePPM
    } {
        if(this.pricingInfo==null) throw new Error("Pricing info not provided and not known!");

        const swapPrice = this.getDirection()===SwapDirection.TO_BTC ?
            100_000_000_000_000/Number(this.pricingInfo.swapPriceUSatPerToken) :
            Number(this.pricingInfo.swapPriceUSatPerToken)/100_000_000_000_000;

        let marketPrice: number | undefined;
        if(this.pricingInfo.realPriceUSatPerToken!=null)
            marketPrice = this.getDirection()===SwapDirection.TO_BTC ?
                100_000_000_000_000/Number(this.pricingInfo.realPriceUSatPerToken) :
                Number(this.pricingInfo.realPriceUSatPerToken)/100_000_000_000_000;

        return {
            marketPrice,
            swapPrice,
            difference: ppmToPercentage(this.pricingInfo.differencePPM)
        }
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * Asserts a given signer is the initiator of this swap
     *
     * @param signer Signer to check with this swap's initiator
     * @throws {Error} When signer's address doesn't match with the swap's initiator one
     * @internal
     */
    protected checkSigner(signer: T["Signer"] | string): void {
        if((typeof(signer)==="string" ? signer : signer.getAddress())!==this._getInitiator()) throw new Error("Invalid signer provided!");
    }

    /**
     * Returns an escrow hash of the swap
     *
     * @internal
     */
    abstract _getEscrowHash(): string | null;

    /**
     * Checks if the swap's quote is expired for good (i.e. the swap strictly cannot be initiated anymore)
     * @internal
     */
    abstract _verifyQuoteDefinitelyExpired(): Promise<boolean>;

    /**
     * Checks if the swap's quote is still valid
     * @internal
     */
    abstract _verifyQuoteValid(): Promise<boolean>;

    /**
     * Returns the intiator address of the swap - address that created this swap
     * @internal
     */
    abstract _getInitiator(): string;

    /**
     * Sets this swap as initiated
     * @internal
     */
    _setInitiated(): void {
        this.initiated = true;
    }

    /**
     * Returns source address of the swap
     */
    public abstract getInputAddress(): string | null;

    /**
     * Returns destination address of the swap
     */
    public abstract getOutputAddress(): string | null;

    /**
     * Returns swap input transaction ID on the source chain
     */
    public abstract getInputTxId(): string | null;

    /**
     * Returns swap output transaction ID on the destination chain
     */
    public abstract getOutputTxId(): string | null;

    /**
     * Returns the ID of the swap, as used in the storage
     */
    public abstract getId(): string;

    /**
     * Checks whether there is some action required from the user for this swap - can mean either refundable or claimable
     */
    public abstract requiresAction(): boolean;

    /**
     * Returns whether the swap is finished and in its terminal state (this can mean successful, refunded or failed)
     */
    public abstract isFinished(): boolean;

    /**
     * Checks whether the swap's quote has definitely expired and cannot be committed anymore, we can remove such swap
     */
    public abstract isQuoteExpired(): boolean;

    /**
     * Checks whether the swap's quote is soft expired (this means there is not enough time buffer for it to commit,
     *  but it still can happen)
     */
    public abstract isQuoteSoftExpired(): boolean;

    /**
     * Returns whether the swap finished successful
     */
    public abstract isSuccessful(): boolean;

    /**
     * Returns whether the swap failed (e.g. was refunded)
     */
    public abstract isFailed(): boolean;

    /**
     * Whether a swap was initialized, a swap is considered initialized on first interaction with it, i.e.
     *  calling commit() on a Smart chain -> Bitcoin swaps, calling waitForPayment() or similar on the other
     *  direction. Not initiated swaps are not saved to the persistent storage by default (see
     *  {@link SwapperOptions.saveUninitializedSwaps})
     */
    public isInitiated(): boolean {
        return this.initiated;
    }

    /**
     * Returns quote expiry in UNIX millis
     */
    public getQuoteExpiry(): number {
        return this.expiry;
    }

    /**
     * Returns the type of the swap
     */
    public getType(): SwapType {
        return this.TYPE;
    }

    /**
     * Returns the direction of the swap
     */
    public getDirection(): SwapDirection {
        return this.TYPE===SwapType.TO_BTC || this.TYPE===SwapType.TO_BTCLN ? SwapDirection.TO_BTC : SwapDirection.FROM_BTC;
    }

    /**
     * Returns the current state of the swap
     */
    public getState(): S {
        return this._state;
    }

    /**
     * Returns the current state of the swap along with the human-readable description of the state
     */
    public getStateInfo(): SwapStateInfo<S> {
        return {
            state: this._state,
            name: this.swapStateName(this._state),
            description: this.swapStateDescription[this._state]
        }
    }

    /**
     * Returns a state-dependent set of actions for the user to execute, or empty array if there is currently
     *  no action required from the user to execute.
     */
    public abstract getCurrentActions(): Promise<SwapExecutionAction<T>[]>;

    //////////////////////////////
    //// Amounts & fees

    /**
     * Returns output amount of the swap, user receives this much
     */
    public abstract getOutput(): TokenAmount;

    /**
     * Returns the output token of the swap
     */
    public abstract getOutputToken(): Token<T["ChainId"]>;

    /**
     * Returns input amount of the swap, user needs to pay this much
     */
    public abstract getInput(): TokenAmount;

    /**
     * Returns the input token of the swap
     */
    public abstract getInputToken(): Token<T["ChainId"]>;

    /**
     * Returns input amount of the swap without the fees (swap fee, network fee)
     */
    public abstract getInputWithoutFee(): TokenAmount;

    /**
     * Returns total fee for the swap, the fee is represented in source currency & destination currency, but is
     *  paid only once
     */
    public abstract getFee(): Fee;

    /**
     * Returns the breakdown of all the fees paid
     */
    public abstract getFeeBreakdown(): FeeBreakdown<T["ChainId"]>;


    //////////////////////////////
    //// Storage

    /**
     * Saves the swap data to the underlying storage, or removes it if it is in a quote expired state
     *
     * @internal
     */
    _save(): Promise<void> {
        if(this.isQuoteExpired()) {
            return this.wrapper._removeSwapData(this);
        } else {
            return this.wrapper._saveSwapData(this);
        }
    }

    /**
     * Saves the swap data and also emits a swap state change
     *
     * @param state Optional state to set before the swap is saved an event emitted
     *
     * @internal
     */
    async _saveAndEmit(state?: S): Promise<void> {
        if(state!=null) this._state = state;
        await this._save();
        this._emitEvent();
    }

    /**
     * Serializes the swap to a JSON stringifiable representation (i.e. no bigints, buffers etc.)
     */
    public serialize(): any {
        if(this.pricingInfo==null) return {};
        return {
            id: this.getId(),
            type: this.getType(),
            escrowHash: this._getEscrowHash(),
            initiator: this._getInitiator(),

            _isValid: this.pricingInfo.isValid,
            _differencePPM: this.pricingInfo.differencePPM==null ? null :this.pricingInfo.differencePPM.toString(10),
            _satsBaseFee: this.pricingInfo.satsBaseFee==null ? null :this.pricingInfo.satsBaseFee.toString(10),
            _feePPM: this.pricingInfo.feePPM==null ? null :this.pricingInfo.feePPM.toString(10),
            _realPriceUSatPerToken: this.pricingInfo.realPriceUSatPerToken==null ? null :this.pricingInfo.realPriceUSatPerToken.toString(10),
            _realPriceUsdPerBitcoin: this.pricingInfo.realPriceUsdPerBitcoin,
            _swapPriceUSatPerToken: this.pricingInfo.swapPriceUSatPerToken==null ? null :this.pricingInfo.swapPriceUSatPerToken.toString(10),
            state: this._state,
            url: this.url,
            swapFee: this.swapFee==null ? null : this.swapFee.toString(10),
            swapFeeBtc: this.swapFeeBtc==null ? null : this.swapFeeBtc.toString(10),
            expiry: this.expiry,
            version: this.version,
            initiated: this.initiated,
            exactIn: this.exactIn,
            createdAt: this.createdAt,
            randomNonce: this._randomNonce
        }
    }


    //////////////////////////////
    //// Events

    /**
     * Emits a `swapState` event with the current swap
     *
     * @internal
     */
    _emitEvent() {
        this.wrapper.events.emit("swapState", this);
        this.events.emit("swapState", this);
    }


    //////////////////////////////
    //// Swap ticks & sync

    /**
     * Synchronizes swap state from chain and/or LP node, usually ran on startup
     *
     * @param save whether to save the new swap state or not
     *
     * @returns {boolean} true if the swap changed, false if the swap hasn't changed
     *
     * @internal
     */
    abstract _sync(save?: boolean): Promise<boolean>;

    /**
     * Runs quick checks on the swap, such as checking the expiry, usually ran periodically every few seconds
     *
     * @param save whether to save the new swap state or not
     *
     * @returns {boolean} true if the swap changed, false if the swap hasn't changed
     *
     * @internal
     */
    abstract _tick(save?: boolean): Promise<boolean>;

}
