"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IFromBTCLNWrapper = void 0;
const IFromBTCWrapper_1 = require("./IFromBTCWrapper");
const buffer_1 = require("buffer");
const Utils_1 = require("../../../utils/Utils");
const IntermediaryError_1 = require("../../../errors/IntermediaryError");
const LNURL_1 = require("../../../lnurl/LNURL");
const UserError_1 = require("../../../errors/UserError");
const sha256_1 = require("@noble/hashes/sha256");
/**
 * Base class for wrappers of escrow-based Lightning -> Smart chain swaps
 *
 * @category Swaps/Abstract
 */
class IFromBTCLNWrapper extends IFromBTCWrapper_1.IFromBTCWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Swap pricing handler
     * @param tokens
     * @param swapDataDeserializer Deserializer for SwapData
     * @param lnApi
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, lnApi, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer, options, events);
        this.lnApi = lnApi;
    }
    /**
     * Generates a new 32-byte secret to be used as pre-image for lightning network invoice & HTLC swap
     *
     * @returns Hash pre-image & payment hash
     *
     * @internal
     */
    getSecretAndHash() {
        const secret = (0, Utils_1.randomBytes)(32);
        const paymentHash = buffer_1.Buffer.from((0, sha256_1.sha256)(secret));
        return { secret, paymentHash };
    }
    /**
     * Pre-fetches intermediary's LN node capacity, doesn't throw, instead returns null
     *
     * @param pubkeyPromise Promise that resolves when we receive "lnPublicKey" param from the intermediary through
     *  streaming
     *
     * @returns LN Node liquidity
     *
     * @internal
     */
    preFetchLnCapacity(pubkeyPromise) {
        return pubkeyPromise.then(pubkey => {
            if (pubkey == null)
                return null;
            return this.lnApi.getLNNodeLiquidity(pubkey);
        }).catch(e => {
            this.logger.warn("preFetchLnCapacity(): Error: ", e);
            return null;
        });
    }
    /**
     * Verifies whether the intermediary's lightning node has enough inbound capacity to receive the LN payment
     *
     * @param lp Intermediary
     * @param decodedPr Decoded bolt11 lightning network invoice
     * @param lnCapacityPrefetchPromise Pre-fetch for LN node capacity, preFetchLnCapacity()
     * @param abortSignal Abort signal
     *
     * @throws {IntermediaryError} if the lightning network node doesn't have enough inbound liquidity
     * @throws {Error} if the lightning network node's inbound liquidity might be enough, but the swap would
     *  deplete more than half of the liquidity
     *
     * @internal
     */
    async verifyLnNodeCapacity(lp, decodedPr, lnCapacityPrefetchPromise, abortSignal) {
        if (decodedPr.payeeNodeKey == null)
            throw new Error("Unable to extract payee pubkey from the swap invoice!");
        if (decodedPr.millisatoshis == null)
            throw new Error("Swap invoice doesn't contains msat amount field!");
        const _result = await lnCapacityPrefetchPromise ?? await this.lnApi.getLNNodeLiquidity(decodedPr.payeeNodeKey);
        if (_result === null)
            throw new IntermediaryError_1.IntermediaryError("LP's lightning node not found in the lightning network graph!");
        if (abortSignal != null)
            abortSignal.throwIfAborted();
        lp.lnData = _result;
        if (decodedPr.payeeNodeKey !== _result.publicKey)
            throw new IntermediaryError_1.IntermediaryError("Invalid pr returned - payee pubkey");
        const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
        if (_result.capacity < amountIn)
            throw new IntermediaryError_1.IntermediaryError("LP's lightning node doesn't have enough inbound capacity for the swap!");
        if ((_result.capacity / 2n) < amountIn)
            throw new Error("LP's lightning node probably doesn't have enough inbound capacity for the swap!");
    }
    /**
     * Parses and fetches lnurl withdraw params from the specified lnurl
     *
     * @param lnurl LNURL to be parsed and fetched
     * @param abortSignal Abort signal
     *
     * @throws {UserError} if the LNURL is invalid or if it's not a LNURL-withdraw
     *
     * @internal
     */
    async getLNURLWithdraw(lnurl, abortSignal) {
        if (typeof (lnurl) !== "string")
            return lnurl;
        const res = await LNURL_1.LNURL.getLNURL(lnurl, true, this._options.getRequestTimeout, abortSignal);
        if (res == null)
            throw new UserError_1.UserError("Invalid LNURL");
        if (res.tag !== "withdrawRequest")
            throw new UserError_1.UserError("Not a LNURL-withdrawal");
        return res;
    }
    /**
     * Returns the swap expiry, leaving enough time for the user to claim the HTLC
     *
     * @param data Parsed swap data
     *
     * @internal
     */
    _getHtlcTimeout(data) {
        return data.getExpiry() - 600n;
    }
}
exports.IFromBTCLNWrapper = IFromBTCLNWrapper;
