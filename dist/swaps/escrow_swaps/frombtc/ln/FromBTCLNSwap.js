"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromBTCLNSwap = exports.isFromBTCLNSwapInit = exports.FromBTCLNSwapState = void 0;
const bolt11_1 = require("@atomiqlabs/bolt11");
const IFromBTCSelfInitSwap_1 = require("../IFromBTCSelfInitSwap");
const SwapType_1 = require("../../../../enums/SwapType");
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
const LNURL_1 = require("../../../../lnurl/LNURL");
const UserError_1 = require("../../../../errors/UserError");
const IntermediaryAPI_1 = require("../../../../intermediaries/apis/IntermediaryAPI");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const Utils_1 = require("../../../../utils/Utils");
const IEscrowSelfInitSwap_1 = require("../../IEscrowSelfInitSwap");
const TokenAmount_1 = require("../../../../types/TokenAmount");
const Token_1 = require("../../../../types/Token");
const Logger_1 = require("../../../../utils/Logger");
const TimeoutUtils_1 = require("../../../../utils/TimeoutUtils");
const LNURLWithdraw_1 = require("../../../../types/lnurl/LNURLWithdraw");
const sha2_1 = require("@noble/hashes/sha2");
/**
 * State enum for legacy Lightning -> Smart chain swaps
 * @category Swaps/Legacy/Lightning → Smart chain
 */
