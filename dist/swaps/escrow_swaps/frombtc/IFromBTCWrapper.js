"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IFromBTCWrapper = void 0;
const IntermediaryError_1 = require("../../../errors/IntermediaryError");
const Utils_1 = require("../../../utils/Utils");
const base_1 = require("@atomiqlabs/base");
const IEscrowSwapWrapper_1 = require("../IEscrowSwapWrapper");
/**
 * Base class for wrappers of escrow-based Bitcoin (on-chain & lightning) -> Smart chain swaps
 *
 * @category Swaps/Abstract
 */
class IFromBTCWrapper extends IEscrowSwapWrapper_1.IEscrowSwapWrapper {
    /**
     * Returns a random sequence to be used for swaps
     *
     * @returns Random 64-bit sequence number
     *
     * @internal
     */
    getRandomSequence() {
        return base_1.BigIntBufferUtils.fromBuffer((0, Utils_1.randomBytes)(8));
    }
    /**
     * Pre-fetches smart chain fee rate for initiating a swap escrow on the smart chain side
     *
     * @param signer Address initiating the swap
     * @param amountData
     * @param claimHash optional claim hash of the swap or null
     * @param abortController
     *
     * @returns Fee rate
     *
     * @internal
     */
    preFetchFeeRate(signer, amountData, claimHash, abortController) {
        return this._contract.getInitFeeRate(this._chain.randomAddress(), signer, amountData.token, claimHash)
            .catch(e => {
            this.logger.warn("preFetchFeeRate(): Error: ", e);
            abortController.abort(e);
            return undefined;
        });
    }
    /**
     * Pre-fetches intermediary (LP) available smart chain liquidity
     *
     * @param amountData
     * @param lp Intermediary
     * @param abortController
     *
     * @returns Intermediary's liquidity balance
     *
     * @internal
     */
    preFetchIntermediaryLiquidity(amountData, lp, abortController) {
        return lp.getLiquidity(this.chainIdentifier, this._contract, amountData.token.toString(), abortController.signal).catch(e => {
            this.logger.warn("preFetchIntermediaryLiquidity(): Error: ", e);
            abortController.abort(e);
            return undefined;
        });
    }
    /**
     * Verifies whether the intermediary (LP) has enough available liquidity such that we can initiate the swap
     *
     * @param amount Swap amount that the recipient should receive
     * @param liquidityPromise pre-fetched liquidity promise as obtained from {@link preFetchIntermediaryLiquidity}
     *
     * @throws {IntermediaryError} if intermediary's liquidity is lower than what's required for the swap
     *
     * @internal
     */
    async verifyIntermediaryLiquidity(amount, liquidityPromise) {
        const liquidity = await liquidityPromise;
        if (liquidity < amount)
            throw new IntermediaryError_1.IntermediaryError("Intermediary doesn't have enough liquidity");
    }
}
exports.IFromBTCWrapper = IFromBTCWrapper;
