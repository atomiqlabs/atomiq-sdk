/// <reference types="node" />
/// <reference types="node" />
import { ISwap, ISwapInit } from "../ISwap";
import { ChainType, SwapCommitState, SwapData, SwapExpiredState, SwapNotCommitedState, SwapPaidState } from "@atomiqlabs/base";
import { IEscrowSwapDefinition, IEscrowSwapWrapper } from "./IEscrowSwapWrapper";
import { Buffer } from "buffer";
export type IEscrowSwapInit<T extends SwapData> = ISwapInit & {
    data?: T;
};
export declare function isIEscrowSwapInit<T extends SwapData>(obj: any): obj is IEscrowSwapInit<T>;
/**
 * Base class for escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps/Abstract
 */
export declare abstract class IEscrowSwap<T extends ChainType = ChainType, D extends IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSwap<T, D, S>> = IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, any>, IEscrowSwap<T, any, any>>, S extends number = number> extends ISwap<T, D, S> {
    /**
     * @internal
     */
    _data?: T["Data"];
    /**
     * Transaction IDs for the swap on the smart chain side
     * @internal
     */
    _commitTxId?: string;
    /**
     * @internal
     */
    _refundTxId?: string;
    /**
     * @internal
     */
    _claimTxId?: string;
    protected constructor(wrapper: D["Wrapper"], obj: any);
    protected constructor(wrapper: D["Wrapper"], swapInit: IEscrowSwapInit<T["Data"]>);
    /**
     * Returns the swap escrow data for this swap
     *
     * @internal
     */
    protected abstract getSwapData(): T["Data"];
    /**
     * Returns the identification hash of the swap, usually claim data hash, but can be overriden, e.g. for
     *  lightning swaps the identifier hash is used instead of claim data hash
     *
     * @internal
     */
    protected getIdentifierHash(): Buffer;
    /**
     * Returns the identification hash of the swap, usually claim data hash, but can be overriden, e.g. for
     *  lightning swaps the identifier hash is used instead of claim data hash
     *
     * @internal
     */
    protected getIdentifierHashString(): string;
    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash(): string | null;
    /**
     * Returns the escrow hash - i.e. hash of the escrow data
     */
    getEscrowHash(): string | null;
    /**
     * Returns the claim data hash specifying the claim path of the escrow - i.e. hash passed to the claim handler
     */
    getClaimHash(): string;
    /**
     * @inheritDoc
     */
    getId(): string;
    /**
     * Returns the smart chain transaction ID of the tx that initiated the escrow
     */
    getEscrowInitTxId(): string | undefined;
    /**
     * Returns the smart chain transaction ID of the tx that claimed (settled) the escrow
     */
    getEscrowClaimTxId(): string | undefined;
    /**
     * Returns the smart chain transaction ID of the tx that refunded the escrow
     */
    getEscrowRefundTxId(): string | undefined;
    /**
     * Periodically checks the chain to see whether the swap is committed
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    protected watchdogWaitTillCommited(intervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * Periodically checks the chain to see whether the swap was finished (claimed or refunded)
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    protected watchdogWaitTillResult(intervalSeconds?: number, abortSignal?: AbortSignal): Promise<SwapPaidState | SwapExpiredState | SwapNotCommitedState>;
    /**
     * Whether on-chain state should be fetched for this swap
     * @internal
     */
    abstract _shouldFetchOnchainState(): boolean;
    /**
     * Whether expiration status of the swap quote should be checked for this swap
     * @internal
     */
    abstract _shouldFetchExpiryStatus(): boolean;
    /**
     * @inheritDoc
     *
     * @param save Whether to save the new swap state or not
     * @param quoteDefinitelyExpired Optionally pass whether the quote is definitely expired from a batch pre-fetch,
     *  fetched on-demand if not provided
     * @param commitStatus Optionally pass the quote on-chain state from a batch pre-fetch, fetched on-demand if
     *  not provided
     *
     * @internal
     */
    abstract _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState): Promise<boolean>;
    /**
     * Forcibly overrides current swap state from fetched on-chain swap state
     *
     * @param commitStatus Swap state fetched from the smart chain
     *
     * @internal
     */
    abstract _forciblySetOnchainState(commitStatus: SwapCommitState): Promise<boolean>;
    /**
     * @inheritDoc
     */
    serialize(): any;
}