var FromBTCLNSwapState;
(function (FromBTCLNSwapState) {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FromBTCLNSwapState[FromBTCLNSwapState["FAILED"] = -4] = "FAILED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    FromBTCLNSwapState[FromBTCLNSwapState["QUOTE_EXPIRED"] = -3] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    FromBTCLNSwapState[FromBTCLNSwapState["QUOTE_SOFT_EXPIRED"] = -2] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    FromBTCLNSwapState[FromBTCLNSwapState["EXPIRED"] = -1] = "EXPIRED";
    /**
     * Swap quote was created, use {@link FromBTCLNSwap.getAddress} or {@link FromBTCLNSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP)
     */
    FromBTCLNSwapState[FromBTCLNSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * Lightning network payment has been received by the intermediary (LP), the user can now settle
     *  the swap on the destination smart chain side with {@link FromBTCLNSwap.commitAndClaim} (if
     *  the underlying chain supports it - check with {@link FromBTCLNSwap.canCommitAndClaimInOneShot}),
     *  or by calling {@link FromBTCLNSwap.commit} and {@link FromBTCLNSwap.claim} separately.
     */
    FromBTCLNSwapState[FromBTCLNSwapState["PR_PAID"] = 1] = "PR_PAID";
    /**
     * Swap escrow HTLC has been created on the destination chain. Continue by claiming it with the
     *  {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} function.
     */
    FromBTCLNSwapState[FromBTCLNSwapState["CLAIM_COMMITED"] = 2] = "CLAIM_COMMITED";
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    FromBTCLNSwapState[FromBTCLNSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCLNSwapState = exports.FromBTCLNSwapState || (exports.FromBTCLNSwapState = {}));
const FromBTCLNSwapStateDescription = {
    [FromBTCLNSwapState.FAILED]: `Swap has failed as the user didn't settle the HTLC on the destination before expiration`,
    [FromBTCLNSwapState.QUOTE_EXPIRED]: `Swap has expired for good and there is no way how it can be executed anymore`,
    [FromBTCLNSwapState.QUOTE_SOFT_EXPIRED]: `Swap is expired, though there is still a chance that it will be processed`,
    [FromBTCLNSwapState.EXPIRED]: `Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     swap on the destination smart chain.`,
    [FromBTCLNSwapState.PR_CREATED]: `Swap quote was created, pay the bolt11 lightning network invoice to initiate the swap,
     then use the wait till the lightning network payment is received by the intermediary (LP)`,
    [FromBTCLNSwapState.PR_PAID]: `Lightning network payment has been received by the intermediary (LP), the user can now settle
     the swap on the destination smart chain side.`,
    [FromBTCLNSwapState.CLAIM_COMMITED]: `Swap escrow HTLC has been created on the destination chain. Continue by claiming it.`,
    [FromBTCLNSwapState.CLAIM_CLAIMED]: `Swap successfully settled and funds received on the destination chain`
};
function isFromBTCLNSwapInit(obj) {
    return (obj.pr == null || typeof obj.pr === "string") &&
        (obj.secret == null || typeof obj.secret === "string") &&
        (obj.lnurl == null || typeof (obj.lnurl) === "string") &&
        (obj.lnurlK1 == null || typeof (obj.lnurlK1) === "string") &&
        (obj.lnurlCallback == null || typeof (obj.lnurlCallback) === "string") &&
        (0, IEscrowSelfInitSwap_1.isIEscrowSelfInitSwapInit)(obj);
}
exports.isFromBTCLNSwapInit = isFromBTCLNSwapInit;
/**
 * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement
 *  of the swap on the destination network once the lightning network payment is received by the LP.
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
class FromBTCLNSwap extends IFromBTCSelfInitSwap_1.IFromBTCSelfInitSwap {
    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl, lnurlK1, lnurlCallback) {
        this.lnurl = lnurl;
        this.lnurlK1 = lnurlK1;
        this.lnurlCallback = lnurlCallback;
    }
    constructor(wrapper, initOrObject) {
        if (isFromBTCLNSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/frombtcln";
        super(wrapper, initOrObject);
        this.TYPE = SwapType_1.SwapType.FROM_BTCLN;
        /**
         * @internal
         */
        this.swapStateName = (state) => FromBTCLNSwapState[state];
        /**
         * @internal
         */
        this.swapStateDescription = FromBTCLNSwapStateDescription;
        /**
         * @internal
         */
        this.inputToken = Token_1.BitcoinTokens.BTCLN;
        this.lnurlFailSignal = new AbortController();
        this.prPosted = false;
        if (isFromBTCLNSwapInit(initOrObject)) {
            this._state = FromBTCLNSwapState.PR_CREATED;
            this.pr = initOrObject.pr;
            this.secret = initOrObject.secret;
            this.initialSwapData = initOrObject.initialSwapData;
            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.usesClaimHashAsId = true;
        }
        else {
            this.pr = initOrObject.pr;
            this.secret = initOrObject.secret;
            if (initOrObject.initialSwapData == null) {
                this.initialSwapData = this._data;
            }
            else {
                this.initialSwapData = base_1.SwapData.deserialize(initOrObject.initialSwapData);
            }
            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.prPosted = initOrObject.prPosted;
            if (this._state === FromBTCLNSwapState.PR_CREATED && this._data != null) {
                this.initialSwapData = this._data;
                delete this._data;
            }
            this.usesClaimHashAsId = initOrObject.usesClaimHashAsId ?? false;
        }
        this.tryRecomputeSwapPrice();
        this.logger = (0, Logger_1.getLogger)("FromBTCLN(" + this.getIdentifierHashString() + "): ");
    }
    /**
     * @inheritDoc
     * @internal
     */
    getSwapData() {
        return this._data ?? this.initialSwapData;
    }
    /**
     * @inheritDoc
     * @internal
     */
    upgradeVersion() {
        if (this.version == null) {
            switch (this._state) {
                case -2:
                    this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    break;
                case -1:
                    this._state = FromBTCLNSwapState.FAILED;
                    break;
                case 0:
                    this._state = FromBTCLNSwapState.PR_CREATED;
                    break;
                case 1:
                    this._state = FromBTCLNSwapState.PR_PAID;
                    break;
                case 2:
                    this._state = FromBTCLNSwapState.CLAIM_COMMITED;
                    break;
                case 3:
                    this._state = FromBTCLNSwapState.CLAIM_CLAIMED;
                    break;
            }
            this.version = 1;
        }
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * @inheritDoc
     * @internal
     */
    getIdentifierHash() {
        const idBuffer = this.usesClaimHashAsId
            ? buffer_1.Buffer.from(this.getClaimHash(), "hex")
            : this.getPaymentHash();
        if (this._randomNonce == null)
            return idBuffer;
        return buffer_1.Buffer.concat([idBuffer, buffer_1.Buffer.from(this._randomNonce, "hex")]);
    }
    /**
     * Returns the payment hash of the swap and lightning network invoice, or `null` if not known (i.e. if
     *  the swap was recovered from on-chain data, the payment hash might not be known)
     *
     * @internal
     */
    getPaymentHash() {
        if (this.pr == null)
            return null;
        if (this.pr.toLowerCase().startsWith("ln")) {
            const parsed = (0, bolt11_1.decode)(this.pr);
            if (parsed.tagsObject.payment_hash == null)
                throw new Error("Swap invoice has no payment hash field!");
            return buffer_1.Buffer.from(parsed.tagsObject.payment_hash, "hex");
        }
        return buffer_1.Buffer.from(this.pr, "hex");
    }
    /**
     * @inheritDoc
     * @internal
     */
    canCommit() {
        return this._state === FromBTCLNSwapState.PR_PAID;
    }
    /**
     * @inheritDoc
     */
    getInputAddress() {
        return this.lnurl ?? this.pr ?? null;
    }
    /**
     * @inheritDoc
     */
    getInputTxId() {
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            return null;
        return paymentHash.toString("hex");
    }
    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap.
     *
     * In case the swap is recovered from on-chain data, the address returned might be just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data.
     */
    getAddress() {
        return this.pr ?? "";
    }
    /**
     * A hyperlink representation of the address + amount that the user needs to sends on the source chain.
     *  This is suitable to be displayed in a form of QR code.
     *
     * @remarks
     * In case the swap is recovered from on-chain data, the address returned might be just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data.
     */
    getHyperlink() {
        return this.pr == null ? "" : "lightning:" + this.pr.toUpperCase();
    }
    /**
     * Returns the timeout time (in UNIX milliseconds) when the swap will definitelly be considered as expired
     *  if the LP doesn't make it expired sooner
     */
    getDefinitiveExpiryTime() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return 0;
        const decoded = (0, bolt11_1.decode)(this.pr);
        if (decoded.timeExpireDate == null)
            throw new Error("Swap invoice doesn't contain expiry date field!");
        const finalCltvExpiryDelta = decoded.tagsObject.min_final_cltv_expiry ?? 144;
        const finalCltvExpiryDelay = finalCltvExpiryDelta * this.wrapper._options.bitcoinBlocktime * this.wrapper._options.safetyFactor;
        return (decoded.timeExpireDate + finalCltvExpiryDelay) * 1000;
    }
    /**
     * Returns timeout time (in UNIX milliseconds) when the swap htlc will expire
     */
    getHtlcTimeoutTime() {
        if (this._data == null)
            return null;
        return Number(this.wrapper._getHtlcTimeout(this._data)) * 1000;
    }
    /**
     * Returns timeout time (in UNIX milliseconds) when the LN invoice will expire
     */
    getTimeoutTime() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return 0;
        const decoded = (0, bolt11_1.decode)(this.pr);
        if (decoded.timeExpireDate == null)
            throw new Error("Swap invoice doesn't contain expiry date field!");
        return (decoded.timeExpireDate * 1000);
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === FromBTCLNSwapState.CLAIM_CLAIMED || this._state === FromBTCLNSwapState.QUOTE_EXPIRED || this._state === FromBTCLNSwapState.FAILED;
    }
    /**
     * @inheritDoc
     */
    isClaimable() {
        return this._state === FromBTCLNSwapState.CLAIM_COMMITED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === FromBTCLNSwapState.CLAIM_CLAIMED;
    }
    /**
     * @inheritDoc
     */
    isFailed() {
        return this._state === FromBTCLNSwapState.FAILED || this._state === FromBTCLNSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === FromBTCLNSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired() {
        return this._state === FromBTCLNSwapState.QUOTE_EXPIRED || this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteDefinitelyExpired() {
        if (this._state === FromBTCLNSwapState.PR_CREATED || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
            return Promise.resolve(this.getDefinitiveExpiryTime() < Date.now());
        }
        return super._verifyQuoteDefinitelyExpired();
    }
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteValid() {
        if (this._state === FromBTCLNSwapState.PR_CREATED ||
            (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
            return Promise.resolve(this.getTimeoutTime() > Date.now());
        }
        return super._verifyQuoteValid();
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * @inheritDoc
     */
    getInputToken() {
        return Token_1.BitcoinTokens.BTCLN;
    }
    /**
     * @inheritDoc
     */
    getInput() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return (0, TokenAmount_1.toTokenAmount)(null, this.inputToken, this.wrapper._prices, this.pricingInfo);
        const parsed = (0, bolt11_1.decode)(this.pr);
        if (parsed.millisatoshis == null)
            throw new Error("Swap invoice doesn't contain msat amount field!");
        const amount = (BigInt(parsed.millisatoshis) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount, this.inputToken, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getSmartChainNetworkFee() {
        return this.getCommitAndClaimNetworkFee();
    }
    /**
     * @inheritDoc
     */
    async hasEnoughForTxFees() {
        const [balance, feeRate] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this.wrapper._chain.getNativeCurrencyAddress(), false),
            this.feeRate != null ? Promise.resolve(this.feeRate) : this.wrapper._contract.getInitFeeRate(this.getSwapData().getOfferer(), this.getSwapData().getClaimer(), this.getSwapData().getToken(), this.getSwapData().getClaimHash())
        ]);
        const commitFee = await this.wrapper._contract.getCommitFee(this._getInitiator(), this.getSwapData(), feeRate);
        const claimFee = await this.wrapper._contract.getClaimFee(this._getInitiator(), this.getSwapData(), feeRate);
        const totalFee = commitFee + claimFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: (0, TokenAmount_1.toTokenAmount)(balance, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo),
            required: (0, TokenAmount_1.toTokenAmount)(totalFee, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo)
        };
    }
    isValidSecretPreimage(secret) {
        const paymentHash = buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.from(secret, "hex")));
        const claimHash = this.wrapper._contract.getHashForHtlc(paymentHash).toString("hex");
        return this.getSwapData().getClaimHash() === claimHash;
    }
    /**
     * Sets the secret preimage for the swap, in case it is not known already
     *
     * @param secret Secret preimage that matches the expected payment hash
     *
     * @throws {Error} If an invalid secret preimage is provided
     */
    setSecretPreimage(secret) {
        if (!this.isValidSecretPreimage(secret))
            throw new Error("Invalid secret preimage provided, hash doesn't match!");
        this.secret = secret;
    }
    /**
     * Returns whether the secret preimage for this swap is known
     */
    hasSecretPreimage() {
        return this.secret != null;
    }
    //////////////////////////////
    //// Execution
    /**
     * Executes the swap with the provided bitcoin lightning network wallet or LNURL
     *
     * @param dstSigner Signer on the destination network, needs to have the same address as the one specified when
     *  quote was created, this is required for legacy swaps because the destination wallet needs to actively claim
     *  the swap funds on the destination (this also means you need native token to cover gas costs)
     * @param walletOrLnurlWithdraw Bitcoin lightning wallet to use to pay the lightning network invoice, or an LNURL-withdraw
     *  link, wallet is not required and the LN invoice can be paid externally as well (just pass null or undefined here)
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async execute(dstSigner, walletOrLnurlWithdraw, callbacks, options) {
        if (this._state === FromBTCLNSwapState.FAILED)
            throw new Error("Swap failed!");
        if (this._state === FromBTCLNSwapState.EXPIRED)
            throw new Error("Swap HTLC expired!");
        if (this._state === FromBTCLNSwapState.QUOTE_EXPIRED || this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Swap quote expired!");
        if (this._state === FromBTCLNSwapState.CLAIM_CLAIMED)
            throw new Error("Swap already settled!");
        let abortSignal = options?.abortSignal;
        if (this._state === FromBTCLNSwapState.PR_CREATED) {
            if (walletOrLnurlWithdraw != null && this.lnurl == null) {
                if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
                    throw new Error("Input lightning network invoice not available, the swap was probably recovered!");
                if (typeof (walletOrLnurlWithdraw) === "string" || (0, LNURLWithdraw_1.isLNURLWithdraw)(walletOrLnurlWithdraw)) {
                    await this.settleWithLNURLWithdraw(walletOrLnurlWithdraw);
                }
                else {
                    const paymentPromise = walletOrLnurlWithdraw.payInvoice(this.pr);
                    const abortController = new AbortController();
                    paymentPromise.catch(e => abortController.abort(e));
                    if (options?.abortSignal != null)
                        options.abortSignal.addEventListener("abort", () => abortController.abort(options?.abortSignal?.reason));
                    abortSignal = abortController.signal;
                }
            }
            const paymentSuccess = await this.waitForPayment(callbacks?.onSourceTransactionReceived, options?.lightningTxCheckIntervalSeconds, abortSignal);
            if (!paymentSuccess)
                throw new Error("Failed to receive lightning network payment");
        }
        if (this._state === FromBTCLNSwapState.PR_PAID || this._state === FromBTCLNSwapState.CLAIM_COMMITED) {
            if (this.canCommitAndClaimInOneShot()) {
                await this.commitAndClaim(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent, callbacks?.onDestinationClaimSent, options?.secret);
            }
            else {
                if (this._state === FromBTCLNSwapState.PR_PAID) {
                    await this.commit(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent);
                    if (options?.delayBetweenCommitAndClaimSeconds != null)
                        await (0, TimeoutUtils_1.timeoutPromise)(options.delayBetweenCommitAndClaimSeconds * 1000, options?.abortSignal);
                }
                if (this._state === FromBTCLNSwapState.CLAIM_COMMITED) {
                    await this.claim(dstSigner, options?.abortSignal, callbacks?.onDestinationClaimSent, options?.secret);
                }
            }
        }
        // @ts-ignore
        if (this._state === FromBTCLNSwapState.CLAIM_CLAIMED) {
            if (callbacks?.onSwapSettled != null)
                callbacks.onSwapSettled(this.getOutputTxId());
        }
    }
    /**
     * @inheritDoc
     *
     * @param options
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async txsExecute(options) {
        if (this._state === FromBTCLNSwapState.PR_CREATED) {
            if (!await this._verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment",
                    description: "Initiates the swap by paying up the lightning network invoice",
                    chain: "LIGHTNING",
                    txs: [
                        {
                            type: "BOLT11_PAYMENT_REQUEST",
                            address: this.getAddress(),
                            hyperlink: this.getHyperlink()
                        }
                    ]
                }
            ];
        }
        if (this._state === FromBTCLNSwapState.PR_PAID) {
            if (!await this._verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            const txsCommit = await this.txsCommit(options?.skipChecks);
            const txsClaim = await this._txsClaim(undefined, options?.secret);
            return [
                {
                    name: "Commit",
                    description: `Creates the HTLC escrow on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: txsCommit
                },
                {
                    name: "Claim",
                    description: `Settles & claims the funds from the HTLC escrow on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: txsClaim
                },
            ];
        }
        if (this._state === FromBTCLNSwapState.CLAIM_COMMITED) {
            const txsClaim = await this.txsClaim(undefined, options?.secret);
            return [
                {
                    name: "Claim",
                    description: `Settles & claims the funds from the HTLC escrow on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: txsClaim
                },
            ];
        }
        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED, PR_PAID or CLAIM_COMMITED");
    }
    /**
     * @inheritDoc
     *
     * @param options
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async getCurrentActions(options) {
        try {
            return await this.txsExecute(options);
        }
        catch (e) {
            return [];
        }
    }
    //////////////////////////////
    //// Payment
    /**
     * Checks whether the LP received the LN payment and we can continue by committing & claiming the HTLC on-chain
     *
     * @param save If the new swap state should be saved
     *
     * @internal
     */
    async _checkIntermediaryPaymentReceived(save = true) {
        if (this._state === FromBTCLNSwapState.PR_PAID ||
            this._state === FromBTCLNSwapState.CLAIM_COMMITED ||
            this._state === FromBTCLNSwapState.CLAIM_CLAIMED ||
            this._state === FromBTCLNSwapState.FAILED ||
            this._state === FromBTCLNSwapState.EXPIRED)
            return true;
        if (this._state === FromBTCLNSwapState.QUOTE_EXPIRED || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null))
            return false;
        if (this.url == null)
            return false;
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            throw new Error("Failed to check LP payment received, payment hash not known (probably recovered swap?)");
        const resp = await IntermediaryAPI_1.IntermediaryAPI.getPaymentAuthorization(this.url, paymentHash.toString("hex"));
        switch (resp.code) {
            case IntermediaryAPI_1.PaymentAuthorizationResponseCodes.AUTH_DATA:
                const data = new this.wrapper._swapDataDeserializer(resp.data.data);
                try {
                    await this.checkIntermediaryReturnedAuthData(this._getInitiator(), data, resp.data);
                    this.expiry = await this.wrapper._contract.getInitAuthorizationExpiry(data, resp.data);
                    this._state = FromBTCLNSwapState.PR_PAID;
                    this._data = data;
                    this.signatureData = {
                        prefix: resp.data.prefix,
                        timeout: resp.data.timeout,
                        signature: resp.data.signature
                    };
                    this.initiated = true;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                catch (e) { }
                return null;
            case IntermediaryAPI_1.PaymentAuthorizationResponseCodes.EXPIRED:
                this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
                this.initiated = true;
                if (save)
                    await this._saveAndEmit();
                return false;
            default:
                return null;
        }
    }
    /**
     * Checks the data returned by the intermediary in the payment auth request
     *
     * @param signer Smart chain signer's address initiating the swap
     * @param data Parsed swap data as returned by the intermediary
     * @param signature Signature data as returned by the intermediary
     *
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {SignatureVerificationError} If the returned signature is not valid
     * @throws {Error} If the swap is already committed on-chain
     *
     * @internal
     */
    async checkIntermediaryReturnedAuthData(signer, data, signature) {
        data.setClaimer(signer);
        if (data.getType() !== base_1.ChainSwapType.HTLC)
            throw new IntermediaryError_1.IntermediaryError("Invalid swap type");
        if (!data.isOfferer(this.getSwapData().getOfferer()))
            throw new IntermediaryError_1.IntermediaryError("Invalid offerer used");
        if (!data.isClaimer(this._getInitiator()))
            throw new IntermediaryError_1.IntermediaryError("Invalid claimer used");
        if (!data.isToken(this.getSwapData().getToken()))
            throw new IntermediaryError_1.IntermediaryError("Invalid token used");
        if (data.getSecurityDeposit() > this.getSwapData().getSecurityDeposit())
            throw new IntermediaryError_1.IntermediaryError("Invalid security deposit!");
        if (data.getClaimerBounty() !== 0n)
            throw new IntermediaryError_1.IntermediaryError("Invalid claimer bounty!");
        if (data.getAmount() < this.getSwapData().getAmount())
            throw new IntermediaryError_1.IntermediaryError("Invalid amount received!");
        if (data.getClaimHash() !== this.getSwapData().getClaimHash())
            throw new IntermediaryError_1.IntermediaryError("Invalid payment hash used!");
        if (!data.isDepositToken(this.getSwapData().getDepositToken()))
            throw new IntermediaryError_1.IntermediaryError("Invalid deposit token used!");
        if (data.hasSuccessAction())
            throw new IntermediaryError_1.IntermediaryError("Invalid has success action");
        await Promise.all([
            this.wrapper._contract.isValidInitAuthorization(this._getInitiator(), data, signature, this.feeRate),
            this.wrapper._contract.getCommitStatus(data.getClaimer(), data)
                .then(status => {
                if (status?.type !== base_1.SwapCommitStateType.NOT_COMMITED)
                    throw new Error("Swap already committed on-chain!");
            })
        ]);
    }
    /**
     * Waits till a lightning network payment is received by the intermediary and client
     *  can continue by initiating (committing) & settling (claiming) the HTLC by calling
     *  either the {@link commitAndClaim} function (if the underlying chain allows commit
     *  and claim in a single transaction - check with {@link canCommitAndClaimInOneShot}).
     *  Or call {@link commit} and then {@link claim} separately.
     *
     * If this swap is using an LNURL-withdraw link as input, it automatically posts the
     *  generated invoice to the LNURL service to pay it.
     *
     * @param onPaymentReceived Callback as for when the LP reports having received the ln payment
     * @param abortSignal Abort signal to stop waiting for payment
     * @param checkIntervalSeconds How often to poll the intermediary for answer (default 5 seconds)
     */
    async waitForPayment(onPaymentReceived, checkIntervalSeconds, abortSignal) {
        checkIntervalSeconds ??= 5;
        if (this._state !== FromBTCLNSwapState.PR_CREATED &&
            (this._state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData != null))
            throw new Error("Must be in PR_CREATED state!");
        if (this.url == null)
            throw new Error("LP URL not known, cannot await the payment!");
        const abortController = new AbortController();
        if (abortSignal != null)
            abortSignal.addEventListener("abort", () => abortController.abort(abortSignal.reason));
        let save = false;
        if (this.lnurl != null && this.lnurlK1 != null && this.lnurlCallback != null && !this.prPosted) {
            if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
                throw new Error("Input lightning network invoice not available, the swap was probably recovered!");
            LNURL_1.LNURL.postInvoiceToLNURLWithdraw({ k1: this.lnurlK1, callback: this.lnurlCallback }, this.pr).catch(e => {
                this.lnurlFailSignal.abort(e);
            });
            this.prPosted = true;
            save ||= true;
        }
        if (!this.initiated) {
            this.initiated = true;
            save ||= true;
        }
        if (save)
            await this._saveAndEmit();
        let lnurlFailListener = () => abortController.abort(this.lnurlFailSignal.signal.reason);
        this.lnurlFailSignal.signal.addEventListener("abort", lnurlFailListener);
        this.lnurlFailSignal.signal.throwIfAborted();
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            throw new Error("Swap payment hash not available, the swap was probably recovered!");
        let resp = { code: IntermediaryAPI_1.PaymentAuthorizationResponseCodes.PENDING, msg: "" };
        while (!abortController.signal.aborted && resp.code === IntermediaryAPI_1.PaymentAuthorizationResponseCodes.PENDING) {
            resp = await IntermediaryAPI_1.IntermediaryAPI.getPaymentAuthorization(this.url, paymentHash.toString("hex"));
            if (resp.code === IntermediaryAPI_1.PaymentAuthorizationResponseCodes.PENDING)
                await (0, TimeoutUtils_1.timeoutPromise)(checkIntervalSeconds * 1000, abortController.signal);
        }
        this.lnurlFailSignal.signal.removeEventListener("abort", lnurlFailListener);
        abortController.signal.throwIfAborted();
        if (resp.code === IntermediaryAPI_1.PaymentAuthorizationResponseCodes.AUTH_DATA) {
            const sigData = resp.data;
            const swapData = new this.wrapper._swapDataDeserializer(resp.data.data);
            await this.checkIntermediaryReturnedAuthData(this._getInitiator(), swapData, sigData);
            this.expiry = await this.wrapper._contract.getInitAuthorizationExpiry(swapData, sigData);
            if (onPaymentReceived != null)
                onPaymentReceived(this.getInputTxId());
            if (this._state === FromBTCLNSwapState.PR_CREATED || this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
                this._data = swapData;
                this.signatureData = {
                    prefix: sigData.prefix,
                    timeout: sigData.timeout,
                    signature: sigData.signature
                };
                await this._saveAndEmit(FromBTCLNSwapState.PR_PAID);
            }
            return true;
        }
        if (this._state === FromBTCLNSwapState.PR_CREATED || this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            if (resp.code === IntermediaryAPI_1.PaymentAuthorizationResponseCodes.EXPIRED) {
                await this._saveAndEmit(FromBTCLNSwapState.QUOTE_EXPIRED);
            }
            return false;
        }
        throw new IntermediaryError_1.IntermediaryError("Invalid response from the LP");
    }
    //////////////////////////////
    //// Commit
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commit(_signer, abortSignal, skipChecks, onBeforeTxSent) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        this.checkSigner(signer);
        let txCount = 0;
        const txs = await this.txsCommit(skipChecks);
        const result = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === txs.length)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this._commitTxId = result[result.length - 1];
        if (this._state === FromBTCLNSwapState.PR_PAID || this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_COMMITED);
        }
        return this._commitTxId;
    }
    /**
     * @inheritDoc
     */
    async waitTillCommited(abortSignal) {
        if (this._state === FromBTCLNSwapState.CLAIM_COMMITED || this._state === FromBTCLNSwapState.CLAIM_CLAIMED)
            return Promise.resolve();
        if (this._state !== FromBTCLNSwapState.PR_PAID && (this._state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null))
            throw new Error("Invalid state");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const result = await Promise.race([
            this.watchdogWaitTillCommited(undefined, abortController.signal),
            this.waitTillState(FromBTCLNSwapState.CLAIM_COMMITED, "gte", abortController.signal).then(() => 0)
        ]);
        abortController.abort();
        if (result === 0)
            this.logger.debug("waitTillCommited(): Resolved from state changed");
        if (result === true)
            this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
        if (result === false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - signature expired");
            if (this._state === FromBTCLNSwapState.PR_PAID ||
                this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
                await this._saveAndEmit(FromBTCLNSwapState.QUOTE_EXPIRED);
            }
            return;
        }
        if (this._state === FromBTCLNSwapState.PR_PAID ||
            this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_COMMITED);
        }
    }
    //////////////////////////////
    //// Claim
    /**
     * Unsafe txs claim getter without state checking!
     *
     * @param _signer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @internal
     */
    async _txsClaim(_signer, secret) {
        if (this._data == null)
            throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if (useSecret == null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if (!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");
        return this.wrapper._contract.txsClaimWithSecret(_signer == null ?
            this._getInitiator() :
            ((0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer)), this._data, useSecret, true, true);
    }
    /**
     * @inheritDoc
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be {@link FromBTCLNSwapState.CLAIM_COMMITED})
     */
    async txsClaim(_signer, secret) {
        if (this._state !== FromBTCLNSwapState.CLAIM_COMMITED)
            throw new Error("Must be in CLAIM_COMMITED state!");
        return this._txsClaim(_signer, secret);
    }
    /**
     * @inheritDoc
     *
     * @param _signer
     * @param abortSignal
     * @param onBeforeTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async claim(_signer, abortSignal, onBeforeTxSent, secret) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        let txCount = 0;
        const result = await this.wrapper._chain.sendAndConfirm(signer, await this.txsClaim(_signer, secret), true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === 1)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this._claimTxId = result[0];
        if (this._state === FromBTCLNSwapState.CLAIM_COMMITED || this._state === FromBTCLNSwapState.EXPIRED || this._state === FromBTCLNSwapState.FAILED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
        }
        return result[0];
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCLNSwapState.CLAIM_COMMITED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     */
    async waitTillClaimed(maxWaitTimeSeconds, abortSignal) {
        if (this._state === FromBTCLNSwapState.CLAIM_CLAIMED)
            return Promise.resolve(true);
        if (this._state !== FromBTCLNSwapState.CLAIM_COMMITED)
            throw new Error("Invalid state (not CLAIM_COMMITED)");
        const abortController = new AbortController();
        if (abortSignal != null)
            abortSignal.addEventListener("abort", () => abortController.abort(abortSignal.reason));
        let timedOut = false;
        if (maxWaitTimeSeconds != null) {
            const timeout = setTimeout(() => {
                timedOut = true;
                abortController.abort();
            }, maxWaitTimeSeconds * 1000);
            abortController.signal.addEventListener("abort", () => clearTimeout(timeout));
        }
        let res;
        try {
            res = await Promise.race([
                this.watchdogWaitTillResult(undefined, abortController.signal),
                this.waitTillState(FromBTCLNSwapState.CLAIM_CLAIMED, "eq", abortController.signal).then(() => 0),
                this.waitTillState(FromBTCLNSwapState.EXPIRED, "eq", abortController.signal).then(() => 1),
            ]);
            abortController.abort();
        }
        catch (e) {
            abortController.abort();
            if (timedOut)
                return false;
            throw e;
        }
        if (res === 0) {
            this.logger.debug("waitTillClaimed(): Resolved from state change (CLAIM_CLAIMED)");
            return true;
        }
        if (res === 1) {
            this.logger.debug("waitTillClaimed(): Resolved from state change (EXPIRED)");
            throw new Error("Swap expired during claiming");
        }
        this.logger.debug("waitTillClaimed(): Resolved from watchdog");
        if (res?.type === base_1.SwapCommitStateType.PAID) {
            if (this._state !== FromBTCLNSwapState.CLAIM_CLAIMED) {
                this._claimTxId = await res.getClaimTxId();
                await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
            }
        }
        if (res?.type === base_1.SwapCommitStateType.NOT_COMMITED || res?.type === base_1.SwapCommitStateType.EXPIRED) {
            if (this._state !== FromBTCLNSwapState.CLAIM_CLAIMED &&
                this._state !== FromBTCLNSwapState.FAILED) {
                if (res.getRefundTxId != null)
                    this._refundTxId = await res.getRefundTxId();
                await this._saveAndEmit(FromBTCLNSwapState.FAILED);
            }
            throw new Error("Swap expired while waiting for claim!");
        }
        return true;
    }
    //////////////////////////////
    //// Commit & claim
    /**
     * Estimated transaction fee for commit & claim transactions combined, required
     *  to settle the swap on the smart chain destination side.
     */
    async getCommitAndClaimNetworkFee() {
        const swapContract = this.wrapper._contract;
        const feeRate = this.feeRate ?? await swapContract.getInitFeeRate(this.getSwapData().getOfferer(), this.getSwapData().getClaimer(), this.getSwapData().getToken(), this.getSwapData().getClaimHash());
        const commitFee = await (swapContract.getRawCommitFee != null ?
            swapContract.getRawCommitFee(this._getInitiator(), this.getSwapData(), feeRate) :
            swapContract.getCommitFee(this._getInitiator(), this.getSwapData(), feeRate));
        const claimFee = await (swapContract.getRawClaimFee != null ?
            swapContract.getRawClaimFee(this._getInitiator(), this.getSwapData(), feeRate) :
            swapContract.getClaimFee(this._getInitiator(), this.getSwapData(), feeRate));
        return (0, TokenAmount_1.toTokenAmount)(commitFee + claimFee, this.wrapper._getNativeToken(), this.wrapper._prices);
    }
    /**
     * Returns whether the underlying chain supports calling commit and claim in a single call,
     *  such that you can use the {@link commitAndClaim} function. If not you have to manually
     *  call {@link commit} first and then {@link claim}.
     */
    canCommitAndClaimInOneShot() {
        return this.wrapper._contract.initAndClaimWithSecret != null;
    }
    /**
     * Returns transactions for both commit & claim operation together, such that they can be signed all at once by
     *  the wallet. **WARNING**: transactions must be sent sequentially, such that the claim (2nd) transaction is only
     *  sent after the commit (1st) transaction confirms. Failure to do so can reveal the HTLC pre-image too soon,
     *  opening a possibility for the LP to steal funds!
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     */
    async txsCommitAndClaim(skipChecks, secret) {
        if (this._state === FromBTCLNSwapState.CLAIM_COMMITED)
            return await this.txsClaim(undefined, secret);
        if (this._state !== FromBTCLNSwapState.PR_PAID &&
            (this._state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData == null))
            throw new Error("Must be in PR_PAID state!");
        if (this._data == null)
            throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if (useSecret == null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as second argument");
        if (!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");
        const initTxs = await this.txsCommit(skipChecks);
        const claimTxs = await this.wrapper._contract.txsClaimWithSecret(this._getInitiator(), this._data, useSecret, true, true, undefined, true);
        return initTxs.concat(claimTxs);
    }
    /**
     * Commits and claims the swap, in a way that the transactions can be signed together by the provided signer and
     *  then automatically sent sequentially by the SDK. To check if the underlying chain supports this flow check
     *  the {@link canCommitAndClaimInOneShot} function.
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal to stop waiting for the transaction confirmation and abort
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param onBeforeCommitTxSent Optional callback called before the initialization (commit) transaction is
     *  broadcasted
     * @param onBeforeClaimTxSent Optional callback called before the settlement (claim) transaction is
     *  broadcasted
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commitAndClaim(_signer, abortSignal, skipChecks, onBeforeCommitTxSent, onBeforeClaimTxSent, secret) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        if (!this.canCommitAndClaimInOneShot())
            throw new Error("Cannot commitAndClaim in single action, please run commit and claim separately!");
        this.checkSigner(signer);
        if (this._state === FromBTCLNSwapState.CLAIM_COMMITED)
            return [await this.claim(signer, abortSignal, onBeforeClaimTxSent, secret)];
        let txCount = 0;
        const txs = await this.txsCommitAndClaim(skipChecks, secret);
        const result = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeCommitTxSent != null && txCount === 1)
                onBeforeCommitTxSent(txId);
            if (onBeforeClaimTxSent != null && txCount === txs.length)
                onBeforeClaimTxSent(txId);
            return Promise.resolve();
        });
        this._commitTxId = result[0] ?? this._commitTxId;
        this._claimTxId = result[result.length - 1] ?? this._claimTxId;
        if (this._state !== FromBTCLNSwapState.CLAIM_CLAIMED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
        }
        return result;
    }
    //////////////////////////////
    //// LNURL
    /**
     * Whether this swap uses an LNURL-withdraw link
     */
    isLNURL() {
        return this.lnurl != null;
    }
    /**
     * Gets the used LNURL or `null` if this is not an LNURL-withdraw swap
     */
    getLNURL() {
        return this.lnurl ?? null;
    }
    /**
     * Pay the generated lightning network invoice with an LNURL-withdraw link, this
     *  is useful when you want to display a lightning payment QR code and also want to
     *  allow payments using LNURL-withdraw NFC cards.
     *
     * Note that the swap needs to be created **without** an LNURL to begin with for this function
     *  to work. If this swap is already using an LNURL-withdraw link, this function throws.
     */
    async settleWithLNURLWithdraw(lnurl) {
        if (this._state !== FromBTCLNSwapState.PR_CREATED &&
            (this._state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData != null))
            throw new Error("Must be in PR_CREATED state!");
        if (this.lnurl != null)
            throw new Error("Cannot settle LNURL-withdraw swap with different LNURL");
        let lnurlParams;
        if (typeof (lnurl) === "string") {
            const parsedLNURL = await LNURL_1.LNURL.getLNURL(lnurl);
            if (parsedLNURL == null || parsedLNURL.tag !== "withdrawRequest")
                throw new UserError_1.UserError("Invalid LNURL-withdraw to settle the swap");
            lnurlParams = parsedLNURL;
        }
        else {
            lnurlParams = lnurl.params;
        }
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            throw new Error("Input lightning network invoice not available, the swap was probably recovered!");
        LNURL_1.LNURL.useLNURLWithdraw(lnurlParams, this.pr).catch(e => this.lnurlFailSignal.abort(e));
        this.lnurl = lnurlParams.url;
        this.lnurlCallback = lnurlParams.callback;
        this.lnurlK1 = lnurlParams.k1;
        this.prPosted = true;
        await this._saveAndEmit();
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
    serialize() {
        return {
            ...super.serialize(),
            pr: this.pr,
            secret: this.secret,
            lnurl: this.lnurl,
            lnurlK1: this.lnurlK1,
            lnurlCallback: this.lnurlCallback,
            prPosted: this.prPosted,
            initialSwapData: this.initialSwapData.serialize(),
            usesClaimHashAsId: this.usesClaimHashAsId
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
        if (this._state === FromBTCLNSwapState.PR_PAID ||
            (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null) ||
            this._state === FromBTCLNSwapState.CLAIM_COMMITED ||
            this._state === FromBTCLNSwapState.EXPIRED) {
            //Check for expiry before the getCommitStatus to prevent race conditions
            let quoteExpired = false;
            if (this._state === FromBTCLNSwapState.PR_PAID || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null)) {
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }
            //Check if it's already successfully paid
            commitStatus ??= await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            if (commitStatus != null && await this._forciblySetOnchainState(commitStatus))
                return true;
            //Set the state on expiry here
            if (this._state === FromBTCLNSwapState.PR_PAID || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null)) {
                if (quoteExpired) {
                    this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
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
    _shouldFetchExpiryStatus() {
        return this._state === FromBTCLNSwapState.PR_PAID || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null);
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState() {
        return this._state === FromBTCLNSwapState.PR_PAID || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null) ||
            this._state === FromBTCLNSwapState.CLAIM_COMMITED || this._state === FromBTCLNSwapState.EXPIRED;
    }
    /**
     * Whether an intermediary (LP) should be contacted to get the state of this swap.
     *
     * @internal
     */
    _shouldCheckIntermediary() {
        return this._state === FromBTCLNSwapState.PR_CREATED || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null);
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save, quoteDefinitelyExpired, commitStatus, skipLpCheck) {
        let changed = false;
        if (this._state === FromBTCLNSwapState.PR_CREATED || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
            if (this._state != FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.getTimeoutTime() < Date.now()) {
                this._state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                changed ||= true;
            }
            if (!skipLpCheck)
                try {
                    const result = await this._checkIntermediaryPaymentReceived(false);
                    if (result !== null)
                        changed ||= true;
                }
                catch (e) {
                    this.logger.error("_sync(): Failed to synchronize swap, error: ", e);
                }
            if (this._state === FromBTCLNSwapState.PR_CREATED || (this._state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
                if (await this._verifyQuoteDefinitelyExpired()) {
                    this._state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    changed ||= true;
                }
            }
        }
        if (await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus))
            changed = true;
        if (this._state === FromBTCLNSwapState.CLAIM_COMMITED) {
            const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data);
            if (expired) {
                this._state = FromBTCLNSwapState.EXPIRED;
                changed = true;
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
                if (this._claimTxId == null)
                    this._claimTxId = await commitStatus.getClaimTxId();
                if (this.secret == null || this.pr == null)
                    this._setSwapSecret(await commitStatus.getClaimResult());
                this._state = FromBTCLNSwapState.CLAIM_CLAIMED;
                return true;
            case base_1.SwapCommitStateType.NOT_COMMITED:
                if (this._refundTxId == null && commitStatus.getRefundTxId)
                    this._refundTxId = await commitStatus.getRefundTxId();
                if (this._refundTxId != null) {
                    this._state = FromBTCLNSwapState.FAILED;
                    return true;
                }
                break;
            case base_1.SwapCommitStateType.EXPIRED:
                if (this._refundTxId == null && commitStatus.getRefundTxId)
                    this._refundTxId = await commitStatus.getRefundTxId();
                this._state = this._refundTxId == null ? FromBTCLNSwapState.QUOTE_EXPIRED : FromBTCLNSwapState.FAILED;
                return true;
            case base_1.SwapCommitStateType.COMMITED:
                if (this._state !== FromBTCLNSwapState.CLAIM_COMMITED && this._state !== FromBTCLNSwapState.EXPIRED) {
                    this._state = FromBTCLNSwapState.CLAIM_COMMITED;
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
            case FromBTCLNSwapState.PR_CREATED:
                if (this.getTimeoutTime() < Date.now()) {
                    this._state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNSwapState.PR_PAID:
                if (this.expiry < Date.now()) {
                    this._state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNSwapState.CLAIM_COMMITED:
                const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data);
                if (expired) {
                    this._state = FromBTCLNSwapState.EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
        }
        return false;
    }
    /**
     * Forcibly sets the swap secret pre-image from on-chain data
     *
     * @internal
     */
    _setSwapSecret(secret) {
        this.secret = secret;
        if (this.pr == null) {
            this.pr = buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.from(secret, "hex"))).toString("hex");
        }
    }
}
exports.FromBTCLNSwap = FromBTCLNSwap;
