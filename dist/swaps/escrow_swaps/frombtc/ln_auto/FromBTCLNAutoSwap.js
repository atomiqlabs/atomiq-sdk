"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromBTCLNAutoSwap = exports.isFromBTCLNAutoSwapInit = exports.FromBTCLNAutoSwapState = void 0;
const bolt11_1 = require("@atomiqlabs/bolt11");
const SwapType_1 = require("../../../../enums/SwapType");
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
const LNURL_1 = require("../../../../lnurl/LNURL");
const UserError_1 = require("../../../../errors/UserError");
const IntermediaryAPI_1 = require("../../../../intermediaries/apis/IntermediaryAPI");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const Utils_1 = require("../../../../utils/Utils");
const IEscrowSwap_1 = require("../../IEscrowSwap");
const FeeType_1 = require("../../../../enums/FeeType");
const PercentagePPM_1 = require("../../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../../types/TokenAmount");
const Token_1 = require("../../../../types/Token");
const Logger_1 = require("../../../../utils/Logger");
const TimeoutUtils_1 = require("../../../../utils/TimeoutUtils");
const LNURLWithdraw_1 = require("../../../../types/lnurl/LNURLWithdraw");
const PriceInfoType_1 = require("../../../../types/PriceInfoType");
const sha2_1 = require("@noble/hashes/sha2");
/**
 * State enum for FromBTCLNAuto swaps
 * @category Swaps/Lightning → Smart chain
 */
