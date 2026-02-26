"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpvFromBTCSwap = exports.isSpvFromBTCSwapInit = exports.SpvFromBTCSwapState = void 0;
const ISwap_1 = require("../ISwap");
const base_1 = require("@atomiqlabs/base");
const SwapType_1 = require("../../enums/SwapType");
const Utils_1 = require("../../utils/Utils");
const BitcoinUtils_1 = require("../../utils/BitcoinUtils");
const btc_signer_1 = require("@scure/btc-signer");
const buffer_1 = require("buffer");
const IBitcoinWallet_1 = require("../../bitcoin/wallet/IBitcoinWallet");
const IntermediaryAPI_1 = require("../../intermediaries/apis/IntermediaryAPI");
const FeeType_1 = require("../../enums/FeeType");
const PercentagePPM_1 = require("../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../types/TokenAmount");
const Token_1 = require("../../types/Token");
const Logger_1 = require("../../utils/Logger");
const TimeoutUtils_1 = require("../../utils/TimeoutUtils");
const PriceInfoType_1 = require("../../types/PriceInfoType");
const BitcoinWalletUtils_1 = require("../../utils/BitcoinWalletUtils");
const SingleAddressBitcoinWallet_1 = require("../../bitcoin/wallet/SingleAddressBitcoinWallet");
/**
 * State enum for SPV vault (UTXO-controlled vault) based swaps
 * @category Swaps/Bitcoin → Smart chain
 */
