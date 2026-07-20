import { ToBTCSwapState } from "./IToBTCSwap";
import { IntermediaryError } from "../../../errors/IntermediaryError";
import { IEscrowSwapWrapper } from "../IEscrowSwapWrapper";
import { mapArrayToObject } from "../../../utils/Utils";
/**
 * Base class for wrappers of escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export class IToBTCWrapper extends IEscrowSwapWrapper {
    constructor() {
        super(...arguments);
        /**
         * @internal
         */
        this.tickSwapState = [ToBTCSwapState.CREATED, ToBTCSwapState.COMMITED, ToBTCSwapState.SOFT_CLAIMED];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            ToBTCSwapState.CREATED,
            ToBTCSwapState.QUOTE_SOFT_EXPIRED,
            ToBTCSwapState.COMMITED,
            ToBTCSwapState.SOFT_CLAIMED,
            ToBTCSwapState.REFUNDABLE
        ];
        /**
         * @internal
         */
        this._refundableSwapStates = [ToBTCSwapState.REFUNDABLE];
    }
    /**
     * Pre-fetches intermediary's reputation, doesn't throw, instead aborts via abortController and returns null
     *
     * @param amountData
     * @param lp Intermediary
     * @param abortController
     * @param contractVersion
     * @returns Intermediary's reputation or null if failed
     * @throws {IntermediaryError} If the intermediary vault doesn't exist
     *
     * @internal
     */
    preFetchIntermediaryReputation(amountData, lp, abortController, contractVersion) {
        return lp.getReputation(this.chainIdentifier, this._contract(contractVersion), [amountData.token.toString()], abortController.signal).then(res => {
            if (res == null)
                throw new IntermediaryError("Invalid data returned - invalid LP vault");
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
     * @param contractVersions
     * @returns Fee rate
     *
     * @internal
     */
    preFetchFeeRate(signer, amountData, claimHash, abortController, contractVersions) {
        return mapArrayToObject(contractVersions, (contractVersion) => {
            return this._contract(contractVersion).getInitPayInFeeRate(signer, this._chain.randomAddress(), amountData.token, claimHash?.[contractVersion])
                .catch(e => {
                this.logger.warn("preFetchFeeRate(): Error: ", e);
                abortController.abort(e);
                return undefined;
            });
        });
    }
    /**
     * @internal
     */
    async processEventInitialize(swap, event) {
        if (swap._state === ToBTCSwapState.CREATED || swap._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = ToBTCSwapState.COMMITED;
            return true;
        }
        return false;
    }
    /**
     * @internal
     */
    async processEventClaim(swap, event) {
        if (swap._state !== ToBTCSwapState.REFUNDED && swap._state !== ToBTCSwapState.CLAIMED) {
            await swap._setPaymentResult({
                secret: event.result,
                txId: Buffer.from(event.result, "hex").reverse().toString("hex")
            }).catch(e => {
                this.logger.warn(`processEventClaim(): Failed to set payment result ${event.result}: `, e);
            });
            swap._state = ToBTCSwapState.CLAIMED;
            return true;
        }
        return false;
    }
    /**
     * @internal
     */
    processEventRefund(swap, event) {
        if (swap._state !== ToBTCSwapState.CLAIMED && swap._state !== ToBTCSwapState.REFUNDED) {
            swap._state = ToBTCSwapState.REFUNDED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
}
