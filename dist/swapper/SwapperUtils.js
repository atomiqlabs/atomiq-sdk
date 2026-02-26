"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapperUtils = void 0;
const bolt11_1 = require("@atomiqlabs/bolt11");
const btc_signer_1 = require("@scure/btc-signer");
const LNURL_1 = require("../lnurl/LNURL");
const SwapType_1 = require("../enums/SwapType");
const SingleAddressBitcoinWallet_1 = require("../bitcoin/wallet/SingleAddressBitcoinWallet");
const base_1 = require("@atomiqlabs/base");
const Utils_1 = require("../utils/Utils");
const TokenAmount_1 = require("../types/TokenAmount");
const Token_1 = require("../types/Token");
const LNURLWithdraw_1 = require("../types/lnurl/LNURLWithdraw");
const LNURLPay_1 = require("../types/lnurl/LNURLPay");
const BitcoinWalletUtils_1 = require("../utils/BitcoinWalletUtils");
const SpvFromBTCWrapper_1 = require("../swaps/spv_swaps/SpvFromBTCWrapper");
/**
 * Utility class providing helper methods for address parsing, token balances, serialization
 *  and other miscellaneous things.
 *
 * @category Core
 */
class SwapperUtils {
    constructor(root) {
        this.bitcoinNetwork = root._btcNetwork;
        this.root = root;
    }
    /**
     * Checks whether a passed address is a valid address on the smart chain
     *
     * @param address Address
     * @param chainId Smart chain identifier string to check the address for
     */
    isValidSmartChainAddress(address, chainId) {
        if (chainId != null) {
            if (this.root._chains[chainId] == null)
                throw new Error(`Unknown chain id: ${chainId}`);
            return this.root._chains[chainId].chainInterface.isValidAddress(address);
        }
        for (let chainId of this.root.getSmartChains()) {
            if (this.root._chains[chainId].chainInterface.isValidAddress(address))
                return true;
        }
        return false;
    }
    /**
     * Checks whether an address is a valid BOLT11 bitcoin lightning invoice
     *
     * @param address Address to check
     */
    isLightningInvoice(address) {
        try {
            (0, bolt11_1.decode)(address);
            return true;
        }
        catch (e) { }
        return false;
    }
    /**
     * Checks whether an address is a valid bitcoin address
     *
     * @param address Address to check
     */
    isValidBitcoinAddress(address) {
        try {
            (0, btc_signer_1.Address)(this.bitcoinNetwork).decode(address);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**
     * Checks whether an address is a valid BOLT11 bitcoin lightning invoice WITH AMOUNT
     *
     * @param address Address to check
     */
    isValidLightningInvoice(address) {
        try {
            const parsed = (0, bolt11_1.decode)(address);
            if (parsed.millisatoshis != null)
                return true;
        }
        catch (e) { }
        return false;
    }
    /**
     * Checks whether an address is a valid LNURL (no checking on type is performed)
     *
     * @param address Address to check
     */
    isValidLNURL(address) {
        return LNURL_1.LNURL.isLNURL(address);
    }
    /**
     * Returns type and data about an LNURL
     *
     * @param lnurl LNURL link to check, can be either `pay` or `withdraw` type
     * @param shouldRetry Optional whether HTTP requests should retried on failure
     */
    getLNURLTypeAndData(lnurl, shouldRetry) {
        return LNURL_1.LNURL.getLNURLType(lnurl, shouldRetry);
    }
    /**
     * Returns satoshi value of BOLT11 bitcoin lightning invoice WITH AMOUNT, returns null otherwise
     *
     * @param lnpr
     */
    getLightningInvoiceValue(lnpr) {
        const parsed = (0, bolt11_1.decode)(lnpr);
        if (parsed.millisatoshis != null)
            return (BigInt(parsed.millisatoshis) + 999n) / 1000n;
        return null;
    }
    parseBitcoinAddress(resultText) {
        let _amount = undefined;
        if (resultText.includes("?")) {
            const arr = resultText.split("?");
            resultText = arr[0];
            const params = arr[1].split("&");
            for (let param of params) {
                const arr2 = param.split("=");
                const key = arr2[0];
                const value = decodeURIComponent(arr2[1]);
                if (key === "amount") {
                    _amount = (0, Utils_1.fromDecimal)(parseFloat(value).toFixed(8), 8);
                }
            }
        }
        if (this.isValidBitcoinAddress(resultText)) {
            return {
                address: resultText,
                type: "BITCOIN",
                swapType: SwapType_1.SwapType.TO_BTC,
                amount: _amount == null ? undefined : (0, TokenAmount_1.toTokenAmount)(_amount, Token_1.BitcoinTokens.BTC, this.root.prices)
            };
        }
        return null;
    }
    parseLNURLSync(resultText) {
        if (this.isValidLNURL(resultText)) {
            return {
                address: resultText,
                type: "LNURL",
                swapType: null
            };
        }
        return null;
    }
    async parseLNURL(resultText) {
        if (this.isValidLNURL(resultText)) {
            try {
                const result = await this.getLNURLTypeAndData(resultText);
                if (result == null)
                    throw new Error("Invalid LNURL specified!");
                const swapType = (0, LNURLPay_1.isLNURLPay)(result) ? SwapType_1.SwapType.TO_BTCLN : (0, LNURLWithdraw_1.isLNURLWithdraw)(result) ? SwapType_1.SwapType.FROM_BTCLN : null;
                if (swapType == null)
                    return null;
                const response = {
                    address: resultText,
                    type: "LNURL",
                    swapType,
                    lnurl: result
                };
                if (result.min === result.max) {
                    return {
                        ...response,
                        amount: result.min == null ? undefined : (0, TokenAmount_1.toTokenAmount)(result.min, Token_1.BitcoinTokens.BTCLN, this.root.prices)
                    };
                }
                else {
                    return {
                        ...response,
                        min: result.min == null ? undefined : (0, TokenAmount_1.toTokenAmount)(result.min, Token_1.BitcoinTokens.BTCLN, this.root.prices),
                        max: result.min == null ? undefined : (0, TokenAmount_1.toTokenAmount)(result.max, Token_1.BitcoinTokens.BTCLN, this.root.prices)
                    };
                }
            }
            catch (e) {
                throw new Error("Failed to contact LNURL service, check your internet connection and retry later.");
            }
        }
        return null;
    }
    parseLightningInvoice(resultText) {
        if (this.isLightningInvoice(resultText)) {
            if (this.isValidLightningInvoice(resultText)) {
                const amount = this.getLightningInvoiceValue(resultText);
                if (amount == null)
                    throw new Error();
                return {
                    address: resultText,
                    type: "LIGHTNING",
                    swapType: SwapType_1.SwapType.TO_BTCLN,
                    amount: (0, TokenAmount_1.toTokenAmount)(amount, Token_1.BitcoinTokens.BTCLN, this.root.prices)
                };
            }
            else {
                throw new Error("Lightning invoice needs to contain an amount!");
            }
        }
        return null;
    }
    parseSmartchainAddress(resultText) {
        for (let chainId of this.root.getSmartChains()) {
            if (this.root._chains[chainId].chainInterface.isValidAddress(resultText)) {
                return {
                    address: resultText,
                    type: chainId,
                    swapType: null
                };
            }
        }
        return null;
    }
    /**
     * General parser for bitcoin addresses, LNURLs, lightning invoices, smart chain addresses. Also fetches LNURL data
     *  (hence async and returns Promise).
     *
     * @param addressString Address to parse
     * @throws {Error} Error in address parsing
     * @returns Address data or `null` if address doesn't conform to any known format
     */
    async parseAddress(addressString) {
        if (addressString.startsWith("bitcoin:")) {
            const parsedBitcoinAddress = this.parseBitcoinAddress(addressString.substring(8));
            if (parsedBitcoinAddress != null)
                return parsedBitcoinAddress;
            throw new Error("Invalid bitcoin address!");
        }
        const parsedBitcoinAddress = this.parseBitcoinAddress(addressString);
        if (parsedBitcoinAddress != null)
            return parsedBitcoinAddress;
        if (addressString.startsWith("lightning:")) {
            const resultText = addressString.substring(10);
            const resultLnurl = await this.parseLNURL(resultText);
            if (resultLnurl != null)
                return resultLnurl;
            const resultLightningInvoice = this.parseLightningInvoice(resultText);
            if (resultLightningInvoice != null)
                return resultLightningInvoice;
            throw new Error("Invalid lightning network invoice or LNURL!");
        }
        const resultLnurl = await this.parseLNURL(addressString);
        if (resultLnurl != null)
            return resultLnurl;
        const resultLightningInvoice = this.parseLightningInvoice(addressString);
        if (resultLightningInvoice != null)
            return resultLightningInvoice;
        return this.parseSmartchainAddress(addressString);
    }
    /**
     * Synchronous general parser for bitcoin addresses, LNURLs, lightning invoices, smart chain addresses, doesn't fetch
     *  LNURL data, returns `swapType: null` instead to prevent returning a Promise
     *
     * @param addressString Address to parse
     * @throws {Error} Error in address parsing
     * @returns Address data or `null` if address doesn't conform to any known format
     */
    parseAddressSync(addressString) {
        if (addressString.startsWith("bitcoin:")) {
            const parsedBitcoinAddress = this.parseBitcoinAddress(addressString.substring(8));
            if (parsedBitcoinAddress != null)
                return parsedBitcoinAddress;
            throw new Error("Invalid bitcoin address!");
        }
        const parsedBitcoinAddress = this.parseBitcoinAddress(addressString);
        if (parsedBitcoinAddress != null)
            return parsedBitcoinAddress;
        if (addressString.startsWith("lightning:")) {
            const resultText = addressString.substring(10);
            const resultLnurl = this.parseLNURLSync(resultText);
            if (resultLnurl != null)
                return resultLnurl;
            const resultLightningInvoice = this.parseLightningInvoice(resultText);
            if (resultLightningInvoice != null)
                return resultLightningInvoice;
            throw new Error("Invalid lightning network invoice or LNURL!");
        }
        const resultLnurl = this.parseLNURLSync(addressString);
        if (resultLnurl != null)
            return resultLnurl;
        const resultLightningInvoice = this.parseLightningInvoice(addressString);
        if (resultLightningInvoice != null)
            return resultLightningInvoice;
        return this.parseSmartchainAddress(addressString);
    }
    /**
     * Returns a random PSBT that can be used for fee estimation for SPV vault (UTXO-controlled vault) based swaps
     *  {@link SwapType.SPV_VAULT_FROM_BTC}, the last output (the LP output) is omitted to allow for coinselection
     *  algorithm to determine maximum sendable amount there
     *
     * @param chainIdentifier Smart chain to swap to
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    getRandomSpvVaultPsbt(chainIdentifier, includeGasToken) {
        const wrapper = this.root._chains[chainIdentifier].wrappers[SwapType_1.SwapType.SPV_VAULT_FROM_BTC];
        if (wrapper == null)
            throw new Error("Chain doesn't support spv vault swaps!");
        return wrapper.getDummySwapPsbt(includeGasToken);
    }
    /**
     * Returns the spendable balance of a bitcoin wallet
     *
     * @param wallet Bitcoin wallet to check the spendable balance for, can either be a simple
     *  bitcoin address string or a wallet object
     * @param targetChain Destination smart chain for the swap, the ensures proper spendable balance
     *  is estimated taking into consideration different swap primitives available on different chains
     * @param options Additional options
     */
    async getBitcoinSpendableBalance(wallet, targetChain, options) {
        let bitcoinWallet;
        if (typeof (wallet) === "string") {
            bitcoinWallet = new SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet(this.root._bitcoinRpc, this.bitcoinNetwork, { address: wallet, publicKey: "" });
        }
        else {
            bitcoinWallet = (0, BitcoinWalletUtils_1.toBitcoinWallet)(wallet, this.root._bitcoinRpc, this.bitcoinNetwork);
        }
        let feeRate = options?.feeRate ?? await bitcoinWallet.getFeeRate();
        if (options?.minFeeRate != null)
            feeRate = Math.max(feeRate, options.minFeeRate);
        let result;
        if (targetChain != null && this.root.supportsSwapType(targetChain, SwapType_1.SwapType.SPV_VAULT_FROM_BTC)) {
            result = await bitcoinWallet.getSpendableBalance(this.getRandomSpvVaultPsbt(targetChain, options?.gasDrop), feeRate, SpvFromBTCWrapper_1.REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE);
        }
        else {
            result = await bitcoinWallet.getSpendableBalance(undefined, feeRate);
        }
        return {
            balance: (0, TokenAmount_1.toTokenAmount)(result.balance, Token_1.BitcoinTokens.BTC, this.root.prices),
            feeRate: result.feeRate
        };
    }
    /**
     * Returns the maximum spendable balance of the smart chain wallet, deducting the fee needed
     *  to initiate a swap for native balances
     */
    async getSpendableBalance(wallet, token, options) {
        if (this.root._chains[token.chainId] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + token.chainId);
        const { swapContract, chainInterface } = this.root._chains[token.chainId];
        let signer;
        if (typeof (wallet) === "string") {
            signer = wallet;
        }
        else {
            const abstractSigner = (0, base_1.isAbstractSigner)(wallet) ? wallet : await chainInterface.wrapSigner(wallet);
            signer = abstractSigner.getAddress();
        }
        let finalBalance;
        if (chainInterface.getNativeCurrencyAddress() !== token.address) {
            finalBalance = await chainInterface.getBalance(signer, token.address);
        }
        else {
            let [balance, commitFee] = await Promise.all([
                chainInterface.getBalance(signer, token.address),
                swapContract.getCommitFee(signer, 
                //Use large amount, such that the fee for wrapping more tokens is always included!
                await swapContract.createSwapData(base_1.ChainSwapType.HTLC, signer, chainInterface.randomAddress(), token.address, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn, swapContract.getHashForHtlc((0, Utils_1.randomBytes)(32)).toString("hex"), base_1.BigIntBufferUtils.fromBuffer((0, Utils_1.randomBytes)(8)), BigInt(Math.floor(Date.now() / 1000)), true, false, base_1.BigIntBufferUtils.fromBuffer((0, Utils_1.randomBytes)(2)), base_1.BigIntBufferUtils.fromBuffer((0, Utils_1.randomBytes)(2))), options?.feeRate)
            ]);
            if (options?.feeMultiplier != null) {
                commitFee = commitFee * (BigInt(Math.floor(options.feeMultiplier * 1000000))) / 1000000n;
            }
            finalBalance = (0, Utils_1.bigIntMax)(balance - commitFee, 0n);
        }
        return (0, TokenAmount_1.toTokenAmount)(finalBalance, token, this.root.prices);
    }
    /**
     * Returns the address of the native currency of the smart chain
     */
    getNativeToken(chainIdentifier) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._tokens[chainIdentifier][this.root._chains[chainIdentifier].chainInterface.getNativeCurrencyAddress()];
    }
    /**
     * Returns a random signer for a given smart chain
     *
     * @param chainIdentifier
     */
    randomSigner(chainIdentifier) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.randomSigner();
    }
    /**
     * Returns a random address for a given smart chain
     *
     * @param chainIdentifier
     */
    randomAddress(chainIdentifier) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.randomAddress();
    }
    /**
     * Signs and broadcasts the supplied smart chain transaction
     *
     * @param chainIdentifier Smart chain identifier string
     * @param signer Signer to use for signing the transactions
     * @param txs An array of transactions to sign
     * @param abortSignal Abort signal
     * @param onBeforePublish Callback invoked before a transaction is sent (invoked for every transaction to be sent)
     */
    sendAndConfirm(chainIdentifier, signer, txs, abortSignal, onBeforePublish) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.sendAndConfirm(signer, txs, true, abortSignal, false, onBeforePublish);
    }
    /**
     * Broadcasts already signed smart chain transactions
     *
     * @param chainIdentifier Smart chain identifier string
     * @param txs An array of already signed transactions
     * @param abortSignal Abort signal
     * @param onBeforePublish Callback invoked before a transaction is sent (invoked for every transaction to be sent)
     */
    sendSignedAndConfirm(chainIdentifier, txs, abortSignal, onBeforePublish) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.sendSignedAndConfirm(txs, true, abortSignal, false, onBeforePublish);
    }
    /**
     * Serializes an unsigned smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx An unsigned transaction to serialize
     */
    serializeUnsignedTransaction(chainIdentifier, tx) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.serializeTx(tx);
    }
    /**
     * Deserializes an unsigned smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx Serialized unsigned transaction
     */
    deserializeUnsignedTransaction(chainIdentifier, tx) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.deserializeTx(tx);
    }
    /**
     * Serializes a signed smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx A signed transaction to serialize
     */
    serializeSignedTransaction(chainIdentifier, tx) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.serializeSignedTx(tx);
    }
    /**
     * Deserializes a signed smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx Serialized signed transaction
     */
    deserializeSignedTransaction(chainIdentifier, tx) {
        if (this.root._chains[chainIdentifier] == null)
            throw new Error("Invalid chain identifier! Unknown chain: " + chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.deserializeSignedTx(tx);
    }
}
exports.SwapperUtils = SwapperUtils;
