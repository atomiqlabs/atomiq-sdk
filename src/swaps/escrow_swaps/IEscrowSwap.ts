import {isISwapInit, ISwap, ISwapInit} from "../ISwap";
import {
    ChainType,
    SwapCommitState,
    SwapCommitStateType,
    SwapData,
    SwapExpiredState,
    SwapNotCommitedState,
    SwapPaidState
} from "@atomiqlabs/base";
import {IEscrowSwapDefinition, IEscrowSwapWrapper} from "./IEscrowSwapWrapper";
import {Buffer} from "buffer";
import {timeoutPromise} from "../../utils/TimeoutUtils";

export type IEscrowSwapInit<T extends SwapData> = ISwapInit & {
    data?: T,
};

export function isIEscrowSwapInit<T extends SwapData>(obj: any): obj is IEscrowSwapInit<T> {
    return typeof obj === 'object' &&
        (obj.data == null || typeof obj.data === 'object') &&
        isISwapInit(obj);
}

/**
 * Base class for escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps/Abstract
 */
export abstract class IEscrowSwap<
    T extends ChainType = ChainType,
    D extends IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSwap<T, D, S>> = IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, any>, IEscrowSwap<T, any, any>>,
    S extends number = number
> extends ISwap<T, D, S> {
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
    protected constructor(
        wrapper: D["Wrapper"],
        swapInitOrObj: IEscrowSwapInit<T["Data"]> | any,
    ) {
        super(wrapper, swapInitOrObj);

        if(isIEscrowSwapInit(swapInitOrObj)) {
            this._data = swapInitOrObj.data;
        } else {
            if(swapInitOrObj.data!=null) this._data = new wrapper._swapDataDeserializer(swapInitOrObj.data);

            this._commitTxId = swapInitOrObj.commitTxId;
            this._claimTxId = swapInitOrObj.claimTxId;
            this._refundTxId = swapInitOrObj.refundTxId;
        }
    }

    /**
     * Returns the swap escrow data for this swap
     *
     * @internal
     */
    protected abstract getSwapData(): T["Data"];

    //////////////////////////////
    //// Identifiers

    /**
     * Returns the identification hash of the swap, usually claim data hash, but can be overriden, e.g. for
     *  lightning swaps the identifier hash is used instead of claim data hash
     *
     * @internal
     */
    protected getIdentifierHash(): Buffer {
        const claimHashBuffer = Buffer.from(this.getClaimHash(), "hex");
        if(this._randomNonce==null) return claimHashBuffer;
        return Buffer.concat([claimHashBuffer, Buffer.from(this._randomNonce, "hex")]);
    }

    /**
     * Returns the identification hash of the swap, usually claim data hash, but can be overriden, e.g. for
     *  lightning swaps the identifier hash is used instead of claim data hash
     *
     * @internal
     */
    protected getIdentifierHashString(): string {
        const identifierHash = this.getIdentifierHash();
        return identifierHash.toString("hex");
    }

    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash(): string | null {
        return this._data?.getEscrowHash() ?? null;
    }

    /**
     * Returns the escrow hash - i.e. hash of the escrow data
     */
    getEscrowHash(): string | null {
        return this._getEscrowHash();
    }

    /**
     * Returns the claim data hash specifying the claim path of the escrow - i.e. hash passed to the claim handler
     */
    getClaimHash(): string {
        return this.getSwapData().getClaimHash();
    }

    /**
     * @inheritDoc
     */
    getId(): string {
        return this.getIdentifierHashString();
    }

    /**
     * Returns the smart chain transaction ID of the tx that initiated the escrow
     */
    getEscrowInitTxId(): string | undefined {
        return this._commitTxId;
    }

    /**
     * Returns the smart chain transaction ID of the tx that claimed (settled) the escrow
     */
    getEscrowClaimTxId(): string | undefined {
        return this._claimTxId;
    }

    /**
     * Returns the smart chain transaction ID of the tx that refunded the escrow
     */
    getEscrowRefundTxId(): string | undefined {
        return this._refundTxId;
    }

    //////////////////////////////
    //// Watchdogs

    /**
     * Periodically checks the chain to see whether the swap is committed
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    protected async watchdogWaitTillCommited(intervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean> {
        if(this._data==null) throw new Error("Tried to await commitment but data is null, invalid state?");

        intervalSeconds ??= 5;
        let status: SwapCommitState = {type: SwapCommitStateType.NOT_COMMITED};
        while(status?.type===SwapCommitStateType.NOT_COMMITED) {
            await timeoutPromise(intervalSeconds*1000, abortSignal);
            try {
                status = await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
                if(
                    status?.type===SwapCommitStateType.NOT_COMMITED &&
                    await this._verifyQuoteDefinitelyExpired()
                ) return false;
            } catch (e) {
                this.logger.error("watchdogWaitTillCommited(): Error when fetching commit status or signature expiry: ", e);
            }
        }
        if(abortSignal!=null) abortSignal.throwIfAborted();
        return status?.type!==SwapCommitStateType.EXPIRED;
    }

    /**
     * Periodically checks the chain to see whether the swap was finished (claimed or refunded)
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    protected async watchdogWaitTillResult(intervalSeconds?: number, abortSignal?: AbortSignal): Promise<
        SwapPaidState | SwapExpiredState | SwapNotCommitedState
    > {
        if(this._data==null) throw new Error("Tried to await result but data is null, invalid state?");

        intervalSeconds ??= 5;
        let status: SwapCommitState = {type: SwapCommitStateType.COMMITED};
        while(status?.type===SwapCommitStateType.COMMITED || status?.type===SwapCommitStateType.REFUNDABLE) {
            await timeoutPromise(intervalSeconds*1000, abortSignal);
            try {
                status = await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            } catch (e) {
                this.logger.error("watchdogWaitTillResult(): Error when fetching commit status: ", e);
            }
        }
        if(abortSignal!=null) abortSignal.throwIfAborted();
        return status;
    }


    //////////////////////////////
    //// Helpers for batched swap checks

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
    serialize(): any {
        return {
            ...super.serialize(),
            data: this._data!=null ? this._data.serialize() : null,
            commitTxId: this._commitTxId,
            claimTxId: this._claimTxId,
            refundTxId: this._refundTxId
        }
    };

}