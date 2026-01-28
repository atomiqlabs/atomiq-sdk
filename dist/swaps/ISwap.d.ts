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
 * @category Swaps
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
 * @category Swaps
 */
export declare function isISwapInit(obj: any): obj is ISwapInit;
/**
 * Base abstract class for all swap types
 * @category Swaps
 */
export declare abstract class ISwap<T extends ChainType = ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, ISwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, ISwap<T, any, any>>, S extends number = number> {
    protected readonly abstract TYPE: SwapType;
    protected readonly abstract logger: LoggerType;
    protected readonly currentVersion: number;
    protected readonly wrapper: D["Wrapper"];
    readonly url?: string;
    readonly chainIdentifier: T["ChainId"];
    readonly exactIn: boolean;
    createdAt: number;
    protected version: number;
    protected initiated: boolean;
    state: S;
    expiry: number;
    pricingInfo?: PriceInfoType;
    protected swapFee: bigint;
    protected swapFeeBtc: bigint;
    /**
     * Random nonce to differentiate the swap from others with the same identifier hash (i.e. when quoting the same swap
     *  from multiple LPs)
     */
    randomNonce: string;
    /**
     * Event emitter emitting "swapState" event when swap's state changes
     */
    events: EventEmitter<{
        swapState: [D["Swap"]];
    }>;
    protected constructor(wrapper: D["Wrapper"], obj: any);
    protected constructor(wrapper: D["Wrapper"], swapInit: ISwapInit);
    protected abstract upgradeVersion(): void;
    /**
     * Waits till the swap reaches a specific state
     *
     * @param targetState The state to wait for
     * @param type Whether to wait for the state exactly or also to a state with a higher number
     * @param abortSignal
     * @protected
     */
    protected waitTillState(targetState: S, type?: "eq" | "gte" | "neq", abortSignal?: AbortSignal): Promise<void>;
    abstract txsExecute(options?: any): Promise<SwapExecutionAction<T>[]>;
    protected tryRecomputeSwapPrice(): void;
    /**
     * Re-fetches & revalidates the price data
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
    abstract _getEscrowHash(): string | null;
    /**
     * @param signer Signer to check with this swap's initiator
     * @throws {Error} When signer's address doesn't match with the swap's initiator one
     */
    protected checkSigner(signer: T["Signer"] | string): void;
    /**
     * Checks if the swap's quote is still valid
     */
    abstract verifyQuoteValid(): Promise<boolean>;
    abstract getInputAddress(): string | null;
    abstract getOutputAddress(): string | null;
    abstract getInputTxId(): string | null;
    abstract getOutputTxId(): string | null;
    /**
     * Returns the ID of the swap, as used in the storage and getSwapById function
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
     * Returns the intiator address of the swap - address that created this swap
     */
    abstract _getInitiator(): string;
    isInitiated(): boolean;
    _setInitiated(): void;
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
    abstract getOutput(): TokenAmount | null;
    /**
     * Returns the output token of the swap
     */
    abstract getOutputToken(): Token<T["ChainId"]>;
    /**
     * Returns input amount of the swap, user needs to pay this much
     */
    abstract getInput(): TokenAmount | null;
    /**
     * Returns the input token of the swap
     */
    abstract getInputToken(): Token<T["ChainId"]>;
    /**
     * Returns input amount if the swap without the fees (swap fee, network fee)
     */
    abstract getInputWithoutFee(): TokenAmount | null;
    /**
     * Returns total fee for the swap, the fee is represented in source currency & destination currency, but is
     *  paid only once
     */
    abstract getFee(): Fee;
    /**
     * Returns the breakdown of all the fees paid
     */
    abstract getFeeBreakdown(): FeeBreakdown<T["ChainId"]>;
    serialize(): any;
    _save(): Promise<void>;
    _saveAndEmit(state?: S): Promise<void>;
    _emitEvent(): void;
    /**
     * Synchronizes swap state from chain and/or LP node, usually ran on startup
     *
     * @param save whether to save the new swap state or not
     *
     * @returns {boolean} true if the swap changed, false if the swap hasn't changed
     */
    abstract _sync(save?: boolean): Promise<boolean>;
    /**
     * Runs quick checks on the swap, such as checking the expiry, usually ran periodically every few seconds
     *
     * @param save whether to save the new swap state or not
     *
     * @returns {boolean} true if the swap changed, false if the swap hasn't changed
     */
    abstract _tick(save?: boolean): Promise<boolean>;
}
