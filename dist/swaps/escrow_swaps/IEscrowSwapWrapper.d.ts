/// <reference types="node" />
import { ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens } from "../ISwapWrapper";
import { ChainType, ClaimEvent, InitializeEvent, RefundEvent, SignatureData, SwapCommitState, SwapEvent } from "@atomiqlabs/base";
import { ISwap } from "../ISwap";
import { UnifiedSwapStorage } from "../../storage/UnifiedSwapStorage";
import { UnifiedSwapEventListener } from "../../events/UnifiedSwapEventListener";
import { ISwapPrice } from "../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { SwapType } from "../../enums/SwapType";
import { IEscrowSwap } from "./IEscrowSwap";
import { Intermediary } from "../../intermediaries/Intermediary";
export type IEscrowSwapDefinition<T extends ChainType, W extends IEscrowSwapWrapper<T, any>, S extends IEscrowSwap<T>> = SwapTypeDefinition<T, W, S>;
/**
 * Base class for wrappers of escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps/Abstract
 */
export declare abstract class IEscrowSwapWrapper<T extends ChainType, D extends IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSwap<T, D>>, O extends ISwapWrapperOptions = ISwapWrapperOptions> extends ISwapWrapper<T, D, O> {
    readonly abstract TYPE: SwapType;
    /**
     * @internal
     */
    readonly _contract: T["Contract"];
    /**
     * @internal
     */
    readonly _swapDataDeserializer: new (data: any) => T["Data"];
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], contract: T["Contract"], prices: ISwapPrice, tokens: WrapperCtorTokens, swapDataDeserializer: new (data: any) => T["Data"], options: O, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * Pre-fetches signature verification data from the server's pre-sent promise, doesn't throw, instead returns null
     *
     * @param signDataPrefetch Promise that resolves when we receive "signDataPrefetch" from the LP in streaming mode
     * @returns Pre-fetched signature verification data or null if failed
     *
     * @internal
     */
    protected preFetchSignData(signDataPrefetch: Promise<any | null>): Promise<T["PreFetchVerification"] | undefined>;
    /**
     * Verifies swap initialization signature returned by the intermediary
     *
     * @param initiator A smart chain account initiating the swap
     * @param data Parsed swap data from the intermediary
     * @param signature Response of the intermediary
     * @param feeRatePromise Pre-fetched fee rate promise
     * @param preFetchSignatureVerificationData Pre-fetched signature verification data
     * @param abortSignal
     * @returns Swap initialization signature expiry
     * @throws {SignatureVerificationError} when swap init signature is invalid
     *
     * @internal
     */
    protected verifyReturnedSignature(initiator: string, data: T["Data"], signature: SignatureData, feeRatePromise: Promise<any>, preFetchSignatureVerificationData: Promise<any>, abortSignal?: AbortSignal): Promise<number>;
    /**
     * Processes InitializeEvent for a given swap
     * @param swap
     * @param event
     * @returns Whether the swap was updated/changed
     *
     * @internal
     */
    protected abstract processEventInitialize(swap: D["Swap"], event: InitializeEvent<T["Data"]>): Promise<boolean>;
    /**
     * Processes ClaimEvent for a given swap
     * @param swap
     * @param event
     * @returns Whether the swap was updated/changed
     *
     * @internal
     */
    protected abstract processEventClaim(swap: D["Swap"], event: ClaimEvent<T["Data"]>): Promise<boolean>;
    /**
     * Processes RefundEvent for a given swap
     * @param swap
     * @param event
     * @returns Whether the swap was updated/changed
     *
     * @internal
     */
    protected abstract processEventRefund(swap: D["Swap"], event: RefundEvent<T["Data"]>): Promise<boolean>;
    /**
     * Processes a single SC on-chain event
     * @param event
     * @param swap
     *
     * @internal
     */
    protected processEvent(event: SwapEvent<T["Data"]>, swap: D["Swap"]): Promise<void>;
    /**
     * @inheritDoc
     * @internal
     */
    protected _checkPastSwaps(pastSwaps: D["Swap"][]): Promise<{
        changedSwaps: D["Swap"][];
        removeSwaps: D["Swap"][];
    }>;
    /**
     * Recovers a swap from smart chain on-chain data, please note that not all values for the recovered
     *  swaps might be populated, as some data is purely off-chain and can never be recovered purely
     *  from on-chain data.
     *
     * @param init Swap escrow initialization transaction and swap data
     * @param state Current on-chain state of the swap
     * @param lp Intermediary (LP) used as a counterparty for the swap
     */
    abstract recoverFromSwapDataAndState(init: {
        data: T["Data"];
        getInitTxId: () => Promise<string>;
        getTxBlock: () => Promise<{
            blockTime: number;
            blockHeight: number;
        }>;
    }, state: SwapCommitState, lp?: Intermediary): Promise<D["Swap"] | null>;
}
