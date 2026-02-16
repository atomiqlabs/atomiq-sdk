"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IToBTCWrapper = void 0;
const IToBTCSwap_1 = require("./IToBTCSwap");
const IntermediaryError_1 = require("../../../errors/IntermediaryError");
const IEscrowSwapWrapper_1 = require("../IEscrowSwapWrapper");
/**
 * Base class for wrappers of escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps
 */
class IToBTCWrapper extends IEscrowSwapWrapper_1.IEscrowSwapWrapper {
    constructor() {
        super(...arguments);
        /**
         * @internal
         */
        this.tickSwapState = [IToBTCSwap_1.ToBTCSwapState.CREATED, IToBTCSwap_1.ToBTCSwapState.COMMITED, IToBTCSwap_1.ToBTCSwapState.SOFT_CLAIMED];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            IToBTCSwap_1.ToBTCSwapState.CREATED,
            IToBTCSwap_1.ToBTCSwapState.QUOTE_SOFT_EXPIRED,
            IToBTCSwap_1.ToBTCSwapState.COMMITED,
            IToBTCSwap_1.ToBTCSwapState.SOFT_CLAIMED,
            IToBTCSwap_1.ToBTCSwapState.REFUNDABLE
        ];
        /**
         * @internal
         */
        this._refundableSwapStates = [IToBTCSwap_1.ToBTCSwapState.REFUNDABLE];
    }
    /**
     * Pre-fetches intermediary's reputation, doesn't throw, instead aborts via abortController and returns null
     *
     * @param amountData
     * @param lp Intermediary
     * @param abortController
     * @returns Intermediary's reputation or null if failed
     * @throws {IntermediaryError} If the intermediary vault doesn't exist
     *
     * @internal
     */
    preFetchIntermediaryReputation(amountData, lp, abortController) {
        return lp.getReputation(this.chainIdentifier, this._contract, [amountData.token.toString()], abortController.signal).then(res => {
            if (res == null)
                throw new IntermediaryError_1.IntermediaryError("Invalid data returned - invalid LP vault");
            return res;
        }).catch(e => {
            this.logger.warn("preFetchIntermediaryReputation(): Error: ", e);
            abortController.abort(e);
            return undefined;
        });
    }
    /**
     * Pre-fetches feeRate for a given swap
     *
     * @param signer Address of the swap initiator
     * @param amountData
     * @param claimHash optional hash of the swap or null
     * @param abortController
     * @returns Fee rate
     *
     * @internal
     */
    preFetchFeeRate(signer, amountData, claimHash, abortController) {
        return this._contract.getInitPayInFeeRate(signer, this._chain.randomAddress(), amountData.token, claimHash)
            .catch(e => {
            this.logger.warn("preFetchFeeRate(): Error: ", e);
            abortController.abort(e);
            return undefined;
        });
    }
    /**
     * @internal
     */
    async processEventInitialize(swap, event) {
        if (swap._state === IToBTCSwap_1.ToBTCSwapState.CREATED || swap._state === IToBTCSwap_1.ToBTCSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = IToBTCSwap_1.ToBTCSwapState.COMMITED;
            if (swap._commitTxId == null)
                swap._commitTxId = event.meta?.txId;
            return true;
        }
        return false;
    }
    /**
     * @internal
     */
    async processEventClaim(swap, event) {
        if (swap._state !== IToBTCSwap_1.ToBTCSwapState.REFUNDED && swap._state !== IToBTCSwap_1.ToBTCSwapState.CLAIMED) {
            await swap._setPaymentResult({
                secret: event.result,
                txId: Buffer.from(event.result, "hex").reverse().toString("hex")
            }).catch(e => {
                this.logger.warn(`processEventClaim(): Failed to set payment result ${event.result}: `, e);
            });
            swap._state = IToBTCSwap_1.ToBTCSwapState.CLAIMED;
            if (swap._claimTxId == null)
                swap._claimTxId = event.meta?.txId;
            return true;
        }
        return false;
    }
    /**
     * @internal
     */
    processEventRefund(swap, event) {
        if (swap._state !== IToBTCSwap_1.ToBTCSwapState.CLAIMED && swap._state !== IToBTCSwap_1.ToBTCSwapState.REFUNDED) {
            swap._state = IToBTCSwap_1.ToBTCSwapState.REFUNDED;
            if (swap._refundTxId == null)
                swap._refundTxId = event.meta?.txId;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
}
exports.IToBTCWrapper = IToBTCWrapper;
