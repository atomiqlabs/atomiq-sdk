"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapperWithSigner = void 0;
const SwapWithSigner_1 = require("../types/SwapWithSigner");
/**
 * Chain and signer-specific wrapper for automatic signer injection into swap methods
 * @category Core
 */
class SwapperWithSigner {
    /**
     * Pricing API used by the SDK
     */
    get prices() {
        return this.swapper.prices;
    }
    /**
     * Intermediary discovery instance
     */
    get intermediaryDiscovery() {
        return this.swapper.intermediaryDiscovery;
    }
    /**
     * Mempool (mempool.space) api used for fetching bitcoin chain and lightning network data
     */
    get mempoolApi() {
        return this.swapper.mempoolApi;
    }
    /**
     * Bitcoin RPC for fetching bitcoin chain data
     */
    get bitcoinRpc() {
        return this.swapper.bitcoinRpc;
    }
    /**
     * Bitcoin network specification
     */
    get bitcoinNetwork() {
        return this.swapper.bitcoinNetwork;
    }
    /**
     * Data propagation layer used for broadcasting messages to watchtowers
     */
    get messenger() {
        return this.swapper.messenger;
    }
    /**
     * Miscellaneous utility functions
     */
    get Utils() {
        return this.swapper.Utils;
    }
    /**
     * Helper information about various swap protocol and their features:
     * - `requiresInputWallet`: Whether a swap requires a connected wallet on the input chain able to sign
     *  arbitrary transaction
     * - `requiresOutputWallet`: Whether a swap requires a connected wallet on the output chain able to sign
     *  arbitrary transactions
     * - `supportsGasDrop`: Whether a swap supports the "gas drop" feature, allowing to user to receive a small
     *  amount of native token as part of the swap when swapping to smart chains
     */
    get SwapTypeInfo() {
        return this.swapper.SwapTypeInfo;
    }
    constructor(swapper, signer) {
        this.swapper = swapper;
        this.signer = signer;
        this.chainIdentifier = swapper.chainIdentifier;
    }
    /**
     * Creates Smart chain -> Bitcoin ({@link SwapType.TO_BTC}) swap
     *
     * @param tokenAddress Token address to pay with
     * @param address Recipient's bitcoin address
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to use exact in instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCSwap(tokenAddress, address, amount, exactIn, additionalParams, options) {
        return this.swapper.createToBTCSwap(this.signer.getAddress(), tokenAddress, address, amount, exactIn, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap
     *
     * @param tokenAddress Token address to pay with
     * @param paymentRequest BOLT11 lightning network invoice to be paid (needs to have a fixed amount), and the swap
     *  amount is taken from this fixed amount, hence only exact output swaps are supported
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwap(tokenAddress, paymentRequest, additionalParams, options) {
        return this.swapper.createToBTCLNSwap(this.signer.getAddress(), tokenAddress, paymentRequest, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via LNURL-pay link
     *
     * @param tokenAddress Token address to pay with
     * @param lnurlPay LNURL-pay link to use for the payment
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwapViaLNURL(tokenAddress, lnurlPay, amount, exactIn, additionalParams, options) {
        return this.swapper.createToBTCLNSwapViaLNURL(this.signer.getAddress(), tokenAddress, lnurlPay, amount, exactIn, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via {@link LightningInvoiceCreateService}
     *
     * @param tokenAddress Token address to pay with
     * @param service Invoice create service object which facilitates the creation of fixed amount LN invoices
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwapViaInvoiceCreateService(tokenAddress, service, amount, exactIn, additionalParams, options) {
        return this.swapper.createToBTCLNSwapViaInvoiceCreateService(this.signer.getAddress(), tokenAddress, service, amount, exactIn, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates Bitcoin -> Smart chain ({@link SwapType.SPV_VAULT_FROM_BTC}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCSwapNew(tokenAddress, amount, exactOut, additionalParams, options) {
        return this.swapper.createFromBTCSwapNew(this.signer.getAddress(), tokenAddress, amount, exactOut, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates LEGACY Bitcoin -> Smart chain ({@link SwapType.FROM_BTC}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCSwap(tokenAddress, amount, exactOut, additionalParams, options) {
        return this.swapper.createFromBTCSwap(this.signer.getAddress(), tokenAddress, amount, exactOut, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwap(tokenAddress, amount, exactOut, additionalParams, options) {
        return this.swapper.createFromBTCLNSwap(this.signer.getAddress(), tokenAddress, amount, exactOut, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     */
    createFromBTCLNSwapViaLNURL(tokenAddress, lnurl, amount, exactOut, additionalParams) {
        return this.swapper.createFromBTCLNSwapViaLNURL(this.signer.getAddress(), tokenAddress, lnurl, amount, exactOut, additionalParams)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwapNew(tokenAddress, amount, exactOut, additionalParams, options) {
        return this.swapper.createFromBTCLNSwapNew(this.signer.getAddress(), tokenAddress, amount, exactOut, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwapNewViaLNURL(tokenAddress, lnurl, amount, exactOut, additionalParams, options) {
        return this.swapper.createFromBTCLNSwapNewViaLNURL(this.signer.getAddress(), tokenAddress, lnurl, amount, exactOut, additionalParams, options)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Creates a trusted Bitcoin Lightning -> Smart chain ({@link SwapType.TRUSTED_FROM_BTCLN}) gas swap
     *
     * @param amount Amount of native token to receive, in base units
     * @param trustedIntermediaryOrUrl  URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    createTrustedLNForGasSwap(amount, trustedIntermediaryOrUrl) {
        return this.swapper.createTrustedLNForGasSwap(this.signer.getAddress(), amount, trustedIntermediaryOrUrl);
    }
    /**
     * Creates a trusted Bitcoin -> Smart chain ({@link SwapType.TRUSTED_FROM_BTC}) gas swap
     *
     * @param amount Amount of native token to receive, in base units
     * @param refundAddress Bitcoin refund address, in case the swap fails the funds are refunded here
     * @param trustedIntermediaryOrUrl URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    createTrustedOnchainForGasSwap(amount, refundAddress, trustedIntermediaryOrUrl) {
        return this.swapper.createTrustedOnchainForGasSwap(this.signer.getAddress(), amount, refundAddress, trustedIntermediaryOrUrl);
    }
    /**
     * Creates a swap from srcToken to dstToken, of a specific token amount, either specifying input amount (exactIn=true)
     *  or output amount (exactIn=false), NOTE: For regular -> BTC-LN (lightning) swaps the passed amount is ignored and
     *  invoice's pre-set amount is used instead.
     *
     * @param srcToken Source token of the swap, user pays this token
     * @param dstToken Destination token of the swap, user receives this token
     * @param amount Amount of the swap
     * @param exactIn Whether the amount specified is an input amount (exactIn=true) or an output amount (exactIn=false)
     * @param addressLnurlLightningInvoice Bitcoin on-chain address, lightning invoice, LNURL-pay to pay or
     *  LNURL-withdrawal to withdraw money from
     */
    create(srcToken, dstToken, amount, exactIn, addressLnurlLightningInvoice) {
        return this.swapper.create(this.signer.getAddress(), srcToken, dstToken, amount, exactIn, addressLnurlLightningInvoice)
            .then(swap => (0, SwapWithSigner_1.wrapSwapWithSigner)(swap, this.signer));
    }
    /**
     * Returns swaps that are in-progress and are claimable for the specific chain, optionally also for a specific signer's address
     */
    getAllSwaps() {
        return this.swapper.getAllSwaps(this.signer.getAddress());
    }
    /**
     * Returns swaps that are in-progress and are claimable for the specific chain, optionally also for a specific signer's address
     */
    getActionableSwaps() {
        return this.swapper.getActionableSwaps(this.signer.getAddress());
    }
    /**
     * Returns swaps that are refundable for the specific chain, optionally also for a specific signer's address
     */
    getRefundableSwaps() {
        return this.swapper.getRefundableSwaps(this.signer.getAddress());
    }
    /**
     * Returns swap with a specific id (identifier) on a specific chain and optionally with a signer
     */
    getSwapById(id) {
        return this.swapper.getSwapById(id, this.signer.getAddress());
    }
    /**
     * Returns the swap with a proper return type, or `undefined` if not found or has wrong type
     *
     * @param id An ID of the swap ({@link ISwap.getId})
     * @param swapType Type of the swap
     */
    async getTypedSwapById(id, swapType) {
        return this.swapper.getTypedSwapById(id, swapType, this.signer.getAddress());
    }
    /**
     * Synchronizes swaps from chain, this is usually ran when SDK is initialized, deletes expired quotes
     */
    async _syncSwaps() {
        return this.swapper._syncSwaps(this.signer.getAddress());
    }
    /**
     * Recovers swaps from on-chain historical data.
     *
     * Please note that the recovered swaps might not be complete (i.e. missing amounts or addresses), as some
     *  of the swap data is purely off-chain and can never be recovered purely from on-chain data. This
     *  functions tries to recover as much swap data as possible.
     *
     * @param startBlockheight Optional starting blockheight for swap data recovery, will only check swaps
     *  initiated after this blockheight
     */
    async recoverSwaps(startBlockheight) {
        return this.swapper.recoverSwaps(this.signer.getAddress(), startBlockheight);
    }
    /**
     * Returns the {@link Token} object for a given token
     *
     * @param tickerOrAddress Token to return the object for, can use multiple formats:
     *  - a) token ticker, such as `"BTC"`, `"SOL"`, etc.
     *  - b) token ticker prefixed with smart chain identifier, such as `"SOLANA-SOL"`, `"SOLANA-USDC"`, etc.
     *  - c) token address
     */
    getToken(tickerOrAddress) {
        return this.swapper.getToken(tickerOrAddress);
    }
    /**
     * Returns whether the SDK supports a given swap type on this chain based on currently known LPs
     *
     * @param swapType Swap protocol type
     */
    supportsSwapType(swapType) {
        return this.swapper.supportsSwapType(swapType);
    }
    getSwapType(srcToken, dstToken) {
        return this.swapper.getSwapType(srcToken, dstToken);
    }
    /**
     * Returns minimum/maximum limits for inputs and outputs for a swap between given tokens
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapLimits(srcToken, dstToken) {
        return this.swapper.getSwapLimits(srcToken, dstToken);
    }
    /**
     * Returns tokens that you can swap to (if input=true) from a given token,
     *  or tokens that you can swap from (if input=false) to a given token
     */
    getSwapCounterTokens(token, input) {
        return this.swapper.getSwapCounterTokens(token, input);
    }
    ///////////////////////////////////
    /// Deprecated
    /**
     * Returns swap bounds (minimums & maximums) for different swap types & tokens
     * @deprecated Use getSwapLimits() instead!
     */
    getSwapBounds() {
        return this.swapper.getSwapBounds();
    }
    /**
     * Returns maximum possible swap amount
     * @deprecated Use getSwapLimits() instead!
     *
     * @param type      Type of the swap
     * @param token     Token of the swap
     */
    getMaximum(type, token) {
        return this.swapper.getMaximum(type, token);
    }
    /**
     * Returns minimum possible swap amount
     * @deprecated Use getSwapLimits() instead!
     *
     * @param type      Type of swap
     * @param token     Token of the swap
     */
    getMinimum(type, token) {
        return this.swapper.getMinimum(type, token);
    }
}
exports.SwapperWithSigner = SwapperWithSigner;
