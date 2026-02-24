"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IToBTCSwap = exports.ToBTCSwapState = exports.isIToBTCSwapInit = void 0;
const base_1 = require("@atomiqlabs/base");
const IntermediaryAPI_1 = require("../../../intermediaries/apis/IntermediaryAPI");
const IntermediaryError_1 = require("../../../errors/IntermediaryError");
const Utils_1 = require("../../../utils/Utils");
const IEscrowSelfInitSwap_1 = require("../IEscrowSelfInitSwap");
const FeeType_1 = require("../../../enums/FeeType");
const PercentagePPM_1 = require("../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../types/TokenAmount");
const TimeoutUtils_1 = require("../../../utils/TimeoutUtils");
function isIToBTCSwapInit(obj) {
    return typeof (obj.networkFee) === "bigint" &&
        typeof (obj.networkFeeBtc) === "bigint" &&
        (obj.signatureData == null || (typeof (obj.signatureData) === 'object' &&
            typeof (obj.signatureData.prefix) === "string" &&
            typeof (obj.signatureData.timeout) === "string" &&
            typeof (obj.signatureData.signature) === "string")) &&
        typeof (obj.data) === 'object' &&
        (0, IEscrowSelfInitSwap_1.isIEscrowSelfInitSwapInit)(obj);
}
exports.isIToBTCSwapInit = isIToBTCSwapInit;
/**
 * State enum for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
var ToBTCSwapState;
(function (ToBTCSwapState) {
    /**
     * Intermediary (LP) was unable to process the swap and the funds were refunded on the
     *  source chain
     */
    ToBTCSwapState[ToBTCSwapState["REFUNDED"] = -3] = "REFUNDED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    ToBTCSwapState[ToBTCSwapState["QUOTE_EXPIRED"] = -2] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    ToBTCSwapState[ToBTCSwapState["QUOTE_SOFT_EXPIRED"] = -1] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap was created, use the {@link IToBTCSwap.commit} or {@link IToBTCSwap.txsCommit} to
     *  initiate it by creating the swap escrow on the source chain
     */
    ToBTCSwapState[ToBTCSwapState["CREATED"] = 0] = "CREATED";
    /**
     * Swap escrow was initiated (committed) on the source chain, the intermediary (LP) will
     *  now process the swap. You can wait till that happens with the {@link IToBTCSwap.waitForPayment}
     *  function.
     */
    ToBTCSwapState[ToBTCSwapState["COMMITED"] = 1] = "COMMITED";
    /**
     * The intermediary (LP) has processed the transaction and sent out the funds on the destination chain,
     *  but hasn't yet settled the escrow on the source chain.
     */
    ToBTCSwapState[ToBTCSwapState["SOFT_CLAIMED"] = 2] = "SOFT_CLAIMED";
    /**
     * Swap was successfully settled by the intermediary (LP) on the source chain
     */
    ToBTCSwapState[ToBTCSwapState["CLAIMED"] = 3] = "CLAIMED";
    /**
     * Intermediary (LP) was unable to process the swap and the swap escrow on the source chain
     *  is refundable, call {@link IToBTCSwap.refund} or {@link IToBTCSwap.txsRefund} to refund
     */
    ToBTCSwapState[ToBTCSwapState["REFUNDABLE"] = 4] = "REFUNDABLE";
})(ToBTCSwapState = exports.ToBTCSwapState || (exports.ToBTCSwapState = {}));
const ToBTCSwapStateDescription = {
    [ToBTCSwapState.REFUNDED]: "Intermediary (LP) was unable to process the swap and the funds were refunded on the source chain",
    [ToBTCSwapState.QUOTE_EXPIRED]: "Swap has expired for good and there is no way how it can be executed anymore",
    [ToBTCSwapState.QUOTE_SOFT_EXPIRED]: "A swap is expired, though there is still a chance that it will be processed",
    [ToBTCSwapState.CREATED]: "Swap was created, initiate it by creating the swap escrow on the source chain",
    [ToBTCSwapState.COMMITED]: "Swap escrow was initiated (committed) on the source chain, the intermediary (LP) will now process the swap.",
    [ToBTCSwapState.SOFT_CLAIMED]: "The intermediary (LP) has processed the transaction and sent out the funds on the destination chain, but hasn't yet settled the escrow on the source chain.",
    [ToBTCSwapState.CLAIMED]: "Swap was successfully settled by the intermediary (LP) on the source chain",
    [ToBTCSwapState.REFUNDABLE]: "Intermediary (LP) was unable to process the swap and the swap escrow on the source chain is refundable."
};
/**
 * Base class for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
class IToBTCSwap extends IEscrowSelfInitSwap_1.IEscrowSelfInitSwap {
    constructor(wrapper, initOrObject) {
        super(wrapper, initOrObject);
        /**
         * @internal
         */
        this.swapStateDescription = ToBTCSwapStateDescription;
        /**
         * @internal
         */
        this.swapStateName = (state) => ToBTCSwapState[state];
        if (isIToBTCSwapInit(initOrObject)) {
            this._state = ToBTCSwapState.CREATED;
            this.networkFee = initOrObject.networkFee;
            this.networkFeeBtc = initOrObject.networkFeeBtc;
            this._data = initOrObject.data;
            this.signatureData = initOrObject.signatureData;
        }
        else {
            this.networkFee = (0, Utils_1.toBigInt)(initOrObject.networkFee);
            this.networkFeeBtc = (0, Utils_1.toBigInt)(initOrObject.networkFeeBtc);
        }
    }
    /**
     * @inheritDoc
     * @internal
     */
    getSwapData() {
        return this._data;
    }
    /**
     * @inheritDoc
     * @internal
     */
    upgradeVersion() {
        if (this.version == null) {
            switch (this._state) {
                case -2:
                    this._state = ToBTCSwapState.REFUNDED;
                    break;
                case -1:
                    this._state = ToBTCSwapState.QUOTE_EXPIRED;
                    break;
                case 0:
                    this._state = ToBTCSwapState.CREATED;
                    break;
                case 1:
                    this._state = ToBTCSwapState.COMMITED;
                    break;
                case 2:
                    this._state = ToBTCSwapState.CLAIMED;
                    break;
                case 3:
                    this._state = ToBTCSwapState.REFUNDABLE;
                    break;
            }
            this.version = 1;
        }
    }
    /**
     * @inheritDoc
     * @internal
     */
    tryRecomputeSwapPrice() {
        const output = this.getOutput();
        if (output.rawAmount != null) {
            if (this.swapFeeBtc == null) {
                this.swapFeeBtc = this.swapFee * output.rawAmount / this.getInputWithoutFee().rawAmount;
            }
            if (this.networkFeeBtc == null) {
                this.networkFeeBtc = this.networkFee * output.rawAmount / this.getInputWithoutFee().rawAmount;
            }
        }
        super.tryRecomputeSwapPrice();
    }
    /**
     * Returns the payment hash identifier to be sent to the LP for getStatus and getRefund
     * @internal
     */
    getLpIdentifier() {
        return this.getClaimHash();
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * @inheritDoc
     */
    getInputAddress() {
        return this._getInitiator();
    }
    /**
     * @inheritDoc
     */
    getInputTxId() {
        return this._commitTxId ?? null;
    }
    /**
     * @inheritDoc
     */
    requiresAction() {
        return this.isRefundable();
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === ToBTCSwapState.CLAIMED || this._state === ToBTCSwapState.REFUNDED || this._state === ToBTCSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isRefundable() {
        return this._state === ToBTCSwapState.REFUNDABLE;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === ToBTCSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired() {
        return this._state === ToBTCSwapState.QUOTE_EXPIRED || this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === ToBTCSwapState.CLAIMED;
    }
    /**
     * @inheritDoc
     */
    isFailed() {
        return this._state === ToBTCSwapState.REFUNDED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator() {
        return this._data.getOfferer();
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const output = this.getOutput();
        const swapFeePPM = output.rawAmount == null ? 0n : feeWithoutBaseFee * 1000000n / output.rawAmount;
        const amountInDstToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc, this.outputToken, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo),
            amountInDstToken,
            currentUsdValue: amountInDstToken.currentUsdValue,
            usdValue: amountInDstToken.usdValue,
            pastUsdValue: amountInDstToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, this.outputToken, this.wrapper._prices, this.pricingInfo),
                percentage: (0, PercentagePPM_1.ppmToPercentage)(swapFeePPM)
            }
        };
    }
    /**
     * Returns network fee for on the destination chain for the swap
     *
     * @internal
     */
    getNetworkFee() {
        const amountInDstToken = (0, TokenAmount_1.toTokenAmount)(this.networkFeeBtc, this.outputToken, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken: (0, TokenAmount_1.toTokenAmount)(this.networkFee, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo),
            amountInDstToken,
            currentUsdValue: amountInDstToken.currentUsdValue,
            usdValue: amountInDstToken.usdValue,
            pastUsdValue: amountInDstToken.pastUsdValue
        };
    }
    /**
     * @inheritDoc
     */
    getFee() {
        const amountInDstToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc + this.networkFeeBtc, this.outputToken, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee + this.networkFee, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo),
            amountInDstToken,
            currentUsdValue: amountInDstToken.currentUsdValue,
            usdValue: amountInDstToken.usdValue,
            pastUsdValue: amountInDstToken.pastUsdValue
        };
    }
    /**
     * @inheritDoc
     */
    getFeeBreakdown() {
        return [
            {
                type: FeeType_1.FeeType.SWAP,
                fee: this.getSwapFee()
            },
            {
                type: FeeType_1.FeeType.NETWORK_OUTPUT,
                fee: this.getNetworkFee()
            }
        ];
    }
    /**
     * @inheritDoc
     */
    getInputToken() {
        return this.wrapper._tokens[this._data.getToken()];
    }
    /**
     * @inheritDoc
     */
    getInput() {
        return (0, TokenAmount_1.toTokenAmount)(this._data.getAmount(), this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputWithoutFee() {
        return (0, TokenAmount_1.toTokenAmount)(this._data.getAmount() - (this.swapFee + this.networkFee), this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Checks if the initiator/sender on the source chain has enough balance to go through with the swap
     */
    async hasEnoughBalance() {
        const [balance, commitFee] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this._data.getToken(), false),
            this._data.getToken() === this.wrapper._chain.getNativeCurrencyAddress() ? this.getCommitFee() : Promise.resolve(null)
        ]);
        let required = this._data.getAmount();
        if (commitFee != null)
            required = required + commitFee;
        return {
            enoughBalance: balance >= required,
            balance: (0, TokenAmount_1.toTokenAmount)(balance, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo),
            required: (0, TokenAmount_1.toTokenAmount)(required, this.wrapper._tokens[this._data.getToken()], this.wrapper._prices, this.pricingInfo)
        };
    }
    /**
     * Checks if the initiator/sender on the source chain has enough native token balance
     *  to cover the transaction fee of initiating the swap
     */
    async hasEnoughForTxFees() {
        const [balance, commitFee] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this.wrapper._chain.getNativeCurrencyAddress(), false),
            this.getCommitFee()
        ]);
        return {
            enoughBalance: balance >= commitFee,
            balance: (0, TokenAmount_1.toTokenAmount)(balance, this.wrapper._getNativeToken(), this.wrapper._prices),
            required: (0, TokenAmount_1.toTokenAmount)(commitFee, this.wrapper._getNativeToken(), this.wrapper._prices)
        };
    }
    //////////////////////////////
    //// Execution
    /**
     * Executes the swap with the provided smart chain wallet/signer
     *
     * @param signer Smart chain wallet/signer to use to sign the transaction on the source chain
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether the swap was successfully processed by the LP, in case `false` is returned
     *  the user can refund their funds back on the source chain by calling {@link refund}
     */
    async execute(signer, callbacks, options) {
        if (this._state === ToBTCSwapState.QUOTE_EXPIRED || this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Quote expired");
        if (this._state === ToBTCSwapState.REFUNDED)
            throw new Error("Swap already refunded");
        if (this._state === ToBTCSwapState.REFUNDABLE)
            throw new Error("Swap refundable, refund with swap.refund()");
        if (this._state === ToBTCSwapState.SOFT_CLAIMED || this._state === ToBTCSwapState.CLAIMED)
            throw new Error("Swap already settled!");
        if (this._state === ToBTCSwapState.CREATED) {
            const txId = await this.commit(signer, options?.abortSignal, false, callbacks?.onSourceTransactionSent);
            if (callbacks?.onSourceTransactionConfirmed != null)
                callbacks.onSourceTransactionConfirmed(txId);
        }
        // @ts-ignore
        if (this._state === ToBTCSwapState.CLAIMED || this._state === ToBTCSwapState.SOFT_CLAIMED)
            return true;
        if (this._state === ToBTCSwapState.COMMITED) {
            const success = await this.waitForPayment(options?.maxWaitTillSwapProcessedSeconds ?? 120, options?.paymentCheckIntervalSeconds, options?.abortSignal);
            if (success) {
                if (callbacks?.onSwapSettled != null)
                    callbacks.onSwapSettled(this.getOutputTxId());
                return true;
            }
            else {
                return false;
            }
        }
        throw new Error("Unexpected state reached!");
    }
    /**
     * @inheritDoc
     *
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     */
    async txsExecute(options) {
        if (this._state !== ToBTCSwapState.CREATED)
            throw new Error("Invalid swap state, needs to be CREATED!");
        const txsCommit = await this.txsCommit(options?.skipChecks);
        return [
            {
                name: "Commit",
                description: `Initiates the swap by commiting the funds to the escrow on the ${this.chainIdentifier} side`,
                chain: this.chainIdentifier,
                txs: txsCommit
            }
        ];
    }
    /**
     * @inheritDoc
     *
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     * @param options.refundSmartChainSigner Optional smart chain signer to use when creating refunds transactions
     */
    async getCurrentActions(options) {
        if (this._state === ToBTCSwapState.CREATED) {
            try {
                return await this.txsExecute(options);
            }
            catch (e) { }
        }
        if (this.isRefundable()) {
            return [{
                    name: "Refund",
                    description: "Refund the swap after it failed to execute",
                    chain: this.chainIdentifier,
                    txs: await this.txsRefund(options?.refundSmartChainSigner)
                }];
        }
        return [];
    }
    //////////////////////////////
    //// Commit
    /**
     * @inheritDoc
     *
     * @throws {Error} When in invalid state (not {@link ToBTCSwapState.CREATED})
     */
    async txsCommit(skipChecks) {
        if (this._state !== ToBTCSwapState.CREATED)
            throw new Error("Must be in CREATED state!");
        if (this.signatureData == null)
            throw new Error("Init signature data not known, cannot commit!");
        if (!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }
        return await this.wrapper._contract.txsInit(this._getInitiator(), this._data, this.signatureData, skipChecks, this.feeRate).catch(e => Promise.reject(e instanceof base_1.SignatureVerificationError ? new Error("Request timed out") : e));
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commit(_signer, abortSignal, skipChecks, onBeforeTxSent) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        this.checkSigner(signer);
        const txs = await this.txsCommit(skipChecks);
        let txCount = 0;
        const result = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, false, (txId, rawTx) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === txs.length)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this._commitTxId = result[result.length - 1];
        if (this._state === ToBTCSwapState.CREATED || this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED || this._state === ToBTCSwapState.QUOTE_EXPIRED) {
            await this._saveAndEmit(ToBTCSwapState.COMMITED);
        }
        return this._commitTxId;
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is not in the correct state (must be {@link ToBTCSwapState.CREATED})
     */
    async waitTillCommited(abortSignal) {
        if (this._state === ToBTCSwapState.COMMITED || this._state === ToBTCSwapState.CLAIMED)
            return Promise.resolve();
        if (this._state !== ToBTCSwapState.CREATED && this._state !== ToBTCSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Invalid state (not CREATED)");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        let result;
        try {
            result = await Promise.race([
                this.watchdogWaitTillCommited(undefined, abortController.signal),
                this.waitTillState(ToBTCSwapState.COMMITED, "gte", abortController.signal).then(() => 0)
            ]);
            abortController.abort();
        }
        catch (e) {
            abortController.abort();
            throw e;
        }
        if (result === 0)
            this.logger.debug("waitTillCommited(): Resolved from state change");
        if (result === true)
            this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
        if (result === false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - signature expiry");
            if (this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED || this._state === ToBTCSwapState.CREATED) {
                await this._saveAndEmit(ToBTCSwapState.QUOTE_EXPIRED);
            }
            throw new Error("Quote expired while waiting for transaction confirmation!");
        }
        if (this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED || this._state === ToBTCSwapState.CREATED || this._state === ToBTCSwapState.QUOTE_EXPIRED) {
            await this._saveAndEmit(ToBTCSwapState.COMMITED);
        }
    }
    //////////////////////////////
    //// Payment
    /**
     * Waits till the swap is processed by the intermediary (LP)
     *
     * @param checkIntervalSeconds How often to poll the intermediary for status (5 seconds default)
     * @param abortSignal Abort signal
     * @internal
     */
    async waitTillIntermediarySwapProcessed(checkIntervalSeconds, abortSignal) {
        if (this.url == null)
            throw new Error("LP URL not specified!");
        checkIntervalSeconds ??= 5;
        let resp = { code: IntermediaryAPI_1.RefundAuthorizationResponseCodes.PENDING, msg: "" };
        while (!abortSignal?.aborted && (resp.code === IntermediaryAPI_1.RefundAuthorizationResponseCodes.PENDING || resp.code === IntermediaryAPI_1.RefundAuthorizationResponseCodes.NOT_FOUND)) {
            resp = await IntermediaryAPI_1.IntermediaryAPI.getRefundAuthorization(this.url, this.getLpIdentifier(), this._data.getSequence());
            if (resp.code === IntermediaryAPI_1.RefundAuthorizationResponseCodes.PAID) {
                const validResponse = await this._setPaymentResult(resp.data, true);
                if (validResponse) {
                    if (this._state === ToBTCSwapState.COMMITED || this._state === ToBTCSwapState.REFUNDABLE) {
                        await this._saveAndEmit(ToBTCSwapState.SOFT_CLAIMED);
                    }
                }
                else {
                    resp = { code: IntermediaryAPI_1.RefundAuthorizationResponseCodes.PENDING, msg: "" };
                }
            }
            if (resp.code === IntermediaryAPI_1.RefundAuthorizationResponseCodes.PENDING ||
                resp.code === IntermediaryAPI_1.RefundAuthorizationResponseCodes.NOT_FOUND)
                await (0, TimeoutUtils_1.timeoutPromise)(checkIntervalSeconds * 1000, abortSignal);
        }
        return resp;
    }
    /**
     * Checks whether the swap was already processed by the LP and is either successful (requires proof which is
     *  either a HTLC pre-image for LN swaps or valid txId for on-chain swap) or failed and we can cooperatively
     *  refund.
     *
     * @param save whether to save the data
     * @returns `true` if swap is processed, `false` if the swap is still ongoing
     *
     * @internal
     */
    async checkIntermediarySwapProcessed(save = true) {
        if (this._state === ToBTCSwapState.CREATED || this._state == ToBTCSwapState.QUOTE_EXPIRED || this.url == null)
            return false;
        if (this.isFinished() || this.isRefundable())
            return true;
        //Check if that maybe already concluded according to the LP
        const resp = await IntermediaryAPI_1.IntermediaryAPI.getRefundAuthorization(this.url, this.getLpIdentifier(), this._data.getSequence());
        switch (resp.code) {
            case IntermediaryAPI_1.RefundAuthorizationResponseCodes.PAID:
                const processed = await this._setPaymentResult(resp.data, true);
                if (processed) {
                    this._state = ToBTCSwapState.SOFT_CLAIMED;
                    if (save)
                        await this._saveAndEmit();
                }
                return processed;
            case IntermediaryAPI_1.RefundAuthorizationResponseCodes.REFUND_DATA:
                await this.wrapper._contract.isValidRefundAuthorization(this._data, resp.data);
                this._state = ToBTCSwapState.REFUNDABLE;
                if (save)
                    await this._saveAndEmit();
                return true;
            default:
                return false;
        }
    }
    /**
     * A blocking promise resolving when swap was concluded by the intermediary (LP),
     *  rejecting in case of failure
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled, an error is thrown if the
     *  swap is taking too long to claim
     * @param checkIntervalSeconds How often to poll the intermediary for answer
     * @param abortSignal Abort signal
     * @returns `true` if swap was successful, `false` if swap failed and we can refund
     *
     * @throws {IntermediaryError} If a swap is determined expired by the intermediary, but it is actually still valid
     * @throws {SignatureVerificationError} If the swap should be cooperatively refundable but the intermediary returned
     *  invalid refund signature
     * @throws {Error} When swap expires or if the swap has invalid state (must be {@link ToBTCSwapState.COMMITED})
     */
    async waitForPayment(maxWaitTimeSeconds, checkIntervalSeconds, abortSignal) {
        if (this._state === ToBTCSwapState.CLAIMED)
            return Promise.resolve(true);
        if (this._state !== ToBTCSwapState.COMMITED && this._state !== ToBTCSwapState.SOFT_CLAIMED)
            throw new Error("Invalid state (not COMMITED)");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        let timedOut = false;
        if (maxWaitTimeSeconds != null) {
            const timeout = setTimeout(() => {
                timedOut = true;
                abortController.abort();
            }, maxWaitTimeSeconds * 1000);
            abortController.signal.addEventListener("abort", () => clearTimeout(timeout));
        }
        let result;
        try {
            result = await Promise.race([
                this.waitTillState(ToBTCSwapState.CLAIMED, "gte", abortController.signal),
                this.waitTillIntermediarySwapProcessed(checkIntervalSeconds, abortController.signal)
            ]);
            abortController.abort();
        }
        catch (e) {
            abortController.abort();
            if (timedOut) {
                throw new Error("Timed out while waiting for LP to process the swap, the LP might be unresponsive or offline!" +
                    ` Please check later or wait till ${new Date(Number(this._data.getExpiry()) * 1000).toLocaleString()} to refund unilaterally!`);
            }
            throw e;
        }
        if (typeof result !== "object") {
            if (this._state === ToBTCSwapState.REFUNDABLE)
                throw new Error("Swap expired");
            this.logger.debug("waitTillRefunded(): Resolved from state change");
            return true;
        }
        this.logger.debug("waitTillRefunded(): Resolved from intermediary response");
        switch (result.code) {
            case IntermediaryAPI_1.RefundAuthorizationResponseCodes.PAID:
                return true;
            case IntermediaryAPI_1.RefundAuthorizationResponseCodes.REFUND_DATA:
                const resultData = result.data;
                await this.wrapper._contract.isValidRefundAuthorization(this._data, resultData);
                await this._saveAndEmit(ToBTCSwapState.REFUNDABLE);
                return false;
            case IntermediaryAPI_1.RefundAuthorizationResponseCodes.EXPIRED:
                if (await this.wrapper._contract.isExpired(this._getInitiator(), this._data))
                    throw new Error("Swap expired");
                throw new IntermediaryError_1.IntermediaryError("Swap expired");
            case IntermediaryAPI_1.RefundAuthorizationResponseCodes.NOT_FOUND:
                if (this._state === ToBTCSwapState.CLAIMED)
                    return true;
                throw new Error("LP swap not found");
        }
        throw new Error("Invalid response code returned by the LP");
    }
    //////////////////////////////
    //// Refund
    /**
     * Get the estimated smart chain transaction fee of the refund transaction
     */
    async getRefundNetworkFee() {
        const swapContract = this.wrapper._contract;
        return (0, TokenAmount_1.toTokenAmount)(await swapContract.getRefundFee(this._getInitiator(), this._data), this.wrapper._getNativeToken(), this.wrapper._prices);
    }
    /**
     * @inheritDoc
     *
     * @throws {IntermediaryError} If intermediary returns invalid response in case cooperative refund should be used
     * @throws {SignatureVerificationError} If intermediary returned invalid cooperative refund signature
     * @throws {Error} When state is not refundable
     */
    async txsRefund(_signer) {
        if (!this.isRefundable())
            throw new Error("Must be in REFUNDABLE state or expired!");
        let signer;
        if (_signer != null) {
            if (typeof (_signer) === "string") {
                signer = _signer;
            }
            else if ((0, base_1.isAbstractSigner)(_signer)) {
                signer = _signer.getAddress();
            }
            else {
                signer = (await this.wrapper._chain.wrapSigner(_signer)).getAddress();
            }
        }
        else {
            signer = this._getInitiator();
        }
        if (await this.wrapper._contract.isExpired(this._getInitiator(), this._data)) {
            return await this.wrapper._contract.txsRefund(signer, this._data, true, true);
        }
        else {
            if (this.url == null)
                throw new Error("LP URL not known, cannot get cooperative refund message, wait till expiry to refund!");
            const res = await IntermediaryAPI_1.IntermediaryAPI.getRefundAuthorization(this.url, this.getLpIdentifier(), this._data.getSequence());
            if (res.code === IntermediaryAPI_1.RefundAuthorizationResponseCodes.REFUND_DATA) {
                return await this.wrapper._contract.txsRefundWithAuthorization(signer, this._data, res.data, true, true);
            }
            throw new IntermediaryError_1.IntermediaryError("Invalid intermediary cooperative message returned");
        }
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async refund(_signer, abortSignal) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        const result = await this.wrapper._chain.sendAndConfirm(signer, await this.txsRefund(signer.getAddress()), true, abortSignal);
        this._refundTxId = result[0];
        if (this._state === ToBTCSwapState.COMMITED || this._state === ToBTCSwapState.REFUNDABLE || this._state === ToBTCSwapState.SOFT_CLAIMED) {
            await this._saveAndEmit(ToBTCSwapState.REFUNDED);
        }
        return result[0];
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} When swap is not in a valid state (must be {@link ToBTCSwapState.COMMITED} or
     *  {@link ToBTCSwapState.REFUNDABLE})
     * @throws {Error} If we tried to refund but claimer was able to claim first
     */
    async waitTillRefunded(abortSignal) {
        if (this._state === ToBTCSwapState.REFUNDED)
            return Promise.resolve();
        if (this._state !== ToBTCSwapState.COMMITED &&
            this._state !== ToBTCSwapState.SOFT_CLAIMED &&
            this._state !== ToBTCSwapState.REFUNDABLE)
            throw new Error("Invalid state (not COMMITED)");
        const abortController = new AbortController();
        if (abortSignal != null)
            abortSignal.addEventListener("abort", () => abortController.abort(abortSignal.reason));
        const res = await Promise.race([
            this.watchdogWaitTillResult(undefined, abortController.signal),
            this.waitTillState(ToBTCSwapState.REFUNDED, "eq", abortController.signal).then(() => 0),
            this.waitTillState(ToBTCSwapState.CLAIMED, "eq", abortController.signal).then(() => 1),
        ]);
        abortController.abort();
        if (res === 0) {
            this.logger.debug("waitTillRefunded(): Resolved from state change (REFUNDED)");
            return;
        }
        if (res === 1) {
            this.logger.debug("waitTillRefunded(): Resolved from state change (CLAIMED)");
            throw new Error("Tried to refund swap, but claimer claimed it in the meantime!");
        }
        this.logger.debug("waitTillRefunded(): Resolved from watchdog");
        if (res?.type === base_1.SwapCommitStateType.PAID) {
            if (this._claimTxId == null)
                this._claimTxId = await res.getClaimTxId();
            await this._saveAndEmit(ToBTCSwapState.CLAIMED);
            throw new Error("Tried to refund swap, but claimer claimed it in the meantime!");
        }
        if (res?.type === base_1.SwapCommitStateType.NOT_COMMITED) {
            if (this._refundTxId == null && res.getRefundTxId != null)
                this._refundTxId = await res.getRefundTxId();
            await this._saveAndEmit(ToBTCSwapState.REFUNDED);
        }
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
    serialize() {
        const obj = super.serialize();
        return {
            ...obj,
            networkFee: this.networkFee == null ? null : this.networkFee.toString(10),
            networkFeeBtc: this.networkFeeBtc == null ? null : this.networkFeeBtc.toString(10)
        };
    }
    //////////////////////////////
    //// Swap ticks & sync
    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     *
     * @private
     */
    async syncStateFromChain(quoteDefinitelyExpired, commitStatus) {
        if (this._state === ToBTCSwapState.CREATED ||
            this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state === ToBTCSwapState.COMMITED ||
            this._state === ToBTCSwapState.SOFT_CLAIMED ||
            this._state === ToBTCSwapState.REFUNDABLE) {
            let quoteExpired = false;
            if (this._state === ToBTCSwapState.CREATED || this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED) {
                //Check if quote is still valid
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }
            commitStatus ??= await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            if (commitStatus != null && await this._forciblySetOnchainState(commitStatus))
                return true;
            if ((this._state === ToBTCSwapState.CREATED || this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED)) {
                if (quoteExpired) {
                    this._state = ToBTCSwapState.QUOTE_EXPIRED;
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState() {
        return this._state === ToBTCSwapState.CREATED ||
            this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state === ToBTCSwapState.COMMITED ||
            this._state === ToBTCSwapState.SOFT_CLAIMED ||
            this._state === ToBTCSwapState.REFUNDABLE;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus() {
        return this._state === ToBTCSwapState.CREATED || this._state === ToBTCSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save, quoteDefinitelyExpired, commitStatus) {
        let changed = await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus);
        if (this._state === ToBTCSwapState.COMMITED || this._state === ToBTCSwapState.SOFT_CLAIMED) {
            //Check if that maybe already concluded
            try {
                if (await this.checkIntermediarySwapProcessed(false))
                    changed = true;
            }
            catch (e) {
                this.logger.error("_sync(): Failed to synchronize swap, error: ", e);
            }
        }
        if (save && changed)
            await this._saveAndEmit();
        return changed;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _forciblySetOnchainState(commitStatus) {
        switch (commitStatus.type) {
            case base_1.SwapCommitStateType.PAID:
                if (this._claimTxId == null && commitStatus.getClaimTxId)
                    this._claimTxId = await commitStatus.getClaimTxId();
                const eventResult = await commitStatus.getClaimResult();
                try {
                    await this._setPaymentResult({ secret: eventResult, txId: Buffer.from(eventResult, "hex").reverse().toString("hex") });
                }
                catch (e) {
                    this.logger.error(`Failed to set payment result ${eventResult} on the swap!`);
                }
                this._state = ToBTCSwapState.CLAIMED;
                return true;
            case base_1.SwapCommitStateType.REFUNDABLE:
                this._state = ToBTCSwapState.REFUNDABLE;
                return true;
            case base_1.SwapCommitStateType.EXPIRED:
                if (this._refundTxId == null && commitStatus.getRefundTxId)
                    this._refundTxId = await commitStatus.getRefundTxId();
                this._state = this._refundTxId == null ? ToBTCSwapState.QUOTE_EXPIRED : ToBTCSwapState.REFUNDED;
                return true;
            case base_1.SwapCommitStateType.NOT_COMMITED:
                if (this._refundTxId == null && commitStatus.getRefundTxId)
                    this._refundTxId = await commitStatus.getRefundTxId();
                if (this._refundTxId != null) {
                    this._state = ToBTCSwapState.REFUNDED;
                    return true;
                }
                break;
            case base_1.SwapCommitStateType.COMMITED:
                if (this._state !== ToBTCSwapState.COMMITED && this._state !== ToBTCSwapState.REFUNDABLE && this._state !== ToBTCSwapState.SOFT_CLAIMED) {
                    this._state = ToBTCSwapState.COMMITED;
                    return true;
                }
                break;
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save) {
        switch (this._state) {
            case ToBTCSwapState.CREATED:
                if (this.expiry < Date.now()) {
                    this._state = ToBTCSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case ToBTCSwapState.COMMITED:
            case ToBTCSwapState.SOFT_CLAIMED:
                const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data);
                if (expired) {
                    this._state = ToBTCSwapState.REFUNDABLE;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
        }
        return false;
    }
}
exports.IToBTCSwap = IToBTCSwap;
