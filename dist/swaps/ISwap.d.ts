/// <reference types="node" />
import { SwapType } from "../enums/SwapType";
import { EventEmitter } from "events";
import { ISwapWrapper, SwapTypeDefinition } from "./ISwapWrapper";
import { ChainType } from "@atomiqlabs/base";
import { SwapDirection } from "../enums/SwapDirection";
import { Fee } from "../types/fees/Fee";
import { FeeBreakdown } from "../types/fees/FeeBreakdown";
import { PercentagePPM } from "../types/fees/PercentagePPM";
import { TokenAmount } from "../types/TokenAmount";
import { Token } from "../types/Token";
import { SwapExecutionAction } from "../types/SwapExecutionAction";
import { LoggerType } from "../utils/Logger";
import { PriceInfoType } from "../types/PriceInfoType";
/**
 * Initialization data for creating a swap
 *
 * @category Swaps/Base
 */
export type ISwapInit = {
    pricingInfo: PriceInfoType;
    url?: string;
    expiry: number;
    swapFee: bigint;
    swapFeeBtc: bigint;
    exactIn: boolean;
};
/**
 * Type guard to check if an object is an ISwapInit
 *
 * @category Swaps/Base
 */
export declare function isISwapInit(obj: any): obj is ISwapInit;
/**
 * Base abstract class for all swap types
 *
 * @category Swaps/Base
 */
export declare abstract class ISwap<T extends ChainType = ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, ISwap<T, any, any>>, S extends number = number> {
    /**
     * Swap type
     */
    protected readonly abstract TYPE: SwapType;
    /**
     * Swap logger
     * @internal
     */
    protected readonly abstract logger: LoggerType;
    /**
     * Current newest defined version of the swap
     * @internal
     */
    protected readonly currentVersion: number;
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
    protected initiated: boolean;
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
    _state: S;
    /**
     * Random nonce to differentiate the swap from others with the same identifier hash (i.e. when quoting the same swap
     *  from multiple LPs)
     * @internal
     */
    _randomNonce: string;
    /**
     * Event emitter emitting `"swapState"` event when swap's state changes
     */
    readonly events: EventEmitter<{
        swapState: [D["Swap"]];
    }>;
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
    protected waitTillState(targetState: S, type?: "eq" | "gte" | "neq", abortSignal?: AbortSignal): Promise<void>;
    /**
     * Returns a list of steps or transactions required to finish and settle the swap
     *
     * @param options Additional options for executing the swap
     */
    abstract txsExecute(options?: any): Promise<SwapExecutionAction<T>[]>;
    /**
     * This attempts to populate missing fields in the pricing info based on the swap amounts
     *
     * @internal
     */
    protected tryRecomputeSwapPrice(): void;
    /**
     * Re-fetches & revalidates the price data based on the current market prices
     */
    refreshPriceData(): Promise<void>;
    /**
     * Checks if the pricing for the swap is valid, according to max allowed price difference set in the ISwapPrice
     */
    hasValidPrice(): boolean;
    /**
     * Returns pricing info about the swap
     */
    getPriceInfo(): {
        marketPrice?: number;
        swapPrice: number;
        difference: PercentagePPM;
    };
    /**
     * Asserts a given signer is the initiator of this swap
     *
     * @param signer Signer to check with this swap's initiator
     * @throws {Error} When signer's address doesn't match with the swap's initiator one
     * @internal
     */
    protected checkSigner(signer: T["Signer"] | string): void;
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
    _setInitiated(): void;
    /**
     * Returns source address of the swap
     */
    abstract getInputAddress(): string | null;
    /**
     * Returns destination address of the swap
     */
    abstract getOutputAddress(): string | null;
    /**
     * Returns swap input transaction ID on the source chain
     */
    abstract getInputTxId(): string | null;
    /**
     * Returns swap output transaction ID on the destination chain
     */
    abstract getOutputTxId(): string | null;
    /**
     * Returns the ID of the swap, as used in the storage
     */
    abstract getId(): string;
    /**
     * Checks whether there is some action required from the user for this swap - can mean either refundable or claimable
     */
    abstract requiresAction(): boolean;
    /**
     * Returns whether the swap is finished and in its terminal state (this can mean successful, refunded or failed)
     */
    abstract isFinished(): boolean;
    /**
     * Checks whether the swap's quote has definitely expired and cannot be committed anymore, we can remove such swap
     */
    abstract isQuoteExpired(): boolean;
    /**
     * Checks whether the swap's quote is soft expired (this means there is not enough time buffer for it to commit,
     *  but it still can happen)
     */
    abstract isQuoteSoftExpired(): boolean;
    /**
     * Returns whether the swap finished successful
     */
    abstract isSuccessful(): boolean;
    /**
     * Returns whether the swap failed (e.g. was refunded)
     */
    abstract isFailed(): boolean;
    /**
     * Whether a swap was initialized, a swap is considered initialized on first interaction with it, i.e.
     *  calling commit() on a Smart chain -> Bitcoin swaps, calling waitForPayment() or similar on the other
     *  direction. Not initiated swaps are not saved to the persistent storage by default (see
     *  {@link SwapperOptions.saveUninitializedSwaps})
     */
    isInitiated(): boolean;
    /**
     * Returns quote expiry in UNIX millis
     */
    getQuoteExpiry(): number;
    /**
     * Returns the type of the swap
     */
    getType(): SwapType;
    /**
     * Returns the direction of the swap
     */
    getDirection(): SwapDirection;
    /**
     * Returns the current state of the swap
     */
    getState(): S;
    /**
     * Returns output amount of the swap, user receives this much
     */
    abstract getOutput(): TokenAmount;
    /**
     * Returns the output token of the swap
     */
    abstract getOutputToken(): Token<T["ChainId"]>;
    /**
     * Returns input amount of the swap, user needs to pay this much
     */
    abstract getInput(): TokenAmount;
    /**
     * Returns the input token of the swap
     */
    abstract getInputToken(): Token<T["ChainId"]>;
    /**
     * Returns input amount of the swap without the fees (swap fee, network fee)
     */
    abstract getInputWithoutFee(): TokenAmount;
    /**
     * Returns total fee for the swap, the fee is represented in source currency & destination currency, but is
     *  paid only once
     */
    abstract getFee(): Fee;
    /**
     * Returns the breakdown of all the fees paid
     */
    abstract getFeeBreakdown(): FeeBreakdown<T["ChainId"]>;
    /**
     * Saves the swap data to the underlying storage, or removes it if it is in a quote expired state
     *
     * @internal
     */
    _save(): Promise<void>;
    /**
     * Saves the swap data and also emits a swap state change
     *
     * @param state Optional state to set before the swap is saved an event emitted
     *
     * @internal
     */
    _saveAndEmit(state?: S): Promise<void>;
    /**
     * Serializes the swap to a JSON stringifiable representation (i.e. no bigints, buffers etc.)
     */
    serialize(): any;
    /**
     * Emits a `swapState` event with the current swap
     *
     * @internal
     */
    _emitEvent(): void;
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
