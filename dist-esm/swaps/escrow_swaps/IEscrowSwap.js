import { isISwapInit, ISwap } from "../ISwap";
import { SwapCommitStateType } from "@atomiqlabs/base";
import { Buffer } from "buffer";
import { timeoutPromise } from "../../utils/TimeoutUtils";
export function isIEscrowSwapInit(obj) {
    return typeof obj === 'object' &&
        (obj.data == null || typeof obj.data === 'object') &&
        isISwapInit(obj);
}
/**
 * Base class for escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps/Abstract
 */
export class IEscrowSwap extends ISwap {
    constructor(wrapper, swapInitOrObj) {
        super(wrapper, swapInitOrObj);
        if (isIEscrowSwapInit(swapInitOrObj)) {
            this._data = swapInitOrObj.data;
        }
        else {
            if (swapInitOrObj.data != null)
                this._data = new (wrapper._swapDataDeserializer(this._contractVersion))(swapInitOrObj.data);
            this._commitTxId = swapInitOrObj.commitTxId;
            this._claimTxId = swapInitOrObj.claimTxId;
            this._refundTxId = swapInitOrObj.refundTxId;
        }
        this._contract = wrapper._contract(this._contractVersion);
    }
    //////////////////////////////
    //// Identifiers
    /**
     * Returns the identification hash of the swap, usually claim data hash, but can be overriden, e.g. for
     *  lightning swaps the identifier hash is used instead of claim data hash
     *
     * @internal
     */
    getIdentifierHash() {
        const claimHashBuffer = Buffer.from(this.getClaimHash(), "hex");
        if (this._randomNonce == null)
            return claimHashBuffer;
        return Buffer.concat([claimHashBuffer, Buffer.from(this._randomNonce, "hex")]);
    }
    /**
     * Returns the identification hash of the swap, usually claim data hash, but can be overriden, e.g. for
     *  lightning swaps the identifier hash is used instead of claim data hash
     *
     * @internal
     */
    getIdentifierHashString() {
        const identifierHash = this.getIdentifierHash();
        return identifierHash.toString("hex");
    }
    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash() {
        return this._data?.getEscrowHash() ?? null;
    }
    /**
     * Returns the escrow hash - i.e. hash of the escrow data
     */
    getEscrowHash() {
        return this._getEscrowHash();
    }
    /**
     * Returns the claim data hash specifying the claim path of the escrow - i.e. hash passed to the claim handler
     */
    getClaimHash() {
        return this.getSwapData().getClaimHash();
    }
    /**
     * @inheritDoc
     */
    getId() {
        return this.getIdentifierHashString();
    }
    /**
     * Returns the smart chain transaction ID of the tx that initiated the escrow
     */
    getEscrowInitTxId() {
        return this._commitTxId;
    }
    /**
     * Returns the smart chain transaction ID of the tx that claimed (settled) the escrow
     */
    getEscrowClaimTxId() {
        return this._claimTxId;
    }
    /**
     * Returns the smart chain transaction ID of the tx that refunded the escrow
     */
    getEscrowRefundTxId() {
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
    async watchdogWaitTillCommited(intervalSeconds, abortSignal) {
        if (this._data == null)
            throw new Error("Tried to await commitment but data is null, invalid state?");
        intervalSeconds ??= 5;
        let status = { type: SwapCommitStateType.NOT_COMMITED };
        while (status?.type === SwapCommitStateType.NOT_COMMITED) {
            await timeoutPromise(intervalSeconds * 1000, abortSignal);
            try {
                status = await this._contract.getCommitStatus(this._getInitiator(), this._data);
                if (status?.type === SwapCommitStateType.NOT_COMMITED &&
                    await this._verifyQuoteDefinitelyExpired())
                    return null;
            }
            catch (e) {
                this.logger.error("watchdogWaitTillCommited(): Error when fetching commit status or signature expiry: ", e);
            }
        }
        if (abortSignal != null)
            abortSignal.throwIfAborted();
        return status?.type === SwapCommitStateType.EXPIRED
            ? null
            : status;
    }
    /**
     * Periodically checks the chain to see whether the swap was finished (claimed or refunded)
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    async watchdogWaitTillResult(intervalSeconds, abortSignal) {
        if (this._data == null)
            throw new Error("Tried to await result but data is null, invalid state?");
        intervalSeconds ??= 5;
        let status = { type: SwapCommitStateType.COMMITED };
        while (status?.type === SwapCommitStateType.COMMITED || status?.type === SwapCommitStateType.REFUNDABLE) {
            await timeoutPromise(intervalSeconds * 1000, abortSignal);
            try {
                status = await this._contract.getCommitStatus(this._getInitiator(), this._data);
            }
            catch (e) {
                this.logger.error("watchdogWaitTillResult(): Error when fetching commit status: ", e);
            }
        }
        if (abortSignal != null)
            abortSignal.throwIfAborted();
        return status;
    }
    /**
     * @inheritDoc
     */
    serialize() {
        return {
            ...super.serialize(),
            data: this._data != null ? this._data.serialize() : null,
            commitTxId: this._commitTxId,
            claimTxId: this._claimTxId,
            refundTxId: this._refundTxId
        };
    }
    ;
}
