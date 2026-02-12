"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IEscrowSwap = exports.isIEscrowSwapInit = void 0;
const ISwap_1 = require("../ISwap");
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
const TimeoutUtils_1 = require("../../utils/TimeoutUtils");
function isIEscrowSwapInit(obj) {
    return typeof obj === 'object' &&
        (obj.data == null || typeof obj.data === 'object') &&
        (0, ISwap_1.isISwapInit)(obj);
}
exports.isIEscrowSwapInit = isIEscrowSwapInit;
/**
 * Base class for escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps
 */
class IEscrowSwap extends ISwap_1.ISwap {
    constructor(wrapper, swapInitOrObj) {
        super(wrapper, swapInitOrObj);
        if (isIEscrowSwapInit(swapInitOrObj)) {
            this._data = swapInitOrObj.data;
        }
        else {
            if (swapInitOrObj.data != null)
                this._data = new wrapper._swapDataDeserializer(swapInitOrObj.data);
            this._commitTxId = swapInitOrObj.commitTxId;
            this._claimTxId = swapInitOrObj.claimTxId;
            this._refundTxId = swapInitOrObj.refundTxId;
        }
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
        const claimHashBuffer = buffer_1.Buffer.from(this.getClaimHash(), "hex");
        if (this._randomNonce == null)
            return claimHashBuffer;
        return buffer_1.Buffer.concat([claimHashBuffer, buffer_1.Buffer.from(this._randomNonce, "hex")]);
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
        let status = { type: base_1.SwapCommitStateType.NOT_COMMITED };
        while (status?.type === base_1.SwapCommitStateType.NOT_COMMITED) {
            await (0, TimeoutUtils_1.timeoutPromise)(intervalSeconds * 1000, abortSignal);
            try {
                status = await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
                if (status?.type === base_1.SwapCommitStateType.NOT_COMMITED &&
                    await this._verifyQuoteDefinitelyExpired())
                    return false;
            }
            catch (e) {
                this.logger.error("watchdogWaitTillCommited(): Error when fetching commit status or signature expiry: ", e);
            }
        }
        if (abortSignal != null)
            abortSignal.throwIfAborted();
        return status?.type !== base_1.SwapCommitStateType.EXPIRED;
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
        let status = { type: base_1.SwapCommitStateType.COMMITED };
        while (status?.type === base_1.SwapCommitStateType.COMMITED || status?.type === base_1.SwapCommitStateType.REFUNDABLE) {
            await (0, TimeoutUtils_1.timeoutPromise)(intervalSeconds * 1000, abortSignal);
            try {
                status = await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
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
exports.IEscrowSwap = IEscrowSwap;
