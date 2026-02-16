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
 * State enum for FromBTCLN swaps
 * @category Swaps
 */
var FromBTCLNSwapState;
(function (FromBTCLNSwapState) {
    FromBTCLNSwapState[FromBTCLNSwapState["FAILED"] = -4] = "FAILED";
    FromBTCLNSwapState[FromBTCLNSwapState["QUOTE_EXPIRED"] = -3] = "QUOTE_EXPIRED";
    FromBTCLNSwapState[FromBTCLNSwapState["QUOTE_SOFT_EXPIRED"] = -2] = "QUOTE_SOFT_EXPIRED";
    FromBTCLNSwapState[FromBTCLNSwapState["EXPIRED"] = -1] = "EXPIRED";
    FromBTCLNSwapState[FromBTCLNSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    FromBTCLNSwapState[FromBTCLNSwapState["PR_PAID"] = 1] = "PR_PAID";
    FromBTCLNSwapState[FromBTCLNSwapState["CLAIM_COMMITED"] = 2] = "CLAIM_COMMITED";
    FromBTCLNSwapState[FromBTCLNSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCLNSwapState = exports.FromBTCLNSwapState || (exports.FromBTCLNSwapState = {}));
function isFromBTCLNSwapInit(obj) {
    return (obj.pr == null || typeof obj.pr === "string") &&
        (obj.secret == null || typeof obj.secret === "string") &&
        (obj.lnurl == null || typeof (obj.lnurl) === "string") &&
        (obj.lnurlK1 == null || typeof (obj.lnurlK1) === "string") &&
        (obj.lnurlCallback == null || typeof (obj.lnurlCallback) === "string") &&
        (0, IEscrowSelfInitSwap_1.isIEscrowSelfInitSwapInit)(obj);
}
exports.isFromBTCLNSwapInit = isFromBTCLNSwapInit;
class FromBTCLNSwap extends IFromBTCSelfInitSwap_1.IFromBTCSelfInitSwap {
    getSwapData() {
        return this.data ?? this.initialSwapData;
    }
    constructor(wrapper, initOrObject) {
        if (isFromBTCLNSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/frombtcln";
        super(wrapper, initOrObject);
        this.inputToken = Token_1.BitcoinTokens.BTCLN;
        this.TYPE = SwapType_1.SwapType.FROM_BTCLN;
        this.lnurlFailSignal = new AbortController();
        this.prPosted = false;
        if (isFromBTCLNSwapInit(initOrObject)) {
            this.state = FromBTCLNSwapState.PR_CREATED;
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
                this.initialSwapData = this.data;
            }
            else {
                this.initialSwapData = base_1.SwapData.deserialize(initOrObject.initialSwapData);
            }
            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.prPosted = initOrObject.prPosted;
            if (this.state === FromBTCLNSwapState.PR_CREATED && this.data != null) {
                this.initialSwapData = this.data;
                delete this.data;
            }
            this.usesClaimHashAsId = initOrObject.usesClaimHashAsId ?? false;
        }
        this.tryRecomputeSwapPrice();
        this.logger = (0, Logger_1.getLogger)("FromBTCLN(" + this.getIdentifierHashString() + "): ");
    }
    upgradeVersion() {
        if (this.version == null) {
            switch (this.state) {
                case -2:
                    this.state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    break;
                case -1:
                    this.state = FromBTCLNSwapState.FAILED;
                    break;
                case 0:
                    this.state = FromBTCLNSwapState.PR_CREATED;
                    break;
                case 1:
                    this.state = FromBTCLNSwapState.PR_PAID;
                    break;
                case 2:
                    this.state = FromBTCLNSwapState.CLAIM_COMMITED;
                    break;
                case 3:
                    this.state = FromBTCLNSwapState.CLAIM_CLAIMED;
                    break;
            }
            this.version = 1;
        }
    }
    //////////////////////////////
    //// Getters & utils
    getIdentifierHash() {
        const idBuffer = this.usesClaimHashAsId
            ? buffer_1.Buffer.from(this.getClaimHash(), "hex")
            : this.getPaymentHash();
        if (this.randomNonce == null)
            return idBuffer;
        return buffer_1.Buffer.concat([idBuffer, buffer_1.Buffer.from(this.randomNonce, "hex")]);
    }
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
    canCommit() {
        return this.state === FromBTCLNSwapState.PR_PAID;
    }
    getInputAddress() {
        return this.lnurl ?? this.pr ?? null;
    }
    getInputTxId() {
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            return null;
        return paymentHash.toString("hex");
    }
    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress() {
        return this.pr ?? "";
    }
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
        const finalCltvExpiryDelay = finalCltvExpiryDelta * this.wrapper.options.bitcoinBlocktime * this.wrapper.options.safetyFactor;
        return (decoded.timeExpireDate + finalCltvExpiryDelay) * 1000;
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
     * Returns timeout time (in UNIX milliseconds) when the swap htlc will expire
     */
    getHtlcTimeoutTime() {
        if (this.data == null)
            return -1;
        return Number(this.wrapper.getHtlcTimeout(this.data)) * 1000;
    }
    isFinished() {
        return this.state === FromBTCLNSwapState.CLAIM_CLAIMED || this.state === FromBTCLNSwapState.QUOTE_EXPIRED || this.state === FromBTCLNSwapState.FAILED;
    }
    isClaimable() {
        return this.state === FromBTCLNSwapState.CLAIM_COMMITED;
    }
    isSuccessful() {
        return this.state === FromBTCLNSwapState.CLAIM_CLAIMED;
    }
    isFailed() {
        return this.state === FromBTCLNSwapState.FAILED || this.state === FromBTCLNSwapState.EXPIRED;
    }
    isQuoteExpired() {
        return this.state === FromBTCLNSwapState.QUOTE_EXPIRED;
    }
    isQuoteSoftExpired() {
        return this.state === FromBTCLNSwapState.QUOTE_EXPIRED || this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
    }
    _verifyQuoteDefinitelyExpired() {
        if (this.state === FromBTCLNSwapState.PR_CREATED || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
            return Promise.resolve(this.getDefinitiveExpiryTime() < Date.now());
        }
        return super._verifyQuoteDefinitelyExpired();
    }
    verifyQuoteValid() {
        if (this.state === FromBTCLNSwapState.PR_CREATED ||
            (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
            return Promise.resolve(this.getTimeoutTime() > Date.now());
        }
        return super.verifyQuoteValid();
    }
    //////////////////////////////
    //// Amounts & fees
    getInputToken() {
        return Token_1.BitcoinTokens.BTCLN;
    }
    getInput() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return (0, TokenAmount_1.toTokenAmount)(null, this.inputToken, this.wrapper.prices, this.pricingInfo);
        const parsed = (0, bolt11_1.decode)(this.pr);
        if (parsed.millisatoshis == null)
            throw new Error("Swap invoice doesn't contain msat amount field!");
        const amount = (BigInt(parsed.millisatoshis) + 999n) / 1000n;
        return (0, TokenAmount_1.toTokenAmount)(amount, this.inputToken, this.wrapper.prices, this.pricingInfo);
    }
    async getSmartChainNetworkFee() {
        return (0, TokenAmount_1.toTokenAmount)(await this.getCommitAndClaimFee(), this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo);
    }
    async hasEnoughForTxFees() {
        const [balance, feeRate] = await Promise.all([
            this.wrapper.contract.getBalance(this._getInitiator(), this.wrapper.chain.getNativeCurrencyAddress(), false),
            this.feeRate != null ? Promise.resolve(this.feeRate) : this.wrapper.contract.getInitFeeRate(this.getSwapData().getOfferer(), this.getSwapData().getClaimer(), this.getSwapData().getToken(), this.getSwapData().getClaimHash())
        ]);
        const commitFee = await this.wrapper.contract.getCommitFee(this._getInitiator(), this.getSwapData(), feeRate);
        const claimFee = await this.wrapper.contract.getClaimFee(this._getInitiator(), this.getSwapData(), feeRate);
        const totalFee = commitFee + claimFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: (0, TokenAmount_1.toTokenAmount)(balance, this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo),
            required: (0, TokenAmount_1.toTokenAmount)(totalFee, this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo)
        };
    }
    isValidSecretPreimage(secret) {
        const paymentHash = buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.from(secret, "hex")));
        const claimHash = this.wrapper.contract.getHashForHtlc(paymentHash).toString("hex");
        return this.getSwapData().getClaimHash() === claimHash;
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
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async execute(dstSigner, walletOrLnurlWithdraw, callbacks, options, secret) {
        if (this.state === FromBTCLNSwapState.FAILED)
            throw new Error("Swap failed!");
        if (this.state === FromBTCLNSwapState.EXPIRED)
            throw new Error("Swap HTLC expired!");
        if (this.state === FromBTCLNSwapState.QUOTE_EXPIRED || this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Swap quote expired!");
        if (this.state === FromBTCLNSwapState.CLAIM_CLAIMED)
            throw new Error("Swap already settled!");
        let abortSignal = options?.abortSignal;
        if (this.state === FromBTCLNSwapState.PR_CREATED) {
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
        if (this.state === FromBTCLNSwapState.PR_PAID || this.state === FromBTCLNSwapState.CLAIM_COMMITED) {
            if (this.canCommitAndClaimInOneShot()) {
                await this.commitAndClaim(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent, callbacks?.onDestinationClaimSent, secret);
            }
            else {
                if (this.state === FromBTCLNSwapState.PR_PAID) {
                    await this.commit(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent);
                    if (options?.delayBetweenCommitAndClaimSeconds != null)
                        await (0, TimeoutUtils_1.timeoutPromise)(options.delayBetweenCommitAndClaimSeconds * 1000, options?.abortSignal);
                }
                if (this.state === FromBTCLNSwapState.CLAIM_COMMITED) {
                    await this.claim(dstSigner, options?.abortSignal, callbacks?.onDestinationClaimSent, secret);
                }
            }
        }
        // @ts-ignore
        if (this.state === FromBTCLNSwapState.CLAIM_CLAIMED) {
            if (callbacks?.onSwapSettled != null)
                callbacks.onSwapSettled(this.getOutputTxId());
        }
    }
    /**
     * Returns currently required execution step to execute the swap
     *
     * @param options Optional options for the swap
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async txsExecute(options, secret) {
        if (this.state === FromBTCLNSwapState.PR_CREATED) {
            if (!await this.verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment",
                    description: "Initiates the swap by paying up the lightning network invoice",
                    chain: "LIGHTNING",
                    txs: [
                        {
                            address: this.pr,
                            hyperlink: this.getHyperlink()
                        }
                    ]
                }
            ];
        }
        if (this.state === FromBTCLNSwapState.PR_PAID) {
            if (!await this.verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            const txsCommit = await this.txsCommit(options?.skipChecks);
            const txsClaim = await this._txsClaim(undefined, secret);
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
        if (this.state === FromBTCLNSwapState.CLAIM_COMMITED) {
            const txsClaim = await this.txsClaim(undefined, secret);
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
    //////////////////////////////
    //// Payment
    /**
     * Checks whether the LP received the LN payment and we can continue by committing & claiming the HTLC on-chain
     *
     * @param save If the new swap state should be saved
     */
    async _checkIntermediaryPaymentReceived(save = true) {
        if (this.state === FromBTCLNSwapState.PR_PAID ||
            this.state === FromBTCLNSwapState.CLAIM_COMMITED ||
            this.state === FromBTCLNSwapState.CLAIM_CLAIMED ||
            this.state === FromBTCLNSwapState.FAILED ||
            this.state === FromBTCLNSwapState.EXPIRED)
            return true;
        if (this.state === FromBTCLNSwapState.QUOTE_EXPIRED || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null))
            return false;
        if (this.url == null)
            return false;
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            throw new Error("Failed to check LP payment received, payment hash not known (probably recovered swap?)");
        const resp = await IntermediaryAPI_1.IntermediaryAPI.getPaymentAuthorization(this.url, paymentHash.toString("hex"));
        switch (resp.code) {
            case IntermediaryAPI_1.PaymentAuthorizationResponseCodes.AUTH_DATA:
                const data = new this.wrapper.swapDataDeserializer(resp.data.data);
                try {
                    await this.checkIntermediaryReturnedAuthData(this._getInitiator(), data, resp.data);
                    this.expiry = await this.wrapper.contract.getInitAuthorizationExpiry(data, resp.data);
                    this.state = FromBTCLNSwapState.PR_PAID;
                    this.data = data;
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
                this.state = FromBTCLNSwapState.QUOTE_EXPIRED;
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
     * @protected
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {SignatureVerificationError} If the returned signature is not valid
     * @throws {Error} If the swap is already committed on-chain
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
            this.wrapper.contract.isValidInitAuthorization(this._getInitiator(), data, signature, this.feeRate),
            this.wrapper.contract.getCommitStatus(data.getClaimer(), data)
                .then(status => {
                if (status?.type !== base_1.SwapCommitStateType.NOT_COMMITED)
                    throw new Error("Swap already committed on-chain!");
            })
        ]);
    }
    /**
     * Waits till an LN payment is received by the intermediary and client can continue commiting & claiming the HTLC
     *
     * @param onPaymentReceived Callback as for when the LP reports having received the ln payment
     * @param abortSignal Abort signal to stop waiting for payment
     * @param checkIntervalSeconds How often to poll the intermediary for answer
     */
    async waitForPayment(onPaymentReceived, checkIntervalSeconds, abortSignal) {
        checkIntervalSeconds ??= 5;
        if (this.state !== FromBTCLNSwapState.PR_CREATED &&
            (this.state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData != null))
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
            const swapData = new this.wrapper.swapDataDeserializer(resp.data.data);
            await this.checkIntermediaryReturnedAuthData(this._getInitiator(), swapData, sigData);
            this.expiry = await this.wrapper.contract.getInitAuthorizationExpiry(swapData, sigData);
            if (onPaymentReceived != null)
                onPaymentReceived(this.getInputTxId());
            if (this.state === FromBTCLNSwapState.PR_CREATED || this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
                this.data = swapData;
                this.signatureData = {
                    prefix: sigData.prefix,
                    timeout: sigData.timeout,
                    signature: sigData.signature
                };
                await this._saveAndEmit(FromBTCLNSwapState.PR_PAID);
            }
            return true;
        }
        if (this.state === FromBTCLNSwapState.PR_CREATED || this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
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
     * Commits the swap on-chain, locking the tokens from the intermediary in an HTLC
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal to stop waiting for the transaction confirmation and abort
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param onBeforeTxSent
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commit(_signer, abortSignal, skipChecks, onBeforeTxSent) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper.chain.wrapSigner(_signer);
        this.checkSigner(signer);
        let txCount = 0;
        const txs = await this.txsCommit(skipChecks);
        const result = await this.wrapper.chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === txs.length)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this.commitTxId = result[result.length - 1];
        if (this.state === FromBTCLNSwapState.PR_PAID || this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_COMMITED);
        }
        return this.commitTxId;
    }
    async waitTillCommited(abortSignal) {
        if (this.state === FromBTCLNSwapState.CLAIM_COMMITED || this.state === FromBTCLNSwapState.CLAIM_CLAIMED)
            return Promise.resolve();
        if (this.state !== FromBTCLNSwapState.PR_PAID && (this.state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null))
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
            if (this.state === FromBTCLNSwapState.PR_PAID ||
                this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
                await this._saveAndEmit(FromBTCLNSwapState.QUOTE_EXPIRED);
            }
            return;
        }
        if (this.state === FromBTCLNSwapState.PR_PAID ||
            this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED) {
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
     * @private
     */
    async _txsClaim(_signer, secret) {
        if (this.data == null)
            throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if (useSecret == null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if (!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");
        return this.wrapper.contract.txsClaimWithSecret(_signer == null ?
            this._getInitiator() :
            ((0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper.chain.wrapSigner(_signer)), this.data, useSecret, true, true);
    }
    /**
     * Returns transactions required for claiming the HTLC and finishing the swap by revealing the HTLC secret
     *  (hash preimage)
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be CLAIM_COMMITED)
     */
    async txsClaim(_signer, secret) {
        if (this.state !== FromBTCLNSwapState.CLAIM_COMMITED)
            throw new Error("Must be in CLAIM_COMMITED state!");
        return this._txsClaim(_signer, secret);
    }
    /**
     * Claims and finishes the swap
     *
     * @param _signer Signer to sign the transactions with, can also be different to the initializer
     * @param abortSignal Abort signal to stop waiting for transaction confirmation
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @param onBeforeTxSent
     */
    async claim(_signer, abortSignal, onBeforeTxSent, secret) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper.chain.wrapSigner(_signer);
        let txCount = 0;
        const result = await this.wrapper.chain.sendAndConfirm(signer, await this.txsClaim(_signer, secret), true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === 1)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this.claimTxId = result[0];
        if (this.state === FromBTCLNSwapState.CLAIM_COMMITED || this.state === FromBTCLNSwapState.EXPIRED || this.state === FromBTCLNSwapState.FAILED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
        }
        return result[0];
    }
    /**
     * Waits till the swap is successfully claimed
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal AbortSignal
     * @throws {Error} If swap is in invalid state (must be BTC_TX_CONFIRMED)
     * @throws {Error} If the LP refunded sooner than we were able to claim
     * @returns {boolean} whether the swap was claimed in time or not
     */
    async waitTillClaimed(maxWaitTimeSeconds, abortSignal) {
        if (this.state === FromBTCLNSwapState.CLAIM_CLAIMED)
            return Promise.resolve(true);
        if (this.state !== FromBTCLNSwapState.CLAIM_COMMITED)
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
            if (this.state !== FromBTCLNSwapState.CLAIM_CLAIMED) {
                this.claimTxId = await res.getClaimTxId();
                await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
            }
        }
        if (res?.type === base_1.SwapCommitStateType.NOT_COMMITED || res?.type === base_1.SwapCommitStateType.EXPIRED) {
            if (this.state !== FromBTCLNSwapState.CLAIM_CLAIMED &&
                this.state !== FromBTCLNSwapState.FAILED) {
                if (res.getRefundTxId != null)
                    this.refundTxId = await res.getRefundTxId();
                await this._saveAndEmit(FromBTCLNSwapState.FAILED);
            }
            throw new Error("Swap expired while waiting for claim!");
        }
        return true;
    }
    //////////////////////////////
    //// Commit & claim
    /**
     * Estimated transaction fee for commit & claim txs combined
     */
    async getCommitAndClaimFee() {
        const swapContract = this.wrapper.contract;
        const feeRate = this.feeRate ?? await swapContract.getInitFeeRate(this.getSwapData().getOfferer(), this.getSwapData().getClaimer(), this.getSwapData().getToken(), this.getSwapData().getClaimHash());
        const commitFee = await (swapContract.getRawCommitFee != null ?
            swapContract.getRawCommitFee(this._getInitiator(), this.getSwapData(), feeRate) :
            swapContract.getCommitFee(this._getInitiator(), this.getSwapData(), feeRate));
        const claimFee = await (swapContract.getRawClaimFee != null ?
            swapContract.getRawClaimFee(this._getInitiator(), this.getSwapData(), feeRate) :
            swapContract.getClaimFee(this._getInitiator(), this.getSwapData(), feeRate));
        return commitFee + claimFee;
    }
    canCommitAndClaimInOneShot() {
        return this.wrapper.contract.initAndClaimWithSecret != null;
    }
    /**
     * Returns transactions for both commit & claim operation together, such that they can be signed all at once by
     *  the wallet. CAUTION: transactions must be sent sequentially, such that the claim (2nd) transaction is only
     *  sent after the commit (1st) transaction confirms. Failure to do so can reveal the HTLC pre-image too soon,
     *  opening a possibility for the LP to steal funds.
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     */
    async txsCommitAndClaim(skipChecks, secret) {
        if (this.state === FromBTCLNSwapState.CLAIM_COMMITED)
            return await this.txsClaim(undefined, secret);
        if (this.state !== FromBTCLNSwapState.PR_PAID &&
            (this.state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData == null))
            throw new Error("Must be in PR_PAID state!");
        if (this.data == null)
            throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if (useSecret == null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as second argument");
        if (!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");
        const initTxs = await this.txsCommit(skipChecks);
        const claimTxs = await this.wrapper.contract.txsClaimWithSecret(this._getInitiator(), this.data, useSecret, true, true, undefined, true);
        return initTxs.concat(claimTxs);
    }
    /**
     * Commits and claims the swap, in a way that the transactions can be signed together by the underlying provider and
     *  then sent sequentially
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal to stop waiting for the transaction confirmation and abort
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param onBeforeCommitTxSent
     * @param onBeforeClaimTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commitAndClaim(_signer, abortSignal, skipChecks, onBeforeCommitTxSent, onBeforeClaimTxSent, secret) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper.chain.wrapSigner(_signer);
        if (!this.canCommitAndClaimInOneShot())
            throw new Error("Cannot commitAndClaim in single action, please run commit and claim separately!");
        this.checkSigner(signer);
        if (this.state === FromBTCLNSwapState.CLAIM_COMMITED)
            return [await this.claim(signer, abortSignal, onBeforeClaimTxSent, secret)];
        let txCount = 0;
        const txs = await this.txsCommitAndClaim(skipChecks, secret);
        const result = await this.wrapper.chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeCommitTxSent != null && txCount === 1)
                onBeforeCommitTxSent(txId);
            if (onBeforeClaimTxSent != null && txCount === txs.length)
                onBeforeClaimTxSent(txId);
            return Promise.resolve();
        });
        this.commitTxId = result[0] ?? this.commitTxId;
        this.claimTxId = result[result.length - 1] ?? this.claimTxId;
        if (this.state !== FromBTCLNSwapState.CLAIM_CLAIMED) {
            await this._saveAndEmit(FromBTCLNSwapState.CLAIM_CLAIMED);
        }
        return result;
    }
    //////////////////////////////
    //// LNURL
    /**
     * Is this an LNURL-withdraw swap?
     */
    isLNURL() {
        return this.lnurl != null;
    }
    /**
     * Gets the used LNURL or null if this is not an LNURL-withdraw swap
     */
    getLNURL() {
        return this.lnurl ?? null;
    }
    /**
     * Pay the generated lightning network invoice with LNURL-withdraw
     */
    async settleWithLNURLWithdraw(lnurl) {
        if (this.state !== FromBTCLNSwapState.PR_CREATED &&
            (this.state !== FromBTCLNSwapState.QUOTE_SOFT_EXPIRED || this.signatureData != null))
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
        if (this.state === FromBTCLNSwapState.PR_PAID ||
            (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null) ||
            this.state === FromBTCLNSwapState.CLAIM_COMMITED ||
            this.state === FromBTCLNSwapState.EXPIRED) {
            //Check for expiry before the getCommitStatus to prevent race conditions
            let quoteExpired = false;
            if (this.state === FromBTCLNSwapState.PR_PAID || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null)) {
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }
            //Check if it's already successfully paid
            commitStatus ??= await this.wrapper.contract.getCommitStatus(this._getInitiator(), this.data);
            if (commitStatus != null && await this._forciblySetOnchainState(commitStatus))
                return true;
            //Set the state on expiry here
            if (this.state === FromBTCLNSwapState.PR_PAID || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null)) {
                if (quoteExpired) {
                    this.state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    return true;
                }
            }
        }
        return false;
    }
    _shouldFetchExpiryStatus() {
        return this.state === FromBTCLNSwapState.PR_PAID || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null);
    }
    _shouldFetchCommitStatus() {
        return this.state === FromBTCLNSwapState.PR_PAID || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData != null) ||
            this.state === FromBTCLNSwapState.CLAIM_COMMITED || this.state === FromBTCLNSwapState.EXPIRED;
    }
    _shouldCheckIntermediary() {
        return this.state === FromBTCLNSwapState.PR_CREATED || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null);
    }
    async _sync(save, quoteDefinitelyExpired, commitStatus, skipLpCheck) {
        let changed = false;
        if (this.state === FromBTCLNSwapState.PR_CREATED || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
            if (this.state != FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.getTimeoutTime() < Date.now()) {
                this.state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
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
            if (this.state === FromBTCLNSwapState.PR_CREATED || (this.state === FromBTCLNSwapState.QUOTE_SOFT_EXPIRED && this.signatureData == null)) {
                if (await this._verifyQuoteDefinitelyExpired()) {
                    this.state = FromBTCLNSwapState.QUOTE_EXPIRED;
                    changed ||= true;
                }
            }
        }
        if (await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus))
            changed = true;
        if (this.state === FromBTCLNSwapState.CLAIM_COMMITED) {
            const expired = await this.wrapper.contract.isExpired(this._getInitiator(), this.data);
            if (expired) {
                this.state = FromBTCLNSwapState.EXPIRED;
                changed = true;
            }
        }
        if (save && changed)
            await this._saveAndEmit();
        return changed;
    }
    async _forciblySetOnchainState(commitStatus) {
        switch (commitStatus.type) {
            case base_1.SwapCommitStateType.PAID:
                if (this.claimTxId == null)
                    this.claimTxId = await commitStatus.getClaimTxId();
                if (this.secret == null || this.pr == null)
                    this._setSwapSecret(await commitStatus.getClaimResult());
                this.state = FromBTCLNSwapState.CLAIM_CLAIMED;
                return true;
            case base_1.SwapCommitStateType.NOT_COMMITED:
                if (this.refundTxId == null && commitStatus.getRefundTxId)
                    this.refundTxId = await commitStatus.getRefundTxId();
                if (this.refundTxId != null) {
                    this.state = FromBTCLNSwapState.FAILED;
                    return true;
                }
                break;
            case base_1.SwapCommitStateType.EXPIRED:
                if (this.refundTxId == null && commitStatus.getRefundTxId)
                    this.refundTxId = await commitStatus.getRefundTxId();
                this.state = this.refundTxId == null ? FromBTCLNSwapState.QUOTE_EXPIRED : FromBTCLNSwapState.FAILED;
                return true;
            case base_1.SwapCommitStateType.COMMITED:
                if (this.state !== FromBTCLNSwapState.CLAIM_COMMITED && this.state !== FromBTCLNSwapState.EXPIRED) {
                    this.state = FromBTCLNSwapState.CLAIM_COMMITED;
                    return true;
                }
                break;
        }
        return false;
    }
    async _tick(save) {
        switch (this.state) {
            case FromBTCLNSwapState.PR_CREATED:
                if (this.getTimeoutTime() < Date.now()) {
                    this.state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNSwapState.PR_PAID:
                if (this.expiry < Date.now()) {
                    this.state = FromBTCLNSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNSwapState.CLAIM_COMMITED:
                const expired = await this.wrapper.contract.isExpired(this._getInitiator(), this.data);
                if (expired) {
                    this.state = FromBTCLNSwapState.EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
        }
        return false;
    }
    _setSwapSecret(secret) {
        this.secret = secret;
        if (this.pr == null) {
            this.pr = buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.from(secret, "hex"))).toString("hex");
        }
    }
}
exports.FromBTCLNSwap = FromBTCLNSwap;