var SpvFromBTCSwapState;
(function (SpvFromBTCSwapState) {
    /**
     * Catastrophic failure has occurred when processing the swap on the smart chain side,
     *  this implies a bug in the smart contract code or the user and intermediary deliberately
     *  creating a bitcoin transaction with invalid format unparsable by the smart contract.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["CLOSED"] = -5] = "CLOSED";
    /**
     * Some of the bitcoin swap transaction inputs were double-spent, this means the swap
     *  has failed and no BTC was sent
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["FAILED"] = -4] = "FAILED";
    /**
     * The intermediary (LP) declined to co-sign the submitted PSBT, hence the swap failed
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["DECLINED"] = -3] = "DECLINED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["QUOTE_EXPIRED"] = -2] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["QUOTE_SOFT_EXPIRED"] = -1] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap was created, use the {@link SpvFromBTCSwap.getFundedPsbt} or {@link SpvFromBTCSwap.getPsbt} functions
     *  to get the bitcoin swap PSBT that should be signed by the user's wallet and then submitted via the
     *  {@link SpvFromBTCSwap.submitPsbt} function.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["CREATED"] = 0] = "CREATED";
    /**
     * Swap bitcoin PSBT was submitted by the client to the SDK
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["SIGNED"] = 1] = "SIGNED";
    /**
     * Swap bitcoin PSBT sent to the intermediary (LP), waiting for the intermediary co-sign
     *  it and broadcast. You can use the {@link SpvFromBTCSwap.waitTillClaimedOrFronted}
     *  function to wait till the intermediary broadcasts the transaction and the transaction
     *  confirms.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["POSTED"] = 2] = "POSTED";
    /**
     * Intermediary (LP) has co-signed and broadcasted the bitcoin transaction. You can use the
     *  {@link SpvFromBTCSwap.waitTillClaimedOrFronted} function to wait till the transaction
     *  confirms.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["BROADCASTED"] = 3] = "BROADCASTED";
    /**
     * Settlement on the destination smart chain was fronted and funds were already received
     *  by the user, even before the final settlement.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["FRONTED"] = 4] = "FRONTED";
    /**
     * Bitcoin transaction confirmed with necessary amount of confirmations, wait for automatic
     *  settlement by the watchtower with the {@link waitTillClaimedOrFronted} function, or settle manually
     *  using the {@link FromBTCSwap.claim} or {@link FromBTCSwap.txsClaim} function.
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["BTC_TX_CONFIRMED"] = 5] = "BTC_TX_CONFIRMED";
    /**
     * Swap settled on the smart chain and funds received
     */
    SpvFromBTCSwapState[SpvFromBTCSwapState["CLAIMED"] = 6] = "CLAIMED";
})(SpvFromBTCSwapState = exports.SpvFromBTCSwapState || (exports.SpvFromBTCSwapState = {}));
const SpvFromBTCSwapStateDescription = {
    [SpvFromBTCSwapState.CLOSED]: "Catastrophic failure has occurred when processing the swap on the smart chain side, this implies a bug in the smart contract code or the user and intermediary deliberately creating a bitcoin transaction with invalid format unparsable by the smart contract.",
    [SpvFromBTCSwapState.FAILED]: "Some of the bitcoin swap transaction inputs were double-spent, this means the swap has failed and no BTC was sent",
    [SpvFromBTCSwapState.DECLINED]: "The intermediary (LP) declined to co-sign the submitted PSBT, hence the swap failed",
    [SpvFromBTCSwapState.QUOTE_EXPIRED]: "Swap has expired for good and there is no way how it can be executed anymore",
    [SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED]: "A swap is almost expired, and it should be presented to the user as expired, though there is still a chance that it will be processed",
    [SpvFromBTCSwapState.CREATED]: "Swap was created, get the bitcoin swap PSBT that should be signed by the user's wallet and then submit it back to the SDK.",
    [SpvFromBTCSwapState.SIGNED]: "Swap bitcoin PSBT was submitted by the client to the SDK",
    [SpvFromBTCSwapState.POSTED]: "Swap bitcoin PSBT sent to the intermediary (LP), waiting for the intermediary co-sign it and broadcast.",
    [SpvFromBTCSwapState.BROADCASTED]: "Intermediary (LP) has co-signed and broadcasted the bitcoin transaction.",
    [SpvFromBTCSwapState.FRONTED]: "Settlement on the destination smart chain was fronted and funds were already received by the user, even before the final settlement.",
    [SpvFromBTCSwapState.BTC_TX_CONFIRMED]: "Bitcoin transaction confirmed with necessary amount of confirmations, wait for automatic settlement by the watchtower or settle manually.",
    [SpvFromBTCSwapState.CLAIMED]: "Swap settled on the smart chain and funds received"
};
function isSpvFromBTCSwapInit(obj) {
    return typeof obj === "object" &&
        typeof (obj.quoteId) === "string" &&
        typeof (obj.recipient) === "string" &&
        typeof (obj.vaultOwner) === "string" &&
        typeof (obj.vaultId) === "bigint" &&
        typeof (obj.vaultRequiredConfirmations) === "number" &&
        Array.isArray(obj.vaultTokenMultipliers) && obj.vaultTokenMultipliers.reduce((prev, curr) => prev && typeof (curr) === "bigint", true) &&
        typeof (obj.vaultBtcAddress) === "string" &&
        typeof (obj.vaultUtxo) === "string" &&
        typeof (obj.vaultUtxoValue) === "bigint" &&
        typeof (obj.btcDestinationAddress) === "string" &&
        typeof (obj.btcAmount) === "bigint" &&
        typeof (obj.btcAmountSwap) === "bigint" &&
        typeof (obj.btcAmountGas) === "bigint" &&
        typeof (obj.minimumBtcFeeRate) === "number" &&
        typeof (obj.outputTotalSwap) === "bigint" &&
        typeof (obj.outputSwapToken) === "string" &&
        typeof (obj.outputTotalGas) === "bigint" &&
        typeof (obj.outputGasToken) === "string" &&
        typeof (obj.gasSwapFeeBtc) === "bigint" &&
        typeof (obj.gasSwapFee) === "bigint" &&
        typeof (obj.callerFeeShare) === "bigint" &&
        typeof (obj.frontingFeeShare) === "bigint" &&
        typeof (obj.executionFeeShare) === "bigint" &&
        typeof (obj.genesisSmartChainBlockHeight) === "number" &&
        (obj.gasPricingInfo == null || (0, PriceInfoType_1.isPriceInfoType)(obj.gasPricingInfo)) &&
        (obj.swapWalletWIF == null || typeof (obj.swapWalletWIF) === "string") &&
        (obj.swapWalletAddress == null || typeof (obj.swapWalletAddress) === "string") &&
        (obj.swapWalletMaxNetworkFeeRate == null || typeof (obj.swapWalletMaxNetworkFeeRate) === "number") &&
        (obj.swapWalletType == null || typeof (obj.swapWalletType) === "string") &&
        (0, ISwap_1.isISwapInit)(obj);
}
exports.isSpvFromBTCSwapInit = isSpvFromBTCSwapInit;
/**
 * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring
 *  any initiation on the destination chain, and with the added possibility for the user to receive
 *  a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
class SpvFromBTCSwap extends ISwap_1.ISwap {
    constructor(wrapper, initOrObject) {
        if (isSpvFromBTCSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/frombtc_spv";
        super(wrapper, initOrObject);
        this.TYPE = SwapType_1.SwapType.SPV_VAULT_FROM_BTC;
        /**
         * @internal
         */
        this.swapStateDescription = SpvFromBTCSwapStateDescription;
        /**
         * @internal
         */
        this.swapStateName = (state) => SpvFromBTCSwapState[state];
        if (isSpvFromBTCSwapInit(initOrObject)) {
            this._state = SpvFromBTCSwapState.CREATED;
            this.quoteId = initOrObject.quoteId;
            this.recipient = initOrObject.recipient;
            this.vaultOwner = initOrObject.vaultOwner;
            this.vaultId = initOrObject.vaultId;
            this.vaultRequiredConfirmations = initOrObject.vaultRequiredConfirmations;
            this.vaultTokenMultipliers = initOrObject.vaultTokenMultipliers;
            this.vaultBtcAddress = initOrObject.vaultBtcAddress;
            this.vaultUtxo = initOrObject.vaultUtxo;
            this.vaultUtxoValue = initOrObject.vaultUtxoValue;
            this.btcDestinationAddress = initOrObject.btcDestinationAddress;
            this.btcAmount = initOrObject.btcAmount;
            this.btcAmountSwap = initOrObject.btcAmountSwap;
            this.btcAmountGas = initOrObject.btcAmountGas;
            this.minimumBtcFeeRate = initOrObject.minimumBtcFeeRate;
            this.outputTotalSwap = initOrObject.outputTotalSwap;
            this.outputSwapToken = initOrObject.outputSwapToken;
            this.outputTotalGas = initOrObject.outputTotalGas;
            this.outputGasToken = initOrObject.outputGasToken;
            this.gasSwapFeeBtc = initOrObject.gasSwapFeeBtc;
            this.gasSwapFee = initOrObject.gasSwapFee;
            this.callerFeeShare = initOrObject.callerFeeShare;
            this.frontingFeeShare = initOrObject.frontingFeeShare;
            this.executionFeeShare = initOrObject.executionFeeShare;
            this._genesisSmartChainBlockHeight = initOrObject.genesisSmartChainBlockHeight;
            this.gasPricingInfo = initOrObject.gasPricingInfo;
            this.swapWalletWIF = initOrObject.swapWalletWIF;
            this.swapWalletAddress = initOrObject.swapWalletAddress;
            this.swapWalletMaxNetworkFeeRate = initOrObject.swapWalletMaxNetworkFeeRate;
            this.swapWalletType = initOrObject.swapWalletType;
            const vaultAddressType = (0, BitcoinUtils_1.toCoinselectAddressType)((0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.vaultBtcAddress));
            if (vaultAddressType !== "p2tr" && vaultAddressType !== "p2wpkh" && vaultAddressType !== "p2wsh")
                throw new Error("Vault address type must be of witness type: p2tr, p2wpkh, p2wsh");
        }
        else {
            this.quoteId = initOrObject.quoteId;
            this.recipient = initOrObject.recipient;
            this.vaultOwner = initOrObject.vaultOwner;
            this.vaultId = BigInt(initOrObject.vaultId);
            this.vaultRequiredConfirmations = initOrObject.vaultRequiredConfirmations;
            this.vaultTokenMultipliers = initOrObject.vaultTokenMultipliers.map((val) => BigInt(val));
            this.vaultBtcAddress = initOrObject.vaultBtcAddress;
            this.vaultUtxo = initOrObject.vaultUtxo;
            this.vaultUtxoValue = BigInt(initOrObject.vaultUtxoValue);
            this.btcDestinationAddress = initOrObject.btcDestinationAddress;
            this.btcAmount = BigInt(initOrObject.btcAmount);
            this.btcAmountSwap = BigInt(initOrObject.btcAmountSwap);
            this.btcAmountGas = BigInt(initOrObject.btcAmountGas);
            this.minimumBtcFeeRate = initOrObject.minimumBtcFeeRate;
            this.outputTotalSwap = BigInt(initOrObject.outputTotalSwap);
            this.outputSwapToken = initOrObject.outputSwapToken;
            this.outputTotalGas = BigInt(initOrObject.outputTotalGas);
            this.outputGasToken = initOrObject.outputGasToken;
            this.gasSwapFeeBtc = BigInt(initOrObject.gasSwapFeeBtc);
            this.gasSwapFee = BigInt(initOrObject.gasSwapFee);
            this.callerFeeShare = BigInt(initOrObject.callerFeeShare);
            this.frontingFeeShare = BigInt(initOrObject.frontingFeeShare);
            this.executionFeeShare = BigInt(initOrObject.executionFeeShare);
            this._genesisSmartChainBlockHeight = initOrObject.genesisSmartChainBlockHeight;
            this._senderAddress = initOrObject.senderAddress;
            this._claimTxId = initOrObject.claimTxId;
            this._frontTxId = initOrObject.frontTxId;
            this.gasPricingInfo = (0, PriceInfoType_1.deserializePriceInfoType)(initOrObject.gasPricingInfo);
            this.btcTxConfirmedAt = initOrObject.btcTxConfirmedAt;
            this.swapWalletWIF = initOrObject.swapWalletWIF;
            this.swapWalletAddress = initOrObject.swapWalletAddress;
            this.swapWalletMaxNetworkFeeRate = initOrObject.swapWalletMaxNetworkFeeRate;
            this.swapWalletType = initOrObject.swapWalletType;
            if (initOrObject.data != null)
                this._data = new this.wrapper._spvWithdrawalDataDeserializer(initOrObject.data);
        }
        this.tryCalculateSwapFee();
        this.logger = (0, Logger_1.getLogger)("SPVFromBTC(" + this.getId() + "): ");
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
    tryCalculateSwapFee() {
        if (this.swapFeeBtc == null && this.swapFee != null) {
            this.swapFeeBtc = this.swapFee * this.btcAmountSwap / this.getOutputWithoutFee().rawAmount;
        }
        if (this.pricingInfo != null && this.pricingInfo.swapPriceUSatPerToken == null) {
            const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
            this.pricingInfo = this.wrapper._prices.recomputePriceInfoReceive(this.chainIdentifier, this.btcAmountSwap, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, this.getOutputWithoutFee().rawAmount, this.outputSwapToken);
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
    }
    //////////////////////////////
    //// Pricing
    /**
     * @inheritDoc
     */
    async refreshPriceData() {
        if (this.pricingInfo == null)
            return;
        const usdPricePerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
        this.pricingInfo = await this.wrapper._prices.isValidAmountReceive(this.chainIdentifier, this.btcAmountSwap, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, this.getOutputWithoutFee().rawAmount, this.outputSwapToken);
        this.pricingInfo.realPriceUsdPerBitcoin = usdPricePerBtc;
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator() {
        return this.recipient;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash() {
        return this._data?.btcTx?.txid ?? null;
    }
    /**
     * @inheritDoc
     */
    getId() {
        return this.quoteId + this._randomNonce;
    }
    /**
     * @inheritDoc
     */
    getQuoteExpiry() {
        return this.expiry - 20 * 1000;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteDefinitelyExpired() {
        return Promise.resolve(this.expiry < Date.now());
    }
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteValid() {
        return Promise.resolve(this.expiry > Date.now() && (this._state === SpvFromBTCSwapState.CREATED || this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED));
    }
    /**
     * Returns the address of the swap wallet
     *
     * @internal
     */
    _getSwapWalletAddress() {
        return this.swapWalletAddress ?? null;
    }
    /**
     * Sets the wallet to be used for receiving funds on BTC and automatically
     *
     * @param mnemonic Mnemonic to use, either newly created one, or derived from the recoverable
     *  entropy from the AbstractSigner
     */
    async setSwapWalletMnemonic(mnemonic) {
        const wif = await SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet.mnemonicToPrivateKey(mnemonic, this.wrapper._options.bitcoinNetwork);
        const bitcoinWallet = new SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, wif);
        this.swapWalletWIF = wif;
        this.swapWalletAddress = bitcoinWallet.getReceiveAddress();
        this.swapWalletType = "waitpayment";
        await this._save();
    }
    /**
     * Removes the swap wallet from the swap, after this the swap can only be executed by co-signing a PSBT
     *  from an external wallet
     */
    async clearSwapWalletMnemonic() {
        this.swapWalletWIF = undefined;
        this.swapWalletAddress = undefined;
        this.swapWalletType = undefined;
        await this._save();
    }
    /**
     * Returns whether the swap has a swap wallet address, that automatically executes the swap upon
     *  receiving BTC funds
     */
    hasSwapWallet() {
        return this.swapWalletWIF != null;
    }
    /**
     * @inheritDoc
     */
    getOutputAddress() {
        return this.recipient;
    }
    /**
     * @inheritDoc
     */
    getOutputTxId() {
        return this._frontTxId ?? this._claimTxId ?? null;
    }
    /**
     * @inheritDoc
     */
    getInputAddress() {
        return this._senderAddress ?? null;
    }
    /**
     * @inheritDoc
     */
    getInputTxId() {
        return this._data?.btcTx?.txid ?? null;
    }
    /**
     * @inheritDoc
     */
    requiresAction() {
        return this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED;
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === SpvFromBTCSwapState.CLAIMED || this._state === SpvFromBTCSwapState.QUOTE_EXPIRED || this._state === SpvFromBTCSwapState.FAILED;
    }
    /**
     * @inheritDoc
     */
    isClaimable() {
        return this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === SpvFromBTCSwapState.FRONTED || this._state === SpvFromBTCSwapState.CLAIMED;
    }
    /**
     * @inheritDoc
     */
    isFailed() {
        return this._state === SpvFromBTCSwapState.FAILED || this._state === SpvFromBTCSwapState.DECLINED || this._state === SpvFromBTCSwapState.CLOSED;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === SpvFromBTCSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired() {
        return this._state === SpvFromBTCSwapState.QUOTE_EXPIRED || this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * Returns the data about used spv vault (UTXO-controlled vault) to perform the swap
     */
    getSpvVaultData() {
        return {
            owner: this.vaultOwner,
            vaultId: this.vaultId,
            utxo: this.vaultUtxo
        };
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * Returns the input BTC amount in sats without any fees
     *
     * @internal
     */
    getInputSwapAmountWithoutFee() {
        return (this.btcAmountSwap - this.swapFeeBtc) * 100000n / (100000n + this.callerFeeShare + this.frontingFeeShare + this.executionFeeShare);
    }
    /**
     * Returns the input gas BTC amount in sats without any fees
     *
     * @internal
     */
    getInputGasAmountWithoutFee() {
        return (this.btcAmountGas - this.gasSwapFeeBtc) * 100000n / (100000n + this.callerFeeShare + this.frontingFeeShare);
    }
    /**
     * Returns to total input BTC amount in sats without any fees (this is BTC amount for the swap + BTC amount
     *  for the gas drop).
     *
     * @internal
     */
    getInputAmountWithoutFee() {
        return this.getInputSwapAmountWithoutFee() + this.getInputGasAmountWithoutFee();
    }
    /**
     * Returns the swap output amount without any fees, this value is therefore always higher than
     *  the actual received output.
     *
     * @internal
     */
    getOutputWithoutFee() {
        return (0, TokenAmount_1.toTokenAmount)((this.outputTotalSwap * (100000n + this.callerFeeShare + this.frontingFeeShare + this.executionFeeShare) / 100000n) + (this.swapFee ?? 0n), this.wrapper._tokens[this.outputSwapToken], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const outputToken = this.wrapper._tokens[this.outputSwapToken];
        const gasSwapFeeInOutputToken = this.gasSwapFeeBtc
            * (10n ** BigInt(outputToken.decimals))
            * 1000000n
            / this.pricingInfo.swapPriceUSatPerToken;
        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / (this.btcAmount - this.swapFeeBtc - this.gasSwapFeeBtc);
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc + this.gasSwapFeeBtc, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee + gasSwapFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
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
        const totalFeeShare = this.callerFeeShare + this.frontingFeeShare;
        const outputToken = this.wrapper._tokens[this.outputSwapToken];
        const watchtowerFeeInOutputToken = this.getInputGasAmountWithoutFee() * totalFeeShare
            * (10n ** BigInt(outputToken.decimals))
            * 1000000n
            / this.pricingInfo.swapPriceUSatPerToken
            / 100000n;
        const feeBtc = this.getInputAmountWithoutFee() * (totalFeeShare + this.executionFeeShare) / 100000n;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(feeBtc, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)((this.outputTotalSwap * (totalFeeShare + this.executionFeeShare) / 100000n) + watchtowerFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }
    /**
     * Returns the fee to be paid to watchtowers on the destination chain to automatically
     *  process and settle this swap without requiring any user interaction
     *
     * @internal
     */
    getSwapAddressFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        if (this.swapWalletAddress == null ||
            this.swapWalletMaxNetworkFeeRate == null ||
            this.swapWalletType !== "waitpayment")
            return null;
        const expectedNetworkFee = this.wrapper.getExpectedNetworkFee(this.swapWalletAddress, this.swapWalletMaxNetworkFeeRate, this.outputTotalGas !== 0n);
        const outputToken = this.wrapper._tokens[this.outputSwapToken];
        const swapAddressFeeInOutputToken = expectedNetworkFee
            * (10n ** BigInt(outputToken.decimals))
            * 1000000n
            / this.pricingInfo.swapPriceUSatPerToken;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(expectedNetworkFee, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(swapAddressFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
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
        const swapAddressFee = this.getSwapAddressFee();
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(swapFee.amountInSrcToken.rawAmount + watchtowerFee.amountInSrcToken.rawAmount +
            (swapAddressFee?.amountInSrcToken.rawAmount ?? 0n), Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(swapFee.amountInDstToken.rawAmount + watchtowerFee.amountInDstToken.rawAmount +
                (swapAddressFee?.amountInDstToken.rawAmount ?? 0n), this.wrapper._tokens[this.outputSwapToken], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }
    /**
     * @inheritDoc
     */
    getFeeBreakdown() {
        const swapAddressFee = this.getSwapAddressFee();
        return swapAddressFee == null ? [
            {
                type: FeeType_1.FeeType.SWAP,
                fee: this.getSwapFee()
            },
            {
                type: FeeType_1.FeeType.NETWORK_OUTPUT,
                fee: this.getWatchtowerFee()
            }
        ] : [
            {
                type: FeeType_1.FeeType.NETWORK_INPUT,
                fee: swapAddressFee
            },
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
    /**
     * @inheritDoc
     */
    getOutputToken() {
        return this.wrapper._tokens[this.outputSwapToken];
    }
    /**
     * @inheritDoc
     */
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.outputTotalSwap, this.wrapper._tokens[this.outputSwapToken], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getGasDropOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.outputTotalGas, this.wrapper._tokens[this.outputGasToken], this.wrapper._prices, this.gasPricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputWithoutFee() {
        return (0, TokenAmount_1.toTokenAmount)(this.getInputAmountWithoutFee(), Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputToken() {
        return Token_1.BitcoinTokens.BTC;
    }
    /**
     * @inheritDoc
     */
    getInput() {
        if (this.swapWalletAddress != null &&
            this.swapWalletMaxNetworkFeeRate != null &&
            this.swapWalletType === "waitpayment") {
            const expectedNetworkFee = this.wrapper.getExpectedNetworkFee(this.swapWalletAddress, this.swapWalletMaxNetworkFeeRate, this.outputTotalGas !== 0n);
            return (0, TokenAmount_1.toTokenAmount)(this.btcAmount + expectedNetworkFee, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        }
        return (0, TokenAmount_1.toTokenAmount)(this.btcAmount, Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    //////////////////////////////
    //// Bitcoin tx
    /**
     * @internal
     */
    _getSwapBitcoinWallet() {
        if (this.swapWalletWIF == null)
            throw new Error("Swap doesn't have swap bitcoin wallet!");
        return new SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, this.swapWalletWIF);
    }
    /**
     * @internal
     */
    async _tryToPayFromSwapWallet(utxos) {
        if (this.swapWalletWIF == null ||
            this.swapWalletAddress == null ||
            this.swapWalletMaxNetworkFeeRate == null ||
            this.swapWalletType !== "waitpayment")
            return false;
        if (this._state !== SpvFromBTCSwapState.CREATED ||
            !this.isInitiated() ||
            !this.hasSwapWallet())
            return false;
        const btcWallet = this._getSwapBitcoinWallet();
        //Check if any single UTXO can be used to pay this swap
        const expectedNetworkFee = this.wrapper.getExpectedNetworkFee(this.swapWalletAddress, this.swapWalletMaxNetworkFeeRate, this.outputTotalGas !== 0n);
        const requiredUTXOValue = this.btcAmount - expectedNetworkFee;
        const foundUTXO = utxos.find(utxo => BigInt(utxo.value) === requiredUTXOValue);
        this.logger.debug(`_tryToPayFromSwapWallet(): Checked address UTXOs, expected network fee: ${expectedNetworkFee},` +
            ` searched for UTXO with value: ${requiredUTXOValue}, found: `, foundUTXO);
        if (foundUTXO == null)
            return false;
        //TODO: There might be some trouble with this approach, as it might inadvertendly consume a UTXO destined
        // for a different swap, maybe we can only let the latest swap with a wallet be able to consume a UTXO
        //Try to spend that UTXO as a whole to fund the swap
        const { psbt: unfundedPsbt, in1sequence } = await this.getPsbt();
        const { psbt, fee, feeRate } = btcWallet.fundPsbtWithExactUtxos(unfundedPsbt, [foundUTXO]);
        if (feeRate < this.minimumBtcFeeRate) {
            this.logger.warn(`_tryToPayFromSwapWallet(): Unable to process swap using the found UTXO, ` +
                `resulting fee rate is below minimum allowed for the swap, calculated fee: ${fee.toString(10)}` +
                `, calculated fee rate: ${feeRate}, minimum fee rate: ${this.minimumBtcFeeRate}`);
            //TODO: This might mean that the user sent in the transaction with too low of a fee
            // we should hint to the user that the transaction he sends has to pay at least minimumBtcFeeRate!
            return false;
        }
        psbt.updateInput(1, { sequence: in1sequence });
        const signInputs = [];
        for (let i = 1; i < psbt.inputsLength; i++) {
            signInputs.push(i);
        }
        const signedPsbt = await btcWallet.signPsbt(psbt, signInputs);
        await this.submitPsbt(signedPsbt);
        return true;
    }
    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount() {
        return this.vaultRequiredConfirmations;
    }
    /**
     * Returns raw transaction details that can be used to manually create a swap PSBT. It is better to use
     *  the {@link getPsbt} or {@link getFundedPsbt} function retrieve an already prepared PSBT.
     */
    async getTransactionDetails() {
        const [txId, voutStr] = this.vaultUtxo.split(":");
        const vaultScript = (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.vaultBtcAddress);
        const out2script = (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.btcDestinationAddress);
        const opReturnData = this.wrapper._contract.toOpReturnData(this.recipient, [
            this.outputTotalSwap / this.vaultTokenMultipliers[0],
            this.outputTotalGas / this.vaultTokenMultipliers[1]
        ]);
        const out1script = buffer_1.Buffer.concat([
            opReturnData.length > 75 ? buffer_1.Buffer.from([0x6a, 0x4c, opReturnData.length]) : buffer_1.Buffer.from([0x6a, opReturnData.length]),
            opReturnData
        ]);
        if (this.callerFeeShare < 0n || this.callerFeeShare > 0xfffffn)
            throw new Error("Caller fee out of bounds!");
        if (this.frontingFeeShare < 0n || this.frontingFeeShare > 0xfffffn)
            throw new Error("Fronting fee out of bounds!");
        if (this.executionFeeShare < 0n || this.executionFeeShare > 0xfffffn)
            throw new Error("Execution fee out of bounds!");
        const nSequence0 = 0x80000000n | (this.callerFeeShare & 0xfffffn) | (this.frontingFeeShare & 1047552n) << 10n;
        const nSequence1 = 0x80000000n | (this.executionFeeShare & 0xfffffn) | (this.frontingFeeShare & 1023n) << 20n;
        return {
            in0txid: txId,
            in0vout: parseInt(voutStr),
            in0sequence: Number(nSequence0),
            vaultAmount: this.vaultUtxoValue,
            vaultScript,
            in1sequence: Number(nSequence1),
            out1script,
            out2amount: this.btcAmount,
            out2script,
            locktime: 500000000 + Math.floor(Math.random() * 1000000000) //Use this as a random salt to make the btc txId unique!
        };
    }
    /**
     * Returns the raw PSBT (not funded), the wallet should fund the PSBT (add its inputs) and importantly **set the nSequence field of the
     *  2nd input** (input 1 - indexing from 0) to the value returned in `in1sequence`, sign the PSBT and then pass
     *  it back to the swap with {@link submitPsbt} function.
     */
    async getPsbt() {
        const res = await this.getTransactionDetails();
        const psbt = new btc_signer_1.Transaction({
            allowUnknownOutputs: true,
            allowLegacyWitnessUtxo: true,
            lockTime: res.locktime
        });
        psbt.addInput({
            txid: res.in0txid,
            index: res.in0vout,
            witnessUtxo: {
                amount: res.vaultAmount,
                script: res.vaultScript
            },
            sequence: res.in0sequence
        });
        psbt.addOutput({
            amount: res.vaultAmount,
            script: res.vaultScript
        });
        psbt.addOutput({
            amount: 0n,
            script: res.out1script
        });
        psbt.addOutput({
            amount: res.out2amount,
            script: res.out2script
        });
        const serializedPsbt = buffer_1.Buffer.from(psbt.toPSBT());
        return {
            psbt,
            psbtHex: serializedPsbt.toString("hex"),
            psbtBase64: serializedPsbt.toString("base64"),
            in1sequence: res.in1sequence
        };
    }
    /**
     * Returns the PSBT that is already funded with wallet's UTXOs (runs a coin-selection algorithm to choose UTXOs to use),
     *  also returns inputs indices that need to be signed by the wallet before submitting the PSBT back to the SDK with
     *  {@link submitPsbt}
     *
     * @remarks
     * Note that when passing the `feeRate` argument, the fee must be at least {@link minimumBtcFeeRate} sats/vB.
     *
     * @param _bitcoinWallet Sender's bitcoin wallet
     * @param feeRate Optional fee rate in sats/vB for the transaction
     * @param additionalOutputs additional outputs to add to the PSBT - can be used to collect fees from users
     */
    async getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs) {
        const bitcoinWallet = (0, BitcoinWalletUtils_1.toBitcoinWallet)(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        if (feeRate != null) {
            if (feeRate < this.minimumBtcFeeRate)
                throw new Error("Bitcoin tx fee needs to be at least " + this.minimumBtcFeeRate + " sats/vB");
        }
        else {
            feeRate = Math.max(this.minimumBtcFeeRate, await bitcoinWallet.getFeeRate());
        }
        let { psbt, in1sequence } = await this.getPsbt();
        if (additionalOutputs != null)
            additionalOutputs.forEach(output => {
                psbt.addOutput({
                    amount: output.amount,
                    script: output.outputScript ?? (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, output.address)
                });
            });
        psbt = await bitcoinWallet.fundPsbt(psbt, feeRate);
        psbt.updateInput(1, { sequence: in1sequence });
        //Sign every input except the first one
        const signInputs = [];
        for (let i = 1; i < psbt.inputsLength; i++) {
            signInputs.push(i);
        }
        const serializedPsbt = buffer_1.Buffer.from(psbt.toPSBT());
        return {
            psbt,
            psbtHex: serializedPsbt.toString("hex"),
            psbtBase64: serializedPsbt.toString("base64"),
            signInputs
        };
    }
    /**
     * @inheritDoc
     */
    async submitPsbt(_psbt) {
        const psbt = (0, BitcoinUtils_1.parsePsbtTransaction)(_psbt);
        //Ensure not expired
        if (this.expiry < Date.now()) {
            throw new Error("Quote expired!");
        }
        //Ensure valid state
        if (this._state !== SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED && this._state !== SpvFromBTCSwapState.CREATED) {
            throw new Error("Invalid swap state!");
        }
        if (this.url == null)
            throw new Error("LP URL not known, cannot submit PSBT!");
        //Ensure all inputs except the 1st are finalized
        for (let i = 1; i < psbt.inputsLength; i++) {
            if ((0, btc_signer_1.getInputType)(psbt.getInput(i)).txType === "legacy")
                throw new Error("Legacy (non-segwit) inputs are not allowed in the transaction!");
            psbt.finalizeIdx(i);
        }
        const btcTx = await this.wrapper._btcRpc.parseTransaction(buffer_1.Buffer.from(psbt.toBytes(true)).toString("hex"));
        const data = await this.wrapper._contract.getWithdrawalData(btcTx);
        this.logger.debug("submitPsbt(): parsed withdrawal data: ", data);
        //Verify correct withdrawal data
        if (!data.isRecipient(this.recipient) ||
            data.rawAmounts[0] * this.vaultTokenMultipliers[0] !== this.outputTotalSwap ||
            (data.rawAmounts[1] ?? 0n) * this.vaultTokenMultipliers[1] !== this.outputTotalGas ||
            data.callerFeeRate !== this.callerFeeShare ||
            data.frontingFeeRate !== this.frontingFeeShare ||
            data.executionFeeRate !== this.executionFeeShare ||
            data.getSpentVaultUtxo() !== this.vaultUtxo ||
            BigInt(data.getNewVaultBtcAmount()) !== this.vaultUtxoValue ||
            !data.getNewVaultScript().equals((0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.vaultBtcAddress)) ||
            data.getExecutionData() != null) {
            throw new Error("Invalid withdrawal tx data submitted!");
        }
        //Verify correct LP output
        const lpOutput = psbt.getOutput(2);
        if (lpOutput.script == null ||
            lpOutput.amount !== this.btcAmount ||
            !(0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.btcDestinationAddress).equals(buffer_1.Buffer.from(lpOutput.script))) {
            throw new Error("Invalid LP bitcoin output in transaction!");
        }
        //Verify vault utxo not spent yet
        if (await this.wrapper._btcRpc.isSpent(this.vaultUtxo)) {
            throw new Error("Vault UTXO already spent, please create new swap!");
        }
        //Verify tx is parsable by the contract
        try {
            await this.wrapper._contract.checkWithdrawalTx(data);
        }
        catch (e) {
            throw new Error("Transaction not parsable by the contract: " + (e.message ?? e.toString()));
        }
        //Ensure still not expired
        if (this.expiry < Date.now()) {
            throw new Error("Quote expired!");
        }
        this._data = data;
        this.initiated = true;
        await this._saveAndEmit(SpvFromBTCSwapState.SIGNED);
        try {
            await IntermediaryAPI_1.IntermediaryAPI.initSpvFromBTC(this.chainIdentifier, this.url, {
                quoteId: this.quoteId,
                psbtHex: buffer_1.Buffer.from(psbt.toPSBT(0)).toString("hex")
            });
            await this._saveAndEmit(SpvFromBTCSwapState.POSTED);
        }
        catch (e) {
            await this._saveAndEmit(SpvFromBTCSwapState.DECLINED);
            throw e;
        }
        return this._data.getTxId();
    }
    /**
     * @inheritDoc
     */
    async estimateBitcoinFee(_bitcoinWallet, feeRate) {
        const bitcoinWallet = (0, BitcoinWalletUtils_1.toBitcoinWallet)(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const txFee = await bitcoinWallet.getFundedPsbtFee((await this.getPsbt()).psbt, feeRate);
        if (txFee == null)
            return null;
        return (0, TokenAmount_1.toTokenAmount)(BigInt(txFee), Token_1.BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    async sendBitcoinTransaction(wallet, feeRate) {
        const { psbt, psbtBase64, psbtHex, signInputs } = await this.getFundedPsbt(wallet, feeRate);
        let signedPsbt;
        if ((0, IBitcoinWallet_1.isIBitcoinWallet)(wallet)) {
            signedPsbt = await wallet.signPsbt(psbt, signInputs);
        }
        else {
            signedPsbt = await wallet.signPsbt({
                psbt, psbtHex, psbtBase64
            }, signInputs);
        }
        return await this.submitPsbt(signedPsbt);
    }
    /**
     * Executes the swap with the provided bitcoin wallet
     *
     * @param wallet Bitcoin wallet to use to sign the bitcoin transaction
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call the {@link claim} function to settle the swap on the
     *  destination manually
     */
    async execute(wallet, callbacks, options) {
        if (this._state === SpvFromBTCSwapState.CLOSED)
            throw new Error("Swap encountered a catastrophic failure!");
        if (this._state === SpvFromBTCSwapState.FAILED)
            throw new Error("Swap failed!");
        if (this._state === SpvFromBTCSwapState.DECLINED)
            throw new Error("Swap execution already declined by the LP!");
        if (this._state === SpvFromBTCSwapState.QUOTE_EXPIRED)
            throw new Error("Swap quote expired!");
        if (this._state === SpvFromBTCSwapState.CLAIMED || this._state === SpvFromBTCSwapState.FRONTED)
            throw new Error("Swap already settled or fronted!");
        if (this._state === SpvFromBTCSwapState.CREATED) {
            if (wallet == null && !this.hasSwapWallet())
                throw new Error("Executing without provided Bitcoin wallet parameter requires the swap to be created with the `walletMnemonic` option!");
            if (wallet != null) {
                const txId = await this.sendBitcoinTransaction(wallet, options?.feeRate);
                if (callbacks?.onSourceTransactionSent != null)
                    callbacks.onSourceTransactionSent(txId);
            }
            else {
                if (this.swapWalletType === "prefunded") {
                    await this.sendBitcoinTransaction(this._getSwapBitcoinWallet(), this.swapWalletMaxNetworkFeeRate);
                }
                else {
                    await this.waitForPayment(options?.abortSignal);
                }
            }
        }
        if (this._state === SpvFromBTCSwapState.POSTED || this._state === SpvFromBTCSwapState.BROADCASTED) {
            const txId = await this.waitForBitcoinTransaction(callbacks?.onSourceTransactionConfirmationStatus, options?.btcTxCheckIntervalSeconds, options?.abortSignal);
            if (callbacks?.onSourceTransactionConfirmed != null)
                callbacks.onSourceTransactionConfirmed(txId);
        }
        // @ts-ignore
        if (this._state === SpvFromBTCSwapState.CLAIMED || this._state === SpvFromBTCSwapState.FRONTED)
            return true;
        if (this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            const success = await this.waitTillClaimedOrFronted(options?.maxWaitTillAutomaticSettlementSeconds ?? 60, options?.abortSignal);
            if (success && callbacks?.onSwapSettled != null)
                callbacks.onSwapSettled(this.getOutputTxId());
            return success;
        }
        throw new Error("Unexpected state reached!");
    }
    /**
     * @inheritDoc
     *
     * @param options.bitcoinFeeRate Optional fee rate to use for the created Bitcoin transaction
     * @param options.bitcoinWallet Optional bitcoin wallet address specification to return a funded PSBT,
     *  if not provided a raw PSBT is returned instead which necessitates the implementor to manually add
     *  inputs to the bitcoin transaction and **set the nSequence field of the 2nd input** (input 1 -
     *  indexing from 0) to the value returned in `in1sequence`
     */
    async txsExecute(options) {
        if (this._state === SpvFromBTCSwapState.CREATED) {
            if (!await this._verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            return [
                {
                    name: "Payment",
                    description: "Send funds to the bitcoin swap address",
                    chain: "BITCOIN",
                    txs: [
                        options?.bitcoinWallet == null
                            ? { ...await this.getPsbt(), type: "RAW_PSBT" }
                            : {
                                ...await this.getFundedPsbt(options.bitcoinWallet, options?.bitcoinFeeRate),
                                type: "FUNDED_PSBT"
                            }
                    ]
                }
            ];
        }
        throw new Error("Invalid swap state to obtain execution txns, required CREATED");
    }
    /**
     * @inheritDoc
     *
     * @param options.bitcoinFeeRate Optional fee rate to use for the created Bitcoin transaction
     * @param options.bitcoinWallet Optional bitcoin wallet address specification to return a funded PSBT,
     *  if not provided a raw PSBT is returned instead which necessitates the implementor to manually add
     *  inputs to the bitcoin transaction and **set the nSequence field of the 2nd input** (input 1 -
     *  indexing from 0) to the value returned in `in1sequence`
     * @param options.manualSettlementSmartChainSigner Optional smart chain signer to create a manual claim (settlement) transaction
     * @param options.maxWaitTillAutomaticSettlementSeconds Maximum time to wait for an automatic settlement after
     *  the bitcoin transaction is confirmed (defaults to 60 seconds)
     */
    async getCurrentActions(options) {
        if (this._state === SpvFromBTCSwapState.CREATED) {
            try {
                return await this.txsExecute(options);
            }
            catch (e) { }
        }
        if (this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            if (this.btcTxConfirmedAt == null ||
                options?.maxWaitTillAutomaticSettlementSeconds === 0 ||
                (Date.now() - this.btcTxConfirmedAt) > (options?.maxWaitTillAutomaticSettlementSeconds ?? 60) * 1000) {
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
    //// Bitcoin tx listener
    /**
     * Checks whether a bitcoin payment was already made, returns the payment or null when no payment has been made.
     * @internal
     */
    async getBitcoinPayment() {
        if (this._data?.btcTx?.txid == null)
            return null;
        const result = await this.wrapper._btcRpc.getTransaction(this._data?.btcTx?.txid);
        if (result == null)
            return null;
        return {
            txId: result.txid,
            confirmations: result.confirmations ?? 0,
            targetConfirmations: this.vaultRequiredConfirmations,
            inputAddresses: result.inputAddresses
        };
    }
    /**
     * When the swap wallet address is specified it waits till the address receives the necessary funds
     *
     * @param abortSignal Abort signal
     */
    async waitForPayment(abortSignal) {
        if (this._state !== SpvFromBTCSwapState.CREATED)
            throw new Error("Must be in CREATED state!");
        if (!this.hasSwapWallet())
            throw new Error("Swap must have a swap address specified!");
        this._setInitiated();
        await this._saveAndEmit();
        //TODO: Also handle errors here
        await this.waitTillState(SpvFromBTCSwapState.CREATED, "neq", abortSignal);
        if (this._state < SpvFromBTCSwapState.CREATED)
            throw new Error("Failed to receive the bitcoin transaction in time!");
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} if in invalid state (must be {@link SpvFromBTCSwapState.POSTED} or
     *  {@link SpvFromBTCSwapState.BROADCASTED} states)
     */
    async waitForBitcoinTransaction(updateCallback, checkIntervalSeconds, abortSignal) {
        if (this._state !== SpvFromBTCSwapState.POSTED &&
            this._state !== SpvFromBTCSwapState.BROADCASTED &&
            !(this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED && this.initiated))
            throw new Error("Must be in POSTED or BROADCASTED state!");
        if (this._data == null)
            throw new Error("Expected swap to have withdrawal data filled!");
        const result = await this.wrapper._btcRpc.waitForTransaction(this._data.btcTx.txid, this.vaultRequiredConfirmations, (btcTx, txEtaMs) => {
            if (updateCallback != null)
                updateCallback(btcTx?.txid, btcTx?.confirmations, this.vaultRequiredConfirmations, txEtaMs);
            if (btcTx == null)
                return;
            let save = false;
            if (btcTx.inputAddresses != null && this._senderAddress == null) {
                this._senderAddress = btcTx.inputAddresses[1];
                save = true;
            }
            if (this._state === SpvFromBTCSwapState.POSTED || this._state == SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED) {
                this._state = SpvFromBTCSwapState.BROADCASTED;
                save = true;
            }
            if (save)
                this._saveAndEmit();
        }, abortSignal, checkIntervalSeconds);
        if (abortSignal != null)
            abortSignal.throwIfAborted();
        let save = false;
        if (result.inputAddresses != null && this._senderAddress == null) {
            this._senderAddress = result.inputAddresses[1];
            save = true;
        }
        if (this._state !== SpvFromBTCSwapState.FRONTED &&
            this._state !== SpvFromBTCSwapState.CLAIMED) {
            this.btcTxConfirmedAt ??= Date.now();
            this._state = SpvFromBTCSwapState.BTC_TX_CONFIRMED;
            save = true;
        }
        if (save)
            await this._saveAndEmit();
        return result.txid;
    }
    //////////////////////////////
    //// Claim
    /**
     * Returns transactions for settling (claiming) the swap if the swap requires manual settlement, you can check so
     *  with isClaimable. After sending the transaction manually be sure to call the waitTillClaimed function to wait
     *  till the claim transaction is observed, processed by the SDK and state of the swap properly updated.
     *
     * @remarks
     * Might also return transactions necessary to sync the bitcoin light client.
     *
     * @param _signer Address of the signer to create the claim transactions for, can also be different to the recipient
     *
     * @throws {Error} If the swap is in invalid state (must be {@link SpvFromBTCSwapState.BTC_TX_CONFIRMED})
     */
    async txsClaim(_signer) {
        let address = undefined;
        if (_signer != null) {
            if (typeof (_signer) === "string") {
                address = _signer;
            }
            else if ((0, base_1.isAbstractSigner)(_signer)) {
                address = _signer.getAddress();
            }
            else {
                address = (await this.wrapper._chain.wrapSigner(_signer)).getAddress();
            }
        }
        if (!this.isClaimable())
            throw new Error("Must be in BTC_TX_CONFIRMED state!");
        if (this._data == null)
            throw new Error("Expected swap to have withdrawal data filled!");
        const vaultData = await this.wrapper._contract.getVaultData(this.vaultOwner, this.vaultId);
        if (vaultData == null)
            throw new Error(`Vault data for ${this.vaultOwner}:${this.vaultId.toString(10)} not found (already closed???)!`);
        const btcTx = await this.wrapper._btcRpc.getTransaction(this._data.btcTx.txid);
        if (btcTx == null)
            throw new Error(`Bitcoin transaction ${this._data.btcTx.txid} not found!`);
        const txs = [btcTx];
        //Trace back from current tx to the vaultData-specified UTXO
        const vaultUtxo = vaultData.getUtxo();
        while (txs[0].ins[0].txid + ":" + txs[0].ins[0].vout !== vaultUtxo) {
            const btcTx = await this.wrapper._btcRpc.getTransaction(txs[0].ins[0].txid);
            if (btcTx == null)
                throw new Error(`Prior withdrawal bitcoin transaction ${this._data.btcTx.txid} not found!`);
            txs.unshift(btcTx);
        }
        //Parse transactions to withdrawal data
        const withdrawalData = [];
        for (let tx of txs) {
            withdrawalData.push(await this.wrapper._contract.getWithdrawalData(tx));
        }
        return await this.wrapper._contract.txsClaim(address ?? this._getInitiator(), vaultData, withdrawalData.map(tx => { return { tx }; }), this.wrapper._synchronizer, true);
    }
    /**
     * Settles the swap by claiming the funds on the destination chain if the swap requires manual settlement, you can
     *  check so with isClaimable.
     *
     * @remarks
     * Might also sync the bitcoin light client during the process.
     *
     * @param _signer Signer to use for signing the settlement transactions, can also be different to the recipient
     * @param abortSignal Abort signal
     * @param onBeforeTxSent Optional callback triggered before the claim transaction is broadcasted
     *
     * @throws {Error} If the swap is in invalid state (must be {@link SpvFromBTCSwapState.BTC_TX_CONFIRMED})
     */
    async claim(_signer, abortSignal, onBeforeTxSent) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        let txIds;
        try {
            let txCount = 0;
            const txs = await this.txsClaim(signer);
            txIds = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
                txCount++;
                if (onBeforeTxSent != null && txCount === txs.length)
                    onBeforeTxSent(txId);
                return Promise.resolve();
            });
        }
        catch (e) {
            if (this._data == null)
                throw e;
            this.logger.info("claim(): Failed to claim ourselves, checking swap claim state...");
            if (this._state === SpvFromBTCSwapState.CLAIMED) {
                this.logger.info("claim(): Transaction state is CLAIMED, swap was successfully claimed by the watchtower");
                return this._claimTxId;
            }
            const withdrawalState = await this.wrapper._contract.getWithdrawalState(this._data, this._genesisSmartChainBlockHeight);
            if (withdrawalState != null && withdrawalState.type === base_1.SpvWithdrawalStateType.CLAIMED) {
                this.logger.info("claim(): Transaction status is CLAIMED, swap was successfully claimed by the watchtower");
                this._claimTxId = withdrawalState.txId;
                await this._saveAndEmit(SpvFromBTCSwapState.CLAIMED);
                return withdrawalState.txId;
            }
            throw e;
        }
        this._claimTxId = txIds[0];
        if (this._state === SpvFromBTCSwapState.POSTED || this._state === SpvFromBTCSwapState.BROADCASTED ||
            this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED || this._state === SpvFromBTCSwapState.FAILED ||
            this._state === SpvFromBTCSwapState.FRONTED) {
            await this._saveAndEmit(SpvFromBTCSwapState.CLAIMED);
        }
        return txIds[0];
    }
    /**
     * Periodically checks the chain to see whether the swap was finished (claimed or refunded)
     *
     * @param abortSignal
     * @param interval How often to check (in seconds), default to 5s
     * @internal
     */
    async watchdogWaitTillResult(abortSignal, interval = 5) {
        if (this._data == null)
            throw new Error("Cannot await the result before the btc transaction is sent!");
        let status = { type: base_1.SpvWithdrawalStateType.NOT_FOUND };
        while (status.type === base_1.SpvWithdrawalStateType.NOT_FOUND) {
            await (0, TimeoutUtils_1.timeoutPromise)(interval * 1000, abortSignal);
            try {
                //Be smart about checking withdrawal state
                if (await this._shouldCheckWithdrawalState()) {
                    status = await this.wrapper._contract.getWithdrawalState(this._data, this._genesisSmartChainBlockHeight) ?? { type: base_1.SpvWithdrawalStateType.NOT_FOUND };
                }
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
     * Waits till the swap is successfully settled (claimed), should be called after sending the claim (settlement)
     *  transactions manually to wait till the SDK processes the settlement and updates the swap state accordingly.
     *
     * @remarks
     * This is an alias for the {@link waitTillClaimedOrFronted} function and will also resolve if the swap has
     *  been fronted (not necessarily claimed)
     *
     * @param maxWaitTimeSeconds – Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal – AbortSignal
     *
     * @returns Whether the swap was claimed in time or not
     */
    waitTillClaimed(maxWaitTimeSeconds, abortSignal) {
        return this.waitTillClaimedOrFronted(maxWaitTimeSeconds, abortSignal);
    }
    /**
     * Waits till the swap is successfully fronted or settled on the destination chain
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled (by default
     *  it waits indefinitely)
     * @param abortSignal Abort signal
     *
     * @returns {boolean} whether the swap was claimed or fronted automatically or not, if the swap was not claimed
     *  the user can claim manually through the {@link claim} function
     */
    async waitTillClaimedOrFronted(maxWaitTimeSeconds, abortSignal) {
        if (this._state === SpvFromBTCSwapState.CLAIMED || this._state === SpvFromBTCSwapState.FRONTED)
            return Promise.resolve(true);
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
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
                this.watchdogWaitTillResult(abortController.signal),
                this.waitTillState(SpvFromBTCSwapState.CLAIMED, "eq", abortController.signal).then(() => 0),
                this.waitTillState(SpvFromBTCSwapState.FRONTED, "eq", abortController.signal).then(() => 1),
                this.waitTillState(SpvFromBTCSwapState.FAILED, "eq", abortController.signal).then(() => 2),
            ]);
            abortController.abort();
        }
        catch (e) {
            abortController.abort();
            if (timedOut)
                return false;
            throw e;
        }
        if (typeof (res) === "number") {
            if (res === 0) {
                this.logger.debug("waitTillClaimedOrFronted(): Resolved from state change (CLAIMED)");
                return true;
            }
            if (res === 1) {
                this.logger.debug("waitTillClaimedOrFronted(): Resolved from state change (FRONTED)");
                return true;
            }
            if (res === 2) {
                this.logger.debug("waitTillClaimedOrFronted(): Resolved from state change (FAILED)");
                throw new Error("Swap failed while waiting for claim or front");
            }
            throw new Error("Invalid numeric response, this should never happen!");
        }
        this.logger.debug("waitTillClaimedOrFronted(): Resolved from watchdog");
        if (res.type === base_1.SpvWithdrawalStateType.FRONTED) {
            if (this._state !== SpvFromBTCSwapState.FRONTED ||
                this._state !== SpvFromBTCSwapState.CLAIMED) {
                this._frontTxId = res.txId;
                await this._saveAndEmit(SpvFromBTCSwapState.FRONTED);
            }
        }
        if (res.type === base_1.SpvWithdrawalStateType.CLAIMED) {
            if (this._state !== SpvFromBTCSwapState.CLAIMED) {
                this._claimTxId = res.txId;
                await this._saveAndEmit(SpvFromBTCSwapState.CLAIMED);
            }
        }
        if (res.type === base_1.SpvWithdrawalStateType.CLOSED) {
            if (this._state !== SpvFromBTCSwapState.CLOSED)
                await this._saveAndEmit(SpvFromBTCSwapState.CLOSED);
            throw new Error("Swap failed with catastrophic error!");
        }
        return true;
    }
    /**
     * Waits till the bitcoin transaction confirms and swap settled on the destination chain
     *
     * @param updateCallback Callback called when txId is found, and also called with subsequent confirmations
     * @param checkIntervalSeconds How often to check the bitcoin transaction (5 seconds by default)
     * @param abortSignal Abort signal
     *
     * @throws {Error} if in invalid state (must be {@link SpvFromBTCSwapState.POSTED} or
     *  {@link SpvFromBTCSwapState.BROADCASTED} states)
     */
    async waitTillExecuted(updateCallback, checkIntervalSeconds, abortSignal) {
        await this.waitForBitcoinTransaction(updateCallback, checkIntervalSeconds, abortSignal);
        await this.waitTillClaimedOrFronted(undefined, abortSignal);
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
    serialize() {
        return {
            ...super.serialize(),
            quoteId: this.quoteId,
            recipient: this.recipient,
            vaultOwner: this.vaultOwner,
            vaultId: this.vaultId.toString(10),
            vaultRequiredConfirmations: this.vaultRequiredConfirmations,
            vaultTokenMultipliers: this.vaultTokenMultipliers.map(val => val.toString(10)),
            vaultBtcAddress: this.vaultBtcAddress,
            vaultUtxo: this.vaultUtxo,
            vaultUtxoValue: this.vaultUtxoValue.toString(10),
            btcDestinationAddress: this.btcDestinationAddress,
            btcAmount: this.btcAmount.toString(10),
            btcAmountSwap: this.btcAmountSwap.toString(10),
            btcAmountGas: this.btcAmountGas.toString(10),
            minimumBtcFeeRate: this.minimumBtcFeeRate,
            outputTotalSwap: this.outputTotalSwap.toString(10),
            outputSwapToken: this.outputSwapToken,
            outputTotalGas: this.outputTotalGas.toString(10),
            outputGasToken: this.outputGasToken,
            gasSwapFeeBtc: this.gasSwapFeeBtc.toString(10),
            gasSwapFee: this.gasSwapFee.toString(10),
            callerFeeShare: this.callerFeeShare.toString(10),
            frontingFeeShare: this.frontingFeeShare.toString(10),
            executionFeeShare: this.executionFeeShare.toString(10),
            genesisSmartChainBlockHeight: this._genesisSmartChainBlockHeight,
            gasPricingInfo: (0, PriceInfoType_1.serializePriceInfoType)(this.gasPricingInfo),
            swapWalletWIF: this.swapWalletWIF,
            swapWalletAddress: this.swapWalletAddress,
            swapWalletMaxNetworkFeeRate: this.swapWalletMaxNetworkFeeRate,
            swapWalletType: this.swapWalletType,
            senderAddress: this._senderAddress,
            claimTxId: this._claimTxId,
            frontTxId: this._frontTxId,
            data: this._data?.serialize(),
            btcTxConfirmedAt: this.btcTxConfirmedAt
        };
    }
    //////////////////////////////
    //// Swap ticks & sync
    /**
     * Used to set the txId of the bitcoin payment from the on-chain events listener
     *
     * @param txId
     * @internal
     */
    async _setBitcoinTxId(txId) {
        if (this._data == null)
            return;
        if (txId != this._data.btcTx.txid)
            return;
        if (this._senderAddress != null)
            return;
        const btcTx = await this.wrapper._btcRpc.getTransaction(txId);
        if (btcTx == null || btcTx.inputAddresses == null)
            return;
        this._senderAddress = btcTx.inputAddresses[1];
    }
    /**
     * @internal
     */
    async _syncStateFromBitcoin(save) {
        if (this._data?.btcTx == null)
            return false;
        //Check if bitcoin payment was confirmed
        const res = await this.getBitcoinPayment();
        if (res == null) {
            //Check inputs double-spent
            for (let input of this._data.btcTx.ins) {
                if (await this.wrapper._btcRpc.isSpent(input.txid + ":" + input.vout, true)) {
                    if (this._state === SpvFromBTCSwapState.SIGNED ||
                        this._state === SpvFromBTCSwapState.POSTED ||
                        this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED ||
                        this._state === SpvFromBTCSwapState.DECLINED) {
                        //One of the inputs was double-spent
                        this._state = SpvFromBTCSwapState.QUOTE_EXPIRED;
                    }
                    else {
                        //One of the inputs was double-spent
                        this._state = SpvFromBTCSwapState.FAILED;
                    }
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
            }
        }
        else {
            let needsSave = false;
            if (res.inputAddresses != null && this._senderAddress == null) {
                this._senderAddress = res.inputAddresses[1];
                needsSave = true;
            }
            if (res.confirmations >= this.vaultRequiredConfirmations) {
                if (this._state !== SpvFromBTCSwapState.BTC_TX_CONFIRMED &&
                    this._state !== SpvFromBTCSwapState.FRONTED &&
                    this._state !== SpvFromBTCSwapState.CLAIMED) {
                    this.btcTxConfirmedAt ??= Date.now();
                    this._state = SpvFromBTCSwapState.BTC_TX_CONFIRMED;
                    needsSave = true;
                }
            }
            else if (this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED ||
                this._state === SpvFromBTCSwapState.POSTED ||
                this._state === SpvFromBTCSwapState.SIGNED ||
                this._state === SpvFromBTCSwapState.DECLINED) {
                this._state = SpvFromBTCSwapState.BROADCASTED;
                needsSave = true;
            }
            if (needsSave && save)
                await this._saveAndEmit();
            return needsSave;
        }
        return false;
    }
    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     */
    async syncStateFromChain() {
        let changed = false;
        if (this._state === SpvFromBTCSwapState.SIGNED ||
            this._state === SpvFromBTCSwapState.POSTED ||
            this._state === SpvFromBTCSwapState.BROADCASTED ||
            this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state === SpvFromBTCSwapState.DECLINED ||
            this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            //Check BTC transaction
            if (await this._syncStateFromBitcoin(false))
                changed ||= true;
        }
        if (this._state === SpvFromBTCSwapState.BROADCASTED || this._state === SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            if (await this._shouldCheckWithdrawalState()) {
                const status = await this.wrapper._contract.getWithdrawalState(this._data, this._genesisSmartChainBlockHeight);
                this.logger.debug("syncStateFromChain(): status of " + this._data.btcTx.txid, status);
                switch (status?.type) {
                    case base_1.SpvWithdrawalStateType.FRONTED:
                        this._frontTxId = status.txId;
                        this._state = SpvFromBTCSwapState.FRONTED;
                        changed ||= true;
                        break;
                    case base_1.SpvWithdrawalStateType.CLAIMED:
                        this._claimTxId = status.txId;
                        this._state = SpvFromBTCSwapState.CLAIMED;
                        changed ||= true;
                        break;
                    case base_1.SpvWithdrawalStateType.CLOSED:
                        this._state = SpvFromBTCSwapState.CLOSED;
                        changed ||= true;
                        break;
                }
            }
        }
        if (this._state === SpvFromBTCSwapState.CREATED ||
            this._state === SpvFromBTCSwapState.SIGNED ||
            this._state === SpvFromBTCSwapState.POSTED) {
            if (this.expiry < Date.now()) {
                if (this._state === SpvFromBTCSwapState.CREATED) {
                    this._state = SpvFromBTCSwapState.QUOTE_EXPIRED;
                }
                else {
                    this._state = SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED;
                }
                changed ||= true;
            }
        }
        return changed;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save) {
        const changed = await this.syncStateFromChain();
        if (changed && save)
            await this._saveAndEmit();
        return changed;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save) {
        if (this._state === SpvFromBTCSwapState.CREATED ||
            this._state === SpvFromBTCSwapState.SIGNED) {
            if (this.getQuoteExpiry() < Date.now()) {
                this._state = SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED;
                if (save)
                    await this._saveAndEmit();
                return true;
            }
        }
        if (this._state === SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED && !this.initiated) {
            if (this.expiry < Date.now()) {
                this._state = SpvFromBTCSwapState.QUOTE_EXPIRED;
                if (save)
                    await this._saveAndEmit();
                return true;
            }
        }
        if (Math.floor(Date.now() / 1000) % 120 === 0) {
            if (this._state === SpvFromBTCSwapState.POSTED ||
                this._state === SpvFromBTCSwapState.BROADCASTED) {
                try {
                    //Check if bitcoin payment was confirmed
                    return await this._syncStateFromBitcoin(save);
                }
                catch (e) {
                    this.logger.error("tickSwap(" + this.getId() + "): ", e);
                }
            }
        }
        return false;
    }
    /**
     * Checks whether an on-chain withdrawal state should be fetched for this specific swap
     *
     * @internal
     */
    async _shouldCheckWithdrawalState(frontingAddress, vaultDataUtxo) {
        if (frontingAddress === undefined)
            frontingAddress = await this.wrapper._contract.getFronterAddress(this.vaultOwner, this.vaultId, this._data);
        if (vaultDataUtxo === undefined)
            vaultDataUtxo = await this.wrapper._contract.getVaultLatestUtxo(this.vaultOwner, this.vaultId);
        if (frontingAddress != null)
            return true; //In case the swap is fronted there will for sure be a fronted event
        if (vaultDataUtxo == null)
            return true; //Vault UTXO is null (the vault closed)
        const [txId, _] = vaultDataUtxo.split(":");
        //Don't check both txns if their txId is equal
        if (this._data.btcTx.txid === txId)
            return true;
        const [btcTx, latestVaultTx] = await Promise.all([
            this.wrapper._btcRpc.getTransaction(this._data.btcTx.txid),
            this.wrapper._btcRpc.getTransaction(txId)
        ]);
        if (latestVaultTx == null || latestVaultTx.blockheight == null) {
            //Something must've gone horribly wrong, the latest vault utxo tx of the vault either
            // cannot be found on bitcoin network or is not even confirmed yet
            this.logger.debug(`_shouldCheckWithdrawalState(): Latest vault utxo not found or not confirmed on bitcoin ${txId}`);
            return false;
        }
        if (btcTx != null) {
            const btcTxHeight = btcTx.blockheight;
            const latestVaultTxHeight = latestVaultTx.blockheight;
            //We also need to cover the case where bitcoin tx isn't confirmed yet (hence btxTxHeight==null)
            if (btcTxHeight == null || latestVaultTxHeight < btcTxHeight) {
                //Definitely not claimed!
                this.logger.debug(`_shouldCheckWithdrawalState(): Skipped checking withdrawal state, latestVaultTxHeight: ${latestVaultTx.blockheight}, btcTxHeight: ${btcTxHeight} and not fronted!`);
                return false;
            }
        }
        else {
            //Definitely not claimed because the transaction was probably double-spent (or evicted from mempool)
            this.logger.debug(`_shouldCheckWithdrawalState(): Skipped checking withdrawal state, btc tx probably replaced or evicted: ${this._data.btcTx.txid} and not fronted`);
            return false;
        }
        return true;
    }
}
exports.SpvFromBTCSwap = SpvFromBTCSwap;