var FromBTCLNAutoSwapState;
(function (FromBTCLNAutoSwapState) {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["FAILED"] = -4] = "FAILED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["QUOTE_EXPIRED"] = -3] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["QUOTE_SOFT_EXPIRED"] = -2] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["EXPIRED"] = -1] = "EXPIRED";
    /**
     * Swap quote was created, use {@link FromBTCLNAutoSwap.getAddress} or {@link FromBTCLNAutoSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNAutoSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP) and the destination HTLC escrow is created
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * Lightning network payment has been received by the intermediary (LP), but the destination chain
     *  HTLC escrow hasn't been created yet. Use {@link FromBTCLNAutoSwap.waitForPayment} to continue waiting
     *  till the destination HTLC escrow is created.
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["PR_PAID"] = 1] = "PR_PAID";
    /**
     * Swap escrow HTLC has been created on the destination chain, wait for automatic settlement by the watchtowers
     *  using the {@link FromBTCLNAutoSwap.waitTillClaimed} function or settle manually using the
     *  {@link FromBTCLNAutoSwap.claim} or {@link FromBTCLNAutoSwap.txsClaim} function.
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["CLAIM_COMMITED"] = 2] = "CLAIM_COMMITED";
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    FromBTCLNAutoSwapState[FromBTCLNAutoSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCLNAutoSwapState = exports.FromBTCLNAutoSwapState || (exports.FromBTCLNAutoSwapState = {}));
const FromBTCLNAutoSwapStateDescription = {
    [FromBTCLNAutoSwapState.FAILED]: "Swap has failed as the user didn't settle the HTLC on the destination before expiration",
    [FromBTCLNAutoSwapState.QUOTE_EXPIRED]: "Swap has expired for good and there is no way how it can be executed anymore",
    [FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED]: "A swap is expired, though there is still a chance that it will be processed",
    [FromBTCLNAutoSwapState.EXPIRED]: "Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the swap on the destination smart chain.",
    [FromBTCLNAutoSwapState.PR_CREATED]: "Swap quote was created, pay the bolt11 lightning network invoice to initiate the swap, then wait till the lightning network payment is received by the intermediary (LP) and the destination HTLC escrow is created",
    [FromBTCLNAutoSwapState.PR_PAID]: "Lightning network payment has been received by the intermediary (LP), but the destination chain HTLC escrow hasn't been created yet. Continue waiting till the destination HTLC escrow is created.",
    [FromBTCLNAutoSwapState.CLAIM_COMMITED]: "Swap escrow HTLC has been created on the destination chain, wait for automatic settlement by the watchtowers or settle manually.",
    [FromBTCLNAutoSwapState.CLAIM_CLAIMED]: "Swap successfully settled and funds received on the destination chain"
};
function isFromBTCLNAutoSwapInit(obj) {
    return (obj.pr == null || typeof obj.pr === "string") &&
        (obj.secret == null || typeof obj.secret === "string") &&
        (obj.btcAmountSwap == null || typeof obj.btcAmountSwap === "bigint") &&
        (obj.btcAmountGas == null || typeof obj.btcAmountGas === "bigint") &&
        typeof obj.gasSwapFeeBtc === "bigint" &&
        typeof obj.gasSwapFee === "bigint" &&
        (obj.gasPricingInfo == null || (0, PriceInfoType_1.isPriceInfoType)(obj.gasPricingInfo)) &&
        (obj.lnurl == null || typeof (obj.lnurl) === "string") &&
        (obj.lnurlK1 == null || typeof (obj.lnurlK1) === "string") &&
        (obj.lnurlCallback == null || typeof (obj.lnurlCallback) === "string") &&
        (0, IEscrowSwap_1.isIEscrowSwapInit)(obj);
}
exports.isFromBTCLNAutoSwapInit = isFromBTCLNAutoSwapInit;
/**
 * New escrow based (HTLC) swaps for Bitcoin Lightning -> Smart chain swaps not requiring manual settlement on
 *  the destination by the user, and instead letting the LP initiate the escrow. Permissionless watchtower network
 *  handles the claiming of HTLC, with the swap secret broadcasted over Nostr. Also adds a possibility for the user
 *  to receive a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Lightning → Smart chain
 */
class FromBTCLNAutoSwap extends IEscrowSwap_1.IEscrowSwap {
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
        if (isFromBTCLNAutoSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/frombtcln_auto";
        super(wrapper, initOrObject);
        this.TYPE = SwapType_1.SwapType.FROM_BTCLN_AUTO;
        /**
         * @internal
         */
        this.swapStateName = (state) => FromBTCLNAutoSwapState[state];
        /**
         * @internal
         */
        this.swapStateDescription = FromBTCLNAutoSwapStateDescription;
        /**
         * @internal
         */
        this.inputToken = Token_1.BitcoinTokens.BTCLN;
        this.lnurlFailSignal = new AbortController();
        this.prPosted = false;
        this.broadcastTickCounter = 0;
        if (isFromBTCLNAutoSwapInit(initOrObject)) {
            this._state = FromBTCLNAutoSwapState.PR_CREATED;
            this.pr = initOrObject.pr;
            this.secret = initOrObject.secret;
            this.initialSwapData = initOrObject.initialSwapData;
            this.btcAmountSwap = initOrObject.btcAmountSwap;
            this.btcAmountGas = initOrObject.btcAmountGas;
            this.gasSwapFeeBtc = initOrObject.gasSwapFeeBtc;
            this.gasSwapFee = initOrObject.gasSwapFee;
            this.gasPricingInfo = initOrObject.gasPricingInfo;
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
            this.btcAmountSwap = (0, Utils_1.toBigInt)(initOrObject.btcAmountSwap);
            this.btcAmountGas = (0, Utils_1.toBigInt)(initOrObject.btcAmountGas);
            this.gasSwapFeeBtc = (0, Utils_1.toBigInt)(initOrObject.gasSwapFeeBtc);
            this.gasSwapFee = (0, Utils_1.toBigInt)(initOrObject.gasSwapFee);
            this.gasPricingInfo = (0, PriceInfoType_1.deserializePriceInfoType)(initOrObject.gasPricingInfo);
            this._commitTxId = initOrObject.commitTxId;
            this._claimTxId = initOrObject.claimTxId;
            this._commitedAt = initOrObject.commitedAt;
            this.lnurl = initOrObject.lnurl;
            this.lnurlK1 = initOrObject.lnurlK1;
            this.lnurlCallback = initOrObject.lnurlCallback;
            this.prPosted = initOrObject.prPosted;
            this.usesClaimHashAsId = initOrObject.usesClaimHashAsId ?? false;
        }
        this.tryRecomputeSwapPrice();
        this.logger = (0, Logger_1.getLogger)("FromBTCLNAuto(" + this.getIdentifierHashString() + "): ");
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
    upgradeVersion() { }
    /**
     * @inheritDoc
     * @internal
     */
    tryRecomputeSwapPrice() {
        if (this.pricingInfo == null || this.btcAmountSwap == null)
            return;
        if (this.pricingInfo.swapPriceUSatPerToken == null) {
            const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
            this.pricingInfo = this.wrapper._prices.recomputePriceInfoReceive(this.chainIdentifier, this.btcAmountSwap, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, this.getOutputAmountWithoutFee(), this.getSwapData().getToken());
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
    }
    //////////////////////////////
    //// Pricing
    /**
     * @inheritDoc
     */
    async refreshPriceData() {
        if (this.pricingInfo == null || this.btcAmountSwap == null)
            return;
        const usdPricePerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
        this.pricingInfo = await this.wrapper._prices.isValidAmountReceive(this.chainIdentifier, this.btcAmountSwap, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, this.getOutputAmountWithoutFee(), this.getSwapData().getToken());
        this.pricingInfo.realPriceUsdPerBitcoin = usdPricePerBtc;
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash() {
        //Use claim hash in case the data is not yet known
        return this._data == null ? this.initialSwapData?.getClaimHash() : this._data?.getEscrowHash();
    }
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator() {
        return this.getSwapData().getClaimer();
    }
    /**
     * @inheritDoc
     */
    getId() {
        return this.getIdentifierHashString();
    }
    /**
     * @inheritDoc
     */
    getOutputAddress() {
        return this._getInitiator();
    }
    /**
     * @inheritDoc
     */
    getOutputTxId() {
        return this._claimTxId ?? null;
    }
    /**
     * @inheritDoc
     */
    requiresAction() {
        return this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    getIdentifierHashString() {
        const id = this.usesClaimHashAsId
            ? this.getClaimHash()
            : this.getPaymentHash().toString("hex");
        if (this._randomNonce == null)
            return id;
        return id + this._randomNonce;
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
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress() {
        return this.pr ?? "";
    }
    /**
     * @inheritDoc
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
        if (decoded.tagsObject.min_final_cltv_expiry == null)
            throw new Error("Swap invoice doesn't contain final ctlv delta field!");
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
        return this._data == null ? null : Number(this.wrapper._getHtlcTimeout(this._data)) * 1000;
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED || this._state === FromBTCLNAutoSwapState.QUOTE_EXPIRED || this._state === FromBTCLNAutoSwapState.FAILED;
    }
    /**
     * @inheritDoc
     */
    isClaimable() {
        return this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED;
    }
    /**
     * @inheritDoc
     */
    isFailed() {
        return this._state === FromBTCLNAutoSwapState.FAILED || this._state === FromBTCLNAutoSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === FromBTCLNAutoSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired() {
        return this._state === FromBTCLNAutoSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    _verifyQuoteDefinitelyExpired() {
        return Promise.resolve(this.getDefinitiveExpiryTime() < Date.now());
    }
    /**
     * @inheritDoc
     */
    _verifyQuoteValid() {
        return Promise.resolve(this.getQuoteExpiry() > Date.now());
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * Returns the satoshi amount of the lightning network invoice, or `null` if the lightning network
     *  invoice is not known (i.e. when the swap was recovered from on-chain data, the paid invoice
     *  cannot be recovered because it is purely off-chain)
     *
     * @internal
     */
    getLightningInvoiceSats() {
        if (this.pr == null || !this.pr.toLowerCase().startsWith("ln"))
            return null;
        const parsed = (0, bolt11_1.decode)(this.pr);
        if (parsed.millisatoshis == null)
            throw new Error("Swap invoice doesn't contain msat amount field!");
        return (BigInt(parsed.millisatoshis) + 999n) / 1000n;
    }
    /**
     * Returns the watchtower fee paid in BTC satoshis, or null if known (i.e. if the swap was recovered from
     *  on-chain data)
     *
     * @protected
     */
    getWatchtowerFeeAmountBtc() {
        if (this.btcAmountGas == null)
            return null;
        return (this.btcAmountGas - this.gasSwapFeeBtc) * this.getSwapData().getClaimerBounty() / this.getSwapData().getTotalDeposit();
    }
    /**
     * Returns the input amount for the actual swap (excluding the input amount used to cover the "gas drop"
     *  part of the swap), excluding fees
     *
     * @internal
     */
    getInputSwapAmountWithoutFee() {
        if (this.btcAmountSwap == null)
            return null;
        return this.btcAmountSwap - this.swapFeeBtc;
    }
    /**
     * Returns the input amount purely for the "gas drop" part of the swap (this much BTC in sats will be
     *  swapped into the native gas token on the destination chain), excluding fees
     *
     * @internal
     */
    getInputGasAmountWithoutFee() {
        if (this.btcAmountGas == null)
            return null;
        return this.btcAmountGas - this.gasSwapFeeBtc;
    }
    /**
     * Get total btc amount in sats on the input, excluding the swap fee and watchtower fee
     *
     * @internal
     */
    getInputAmountWithoutFee() {
        if (this.btcAmountGas == null || this.btcAmountSwap)
            return null;
        return this.getInputSwapAmountWithoutFee() + this.getInputGasAmountWithoutFee() - this.getWatchtowerFeeAmountBtc();
    }
    /**
     * Returns the "would be" output amount if the swap charged no swap fee
     *
     * @internal
     */
    getOutputAmountWithoutFee() {
        return this.getSwapData().getAmount() + this.swapFee;
    }
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
        return (0, TokenAmount_1.toTokenAmount)(this.getLightningInvoiceSats(), this.inputToken, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputWithoutFee() {
        return (0, TokenAmount_1.toTokenAmount)(this.getInputAmountWithoutFee(), this.inputToken, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getOutputToken() {
        return this.wrapper._tokens[this.getSwapData().getToken()];
    }
    /**
     * @inheritDoc
     */
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getAmount(), this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getGasDropOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getSecurityDeposit() - this.getSwapData().getClaimerBounty(), this.wrapper._tokens[this.getSwapData().getDepositToken()], this.wrapper._prices, this.gasPricingInfo);
    }
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const outputToken = this.wrapper._tokens[this.getSwapData().getToken()];
        const gasSwapFeeInOutputToken = this.gasSwapFeeBtc
            * (10n ** BigInt(outputToken.decimals))
            * 1000000n
            / this.pricingInfo.swapPriceUSatPerToken;
        const feeWithoutBaseFee = this.gasSwapFeeBtc + this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const inputSats = this.getLightningInvoiceSats();
        const swapFeePPM = inputSats != null
            ? feeWithoutBaseFee * 1000000n / (inputSats - this.swapFeeBtc - this.gasSwapFeeBtc)
            : 0n;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc + this.gasSwapFeeBtc, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee + gasSwapFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            usdValue: amountInSrcToken.usdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo),
                percentage: (0, PercentagePPM_1.ppmToPercentage)(swapFeePPM)
            }
        };
    }
    /**
     * Returns the fee to be paid to watchtowers on the destination chain to automatically
     *  process and settle this swap without requiring any user interaction
     *
     * @internal
     */
    getWatchtowerFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const btcWatchtowerFee = this.getWatchtowerFeeAmountBtc();
        const outputToken = this.wrapper._tokens[this.getSwapData().getToken()];
        const watchtowerFeeInOutputToken = btcWatchtowerFee == null ? 0n : btcWatchtowerFee
            * (10n ** BigInt(outputToken.decimals))
            * 1000000n
            / this.pricingInfo.swapPriceUSatPerToken;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(btcWatchtowerFee, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(watchtowerFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }
    /**
     * @inheritDoc
     */
    getFee() {
        const swapFee = this.getSwapFee();
        const watchtowerFee = this.getWatchtowerFee();
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(swapFee.amountInSrcToken.rawAmount + watchtowerFee.amountInSrcToken.rawAmount, Token_1.BitcoinTokens.BTCLN, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(swapFee.amountInDstToken.rawAmount + watchtowerFee.amountInDstToken.rawAmount, this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
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
                fee: this.getWatchtowerFee()
            }
        ];
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
     * @param walletOrLnurlWithdraw Bitcoin lightning wallet to use to pay the lightning network invoice, or an LNURL-withdraw
     *  link, wallet is not required and the LN invoice can be paid externally as well (just pass null or undefined here)
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like AbortSignal, and timeouts/intervals
     * @param options.secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call `swap.claim()` to settle the swap on the destination manually
     */
    async execute(walletOrLnurlWithdraw, callbacks, options) {
        if (this._state === FromBTCLNAutoSwapState.FAILED)
            throw new Error("Swap failed!");
        if (this._state === FromBTCLNAutoSwapState.EXPIRED)
            throw new Error("Swap HTLC expired!");
        if (this._state === FromBTCLNAutoSwapState.QUOTE_EXPIRED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Swap quote expired!");
        if (this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED)
            throw new Error("Swap already settled!");
        let abortSignal = options?.abortSignal;
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED) {
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
        }
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.PR_PAID) {
            const paymentSuccess = await this.waitForPayment(callbacks?.onSourceTransactionReceived, options?.lightningTxCheckIntervalSeconds, abortSignal);
            if (!paymentSuccess)
                throw new Error("Failed to receive lightning network payment");
        }
        if (this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED)
            return true;
        if (this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED) {
            if (this.secret == null && options?.secret == null)
                throw new Error("Tried to wait till settlement, but no secret pre-image is known, please pass the secret pre-image as an argument!");
            const success = await this.waitTillClaimed(options?.maxWaitTillAutomaticSettlementSeconds ?? 60, options?.abortSignal, options?.secret);
            if (success && callbacks?.onSwapSettled != null)
                callbacks.onSwapSettled(this.getOutputTxId());
            return success;
        }
        throw new Error("Invalid state reached!");
    }
    /**
     * @inheritDoc
     */
    async txsExecute() {
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED) {
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
        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED");
    }
    /**
     *
     * @param options.manualSettlementSmartChainSigner Optional smart chain signer to create a manual claim (settlement) transaction
     * @param options.maxWaitTillAutomaticSettlementSeconds Maximum time to wait for an automatic settlement after
     *  the bitcoin transaction is confirmed (defaults to 60 seconds)
     * @param options.secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async getCurrentActions(options) {
        if (options?.secret != null)
            this.setSecretPreimage(options.secret);
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED) {
            try {
                return await this.txsExecute();
            }
            catch (e) { }
        }
        if (this.isClaimable()) {
            if (this._commitedAt == null ||
                options?.maxWaitTillAutomaticSettlementSeconds === 0 ||
                (Date.now() - this._commitedAt) > (options?.maxWaitTillAutomaticSettlementSeconds ?? 60) * 1000) {
                return [{
                        name: "Claim",
                        description: "Manually settle (claim) the swap on the destination smart chain",
                        chain: this.chainIdentifier,
                        txs: await this.txsClaim(options?.manualSettlementSmartChainSigner)
                    }];
            }
        }
        return [];
    }
    //////////////////////////////
    //// Payment
    /**
     * Checks whether the LP received the LN payment
     *
     * @param save If the new swap state should be saved
     *
     * @internal
     */
    async _checkIntermediaryPaymentReceived(save = true) {
        if (this._state === FromBTCLNAutoSwapState.PR_PAID ||
            this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED ||
            this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED ||
            this._state === FromBTCLNAutoSwapState.FAILED ||
            this._state === FromBTCLNAutoSwapState.EXPIRED)
            return true;
        if (this._state === FromBTCLNAutoSwapState.QUOTE_EXPIRED)
            return false;
        if (this.url == null)
            return false;
        const paymentHash = this.getPaymentHash();
        if (paymentHash == null)
            throw new Error("Failed to check LP payment received, payment hash not known (probably recovered swap?)");
        const resp = await IntermediaryAPI_1.IntermediaryAPI.getInvoiceStatus(this.url, paymentHash.toString("hex"));
        switch (resp.code) {
            case IntermediaryAPI_1.InvoiceStatusResponseCodes.PAID:
                const data = new this.wrapper._swapDataDeserializer(resp.data.data);
                if (this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED)
                    try {
                        await this._saveRealSwapData(data, save);
                        return true;
                    }
                    catch (e) { }
                return null;
            case IntermediaryAPI_1.InvoiceStatusResponseCodes.EXPIRED:
                this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                this.initiated = true;
                if (save)
                    await this._saveAndEmit();
                return false;
            default:
                return null;
        }
    }
    /**
     * Checks and overrides the swap data for this swap. This is used to set the swap data from
     *  on-chain events.
     *
     * @param data Swap data of the escrow swap
     * @param save If the new data should be saved
     *
     * @internal
     */
    async _saveRealSwapData(data, save) {
        await this.checkIntermediaryReturnedData(data);
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
            this._state = FromBTCLNAutoSwapState.PR_PAID;
            this._data = data;
            this.initiated = true;
            if (save)
                await this._saveAndEmit();
            return true;
        }
        return false;
    }
    /**
     * Checks the data returned by the intermediary in the payment auth request
     *
     * @param data Parsed swap data as returned by the intermediary
     *
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {Error} If the swap is already committed on-chain
     *
     * @private
     */
    async checkIntermediaryReturnedData(data) {
        if (!data.isPayOut())
            throw new IntermediaryError_1.IntermediaryError("Invalid not pay out");
        if (data.getType() !== base_1.ChainSwapType.HTLC)
            throw new IntermediaryError_1.IntermediaryError("Invalid swap type");
        if (!data.isOfferer(this.getSwapData().getOfferer()))
            throw new IntermediaryError_1.IntermediaryError("Invalid offerer used");
        if (!data.isClaimer(this._getInitiator()))
            throw new IntermediaryError_1.IntermediaryError("Invalid claimer used");
        if (!data.isToken(this.getSwapData().getToken()))
            throw new IntermediaryError_1.IntermediaryError("Invalid token used");
        if (data.getSecurityDeposit() !== this.getSwapData().getSecurityDeposit())
            throw new IntermediaryError_1.IntermediaryError("Invalid security deposit!");
        if (data.getClaimerBounty() !== this.getSwapData().getClaimerBounty())
            throw new IntermediaryError_1.IntermediaryError("Invalid security deposit!");
        if (data.getAmount() < this.getSwapData().getAmount())
            throw new IntermediaryError_1.IntermediaryError("Invalid amount received!");
        if (data.getClaimHash() !== this.getSwapData().getClaimHash())
            throw new IntermediaryError_1.IntermediaryError("Invalid payment hash used!");
        if (!data.isDepositToken(this.getSwapData().getDepositToken()))
            throw new IntermediaryError_1.IntermediaryError("Invalid deposit token used!");
        if (data.hasSuccessAction())
            throw new IntermediaryError_1.IntermediaryError("Invalid has success action");
        if (await this.wrapper._contract.isExpired(this._getInitiator(), data))
            throw new IntermediaryError_1.IntermediaryError("Not enough time to claim!");
        if (this.wrapper._getHtlcTimeout(data) <= (Date.now() / 1000))
            throw new IntermediaryError_1.IntermediaryError("HTLC expires too soon!");
    }
    /**
     * Waits till a lightning network payment is received by the intermediary, and the intermediary
     *  initiates the swap HTLC on the smart chain side. After the HTLC is initiated you can wait
     *  for an automatic settlement by the watchtowers with the {@link waitTillClaimed} function,
     *  or settle manually using the {@link claim} or {@link txsClaim} functions.
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
        if (this._state === FromBTCLNAutoSwapState.PR_PAID) {
            await this.waitTillCommited(checkIntervalSeconds, abortSignal);
        }
        if (this._state >= FromBTCLNAutoSwapState.CLAIM_COMMITED)
            return true;
        if (this._state !== FromBTCLNAutoSwapState.PR_CREATED)
            throw new Error("Must be in PR_CREATED state!");
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
        if (this.wrapper._messenger.warmup != null)
            await this.wrapper._messenger.warmup().catch(e => {
                this.logger.warn("waitForPayment(): Failed to warmup messenger: ", e);
            });
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED) {
            const promises = [
                this.waitTillState(FromBTCLNAutoSwapState.PR_PAID, "gte", abortController.signal).then(() => true)
            ];
            if (this.url != null)
                promises.push((async () => {
                    let resp = { code: IntermediaryAPI_1.InvoiceStatusResponseCodes.PENDING, msg: "" };
                    while (!abortController.signal.aborted && resp.code === IntermediaryAPI_1.InvoiceStatusResponseCodes.PENDING) {
                        resp = await IntermediaryAPI_1.IntermediaryAPI.getInvoiceStatus(this.url, paymentHash.toString("hex"));
                        if (resp.code === IntermediaryAPI_1.InvoiceStatusResponseCodes.PENDING)
                            await (0, TimeoutUtils_1.timeoutPromise)(checkIntervalSeconds * 1000, abortController.signal);
                    }
                    this.lnurlFailSignal.signal.removeEventListener("abort", lnurlFailListener);
                    abortController.signal.throwIfAborted();
                    if (resp.code === IntermediaryAPI_1.InvoiceStatusResponseCodes.PAID) {
                        const swapData = new this.wrapper._swapDataDeserializer(resp.data.data);
                        return await this._saveRealSwapData(swapData, true);
                    }
                    if (this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
                        if (resp.code === IntermediaryAPI_1.InvoiceStatusResponseCodes.EXPIRED) {
                            await this._saveAndEmit(FromBTCLNAutoSwapState.QUOTE_EXPIRED);
                        }
                        return false;
                    }
                })());
            const paymentResult = await Promise.race(promises);
            abortController.abort();
            if (!paymentResult)
                return false;
            if (onPaymentReceived != null)
                onPaymentReceived(this.getInputTxId());
        }
        if (this._state === FromBTCLNAutoSwapState.PR_PAID) {
            await this.waitTillCommited(checkIntervalSeconds, abortSignal);
        }
        return this._state >= FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }
    //////////////////////////////
    //// Commit
    /**
     * Waits till the intermediary (LP) initiates the swap HTLC escrow on the destination smart chain side
     *
     * @param checkIntervalSeconds How often to check via a polling watchdog
     * @param abortSignal Abort signal
     *
     * @internal
     */
    async waitTillCommited(checkIntervalSeconds, abortSignal) {
        if (this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED || this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED)
            return Promise.resolve();
        if (this._state !== FromBTCLNAutoSwapState.PR_PAID)
            throw new Error("Invalid state");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        let result;
        try {
            result = await Promise.race([
                this.watchdogWaitTillCommited(checkIntervalSeconds, abortController.signal),
                this.waitTillState(FromBTCLNAutoSwapState.CLAIM_COMMITED, "gte", abortController.signal).then(() => 0)
            ]);
            abortController.abort();
        }
        catch (e) {
            abortController.abort();
            throw e;
        }
        if (result === false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - HTLC expired");
            if (this._state === FromBTCLNAutoSwapState.PR_PAID) {
                await this._saveAndEmit(FromBTCLNAutoSwapState.EXPIRED);
            }
            return;
        }
        if (this._state === FromBTCLNAutoSwapState.PR_PAID) {
            this._commitedAt ??= Date.now();
            await this._saveAndEmit(FromBTCLNAutoSwapState.CLAIM_COMMITED);
        }
        if (result === 0)
            this.logger.debug("waitTillCommited(): Resolved from state changed");
        if (result === true) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
            if (this.secret != null)
                await this._broadcastSecret().catch(e => {
                    this.logger.error("waitTillCommited(): Error broadcasting swap secret: ", e);
                });
        }
    }
    //////////////////////////////
    //// Claim
    /**
     * @inheritDoc
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be {@link FromBTCLNAutoSwapState.CLAIM_COMMITED})
     */
    async txsClaim(_signer, secret) {
        if (this._state !== FromBTCLNAutoSwapState.CLAIM_COMMITED)
            throw new Error("Must be in CLAIM_COMMITED state!");
        if (this._data == null)
            throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if (useSecret == null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if (!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");
        return await this.wrapper._contract.txsClaimWithSecret(_signer == null ?
            this._getInitiator() :
            ((0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer)), this._data, useSecret, true, true);
    }
    /**
     * @inheritDoc
     *
     * @param _signer Signer to sign the transactions with, can also be different to the initializer
     * @param abortSignal Abort signal to stop waiting for transaction confirmation
     * @param onBeforeTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    async claim(_signer, abortSignal, onBeforeTxSent, secret) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        let txCount = 0;
        const txs = await this.txsClaim(_signer, secret);
        const result = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === 1)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this._claimTxId = result[0];
        if (this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED || this._state === FromBTCLNAutoSwapState.EXPIRED || this._state === FromBTCLNAutoSwapState.FAILED) {
            await this._saveAndEmit(FromBTCLNAutoSwapState.CLAIM_CLAIMED);
        }
        return result[0];
    }
    /**
     * Waits till the swap is successfully settled (claimed), should be called after sending the claim (settlement)
     *  transactions manually to wait till the SDK processes the settlement and updates the swap state accordingly.
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal AbortSignal
     * @param secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCLNAutoSwapState.CLAIM_COMMITED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     * @returns {boolean} whether the swap was claimed in time or not
     */
    async waitTillClaimed(maxWaitTimeSeconds, abortSignal, secret) {
        if (this._state === FromBTCLNAutoSwapState.CLAIM_CLAIMED)
            return Promise.resolve(true);
        if (this._state !== FromBTCLNAutoSwapState.CLAIM_COMMITED)
            throw new Error("Invalid state (not CLAIM_COMMITED)");
        if (secret != null) {
            if (!this.isValidSecretPreimage(secret))
                throw new Error("Invalid swap secret pre-image provided!");
            this.secret = secret;
        }
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
                this.waitTillState(FromBTCLNAutoSwapState.CLAIM_CLAIMED, "eq", abortController.signal).then(() => 0),
                this.waitTillState(FromBTCLNAutoSwapState.EXPIRED, "eq", abortController.signal).then(() => 1),
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
            if (this._state !== FromBTCLNAutoSwapState.CLAIM_CLAIMED) {
                this._claimTxId = await res.getClaimTxId();
                await this._saveAndEmit(FromBTCLNAutoSwapState.CLAIM_CLAIMED);
            }
        }
        if (res?.type === base_1.SwapCommitStateType.NOT_COMMITED || res?.type === base_1.SwapCommitStateType.EXPIRED) {
            if (this._state !== FromBTCLNAutoSwapState.CLAIM_CLAIMED &&
                this._state !== FromBTCLNAutoSwapState.FAILED) {
                await this._saveAndEmit(FromBTCLNAutoSwapState.FAILED);
            }
            throw new Error("Swap expired during claiming");
        }
        return true;
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
        if (this._state !== FromBTCLNAutoSwapState.PR_CREATED &&
            this._state !== FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED)
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
            data: this._data == null ? null : this._data.serialize(),
            commitTxId: this._commitTxId,
            claimTxId: this._claimTxId,
            commitedAt: this._commitedAt,
            btcAmountSwap: this.btcAmountSwap == null ? null : this.btcAmountSwap.toString(10),
            btcAmountGas: this.btcAmountGas == null ? null : this.btcAmountGas.toString(10),
            gasSwapFeeBtc: this.gasSwapFeeBtc == null ? null : this.gasSwapFeeBtc.toString(10),
            gasSwapFee: this.gasSwapFee == null ? null : this.gasSwapFee.toString(10),
            gasPricingInfo: (0, PriceInfoType_1.serializePriceInfoType)(this.gasPricingInfo),
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
        if (this._state === FromBTCLNAutoSwapState.PR_PAID ||
            this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED ||
            this._state === FromBTCLNAutoSwapState.EXPIRED) {
            //Check for expiry before the getCommitStatus to prevent race conditions
            let quoteExpired = false;
            if (this._state === FromBTCLNAutoSwapState.PR_PAID) {
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired();
            }
            //Check if it's already successfully paid
            commitStatus ??= await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            if (commitStatus != null && await this._forciblySetOnchainState(commitStatus))
                return true;
            if (this._state === FromBTCLNAutoSwapState.PR_PAID) {
                if (quoteExpired) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
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
        return this._state === FromBTCLNAutoSwapState.PR_PAID || this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED || this._state === FromBTCLNAutoSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus() {
        return this._state === FromBTCLNAutoSwapState.PR_PAID;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldCheckIntermediary() {
        return this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save, quoteDefinitelyExpired, commitStatus, skipLpCheck) {
        let changed = false;
        if (this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
            if (this._state !== FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED && this.getQuoteExpiry() < Date.now()) {
                this._state = FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED;
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
            if (this._state === FromBTCLNAutoSwapState.PR_CREATED || this._state === FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED) {
                if (await this._verifyQuoteDefinitelyExpired()) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                    changed ||= true;
                }
            }
        }
        if (await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus))
            changed = true;
        if (this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED) {
            const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data);
            if (expired) {
                this._state = FromBTCLNAutoSwapState.EXPIRED;
                changed = true;
            }
        }
        if (save && changed)
            await this._saveAndEmit();
        if (this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED && this.secret != null)
            await this._broadcastSecret().catch(e => {
                this.logger.error("_sync(): Error when broadcasting swap secret: ", e);
            });
        return changed;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _forciblySetOnchainState(commitStatus) {
        switch (commitStatus?.type) {
            case base_1.SwapCommitStateType.PAID:
                if (this._claimTxId == null)
                    this._claimTxId = await commitStatus.getClaimTxId();
                if (this.secret == null || this.pr == null)
                    this._setSwapSecret(await commitStatus.getClaimResult());
                this._state = FromBTCLNAutoSwapState.CLAIM_CLAIMED;
                return true;
            case base_1.SwapCommitStateType.NOT_COMMITED:
                if (this._refundTxId == null && commitStatus.getRefundTxId != null)
                    this._refundTxId = await commitStatus.getRefundTxId();
                if (this._refundTxId != null) {
                    this._state = FromBTCLNAutoSwapState.FAILED;
                    return true;
                }
                break;
            case base_1.SwapCommitStateType.EXPIRED:
                if (this._refundTxId == null && commitStatus.getRefundTxId != null)
                    this._refundTxId = await commitStatus.getRefundTxId();
                this._state = this._refundTxId == null ? FromBTCLNAutoSwapState.QUOTE_EXPIRED : FromBTCLNAutoSwapState.FAILED;
                return true;
            case base_1.SwapCommitStateType.COMMITED:
                if (this._state !== FromBTCLNAutoSwapState.CLAIM_COMMITED && this._state !== FromBTCLNAutoSwapState.EXPIRED) {
                    this._commitedAt ??= Date.now();
                    this._state = FromBTCLNAutoSwapState.CLAIM_COMMITED;
                    return true;
                }
                break;
        }
        return false;
    }
    /**
     * Broadcasts the swap secret to the underlying data propagation layer (e.g. Nostr by default)
     *
     * @param noCheckExpiry Whether a swap expiration check should be skipped broadcasting
     * @param secret An optional secret pre-image for the swap to broadcast
     *
     * @internal
     */
    async _broadcastSecret(noCheckExpiry, secret) {
        if (this._state !== FromBTCLNAutoSwapState.CLAIM_COMMITED)
            throw new Error("Must be in CLAIM_COMMITED state to broadcast swap secret!");
        if (this._data == null)
            throw new Error("Unknown data, wrong state?");
        const useSecret = secret ?? this.secret;
        if (useSecret == null)
            throw new Error("Swap secret pre-image not known and not provided, please provide the swap secret pre-image as an argument");
        if (!this.isValidSecretPreimage(useSecret))
            throw new Error("Invalid swap secret pre-image provided!");
        if (!noCheckExpiry) {
            if (await this.wrapper._contract.isExpired(this._getInitiator(), this._data))
                throw new Error("On-chain HTLC already expired!");
        }
        await this.wrapper._messenger.broadcast(new base_1.SwapClaimWitnessMessage(this._data, useSecret));
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save) {
        switch (this._state) {
            case FromBTCLNAutoSwapState.PR_CREATED:
                if (this.getQuoteExpiry() < Date.now()) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED:
                if (this.getDefinitiveExpiryTime() < Date.now()) {
                    this._state = FromBTCLNAutoSwapState.QUOTE_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCLNAutoSwapState.PR_PAID:
            case FromBTCLNAutoSwapState.CLAIM_COMMITED:
                const expired = await this.wrapper._contract.isExpired(this._getInitiator(), this._data);
                if (expired) {
                    this._state = FromBTCLNAutoSwapState.EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                if (this._state === FromBTCLNAutoSwapState.CLAIM_COMMITED) {
                    //Broadcast the secret over the provided messenger channel
                    if (this.broadcastTickCounter === 0 && this.secret != null)
                        await this._broadcastSecret(true).catch(e => {
                            this.logger.warn("_tick(): Error when broadcasting swap secret: ", e);
                        });
                    this.broadcastTickCounter = (this.broadcastTickCounter + 1) % 3; //Broadcast every 3rd tick
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
exports.FromBTCLNAutoSwap = FromBTCLNAutoSwap;
