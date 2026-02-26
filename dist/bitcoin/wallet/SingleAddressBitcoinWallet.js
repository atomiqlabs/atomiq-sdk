"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SingleAddressBitcoinWallet = void 0;
const utils_1 = require("@scure/btc-signer/utils");
const btc_signer_1 = require("@scure/btc-signer");
const buffer_1 = require("buffer");
const BitcoinWallet_1 = require("./BitcoinWallet");
const bip32_1 = require("@scure/bip32");
const bip39_1 = require("@scure/bip39");
const english_js_1 = require("@scure/bip39/wordlists/english.js");
const sha2_1 = require("@noble/hashes/sha2");
const BitcoinNotEnoughBalanceError_1 = require("../../errors/BitcoinNotEnoughBalanceError");
/**
 * Bitcoin wallet implementation deriving a single address from a WIF encoded private key
 *
 * @category Bitcoin
 */
class SingleAddressBitcoinWallet extends BitcoinWallet_1.BitcoinWallet {
    constructor(mempoolApi, _network, addressDataOrWIF, feeMultiplier = 1.25, feeOverride) {
        const network = typeof (_network) === "object"
            ? _network
            : BitcoinWallet_1.BitcoinWallet.bitcoinNetworkToObject(_network);
        super(mempoolApi, network, feeMultiplier, feeOverride);
        if (typeof (addressDataOrWIF) === "string") {
            try {
                this.privKey = (0, btc_signer_1.WIF)(network).decode(addressDataOrWIF);
            }
            catch (e) {
                this.privKey = (0, btc_signer_1.WIF)().decode(addressDataOrWIF);
            }
            this.pubkey = (0, utils_1.pubECDSA)(this.privKey);
            const address = (0, btc_signer_1.getAddress)("wpkh", this.privKey, network);
            if (address == null)
                throw new Error("Failed to generate p2wpkh address from the provided private key!");
            this.address = address;
        }
        else {
            this.address = addressDataOrWIF.address;
            this.pubkey = buffer_1.Buffer.from(addressDataOrWIF.publicKey, "hex");
        }
        this.addressType = (0, BitcoinWallet_1.identifyAddressType)(this.address, network);
    }
    /**
     * Returns all the wallet addresses controlled by the wallet
     *
     * @protected
     */
    toBitcoinWalletAccounts() {
        return [{
                pubkey: buffer_1.Buffer.from(this.pubkey).toString("hex"), address: this.address, addressType: this.addressType
            }];
    }
    /**
     * @inheritDoc
     */
    async sendTransaction(address, amount, feeRate, utxos) {
        if (!this.privKey)
            throw new Error("Not supported.");
        const { psbt, fee } = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate, utxos);
        if (psbt == null)
            throw new BitcoinNotEnoughBalanceError_1.BitcoinNotEnoughBalanceError(`Not enough funds, required for fee: ${fee} sats!`);
        psbt.sign(this.privKey);
        psbt.finalize();
        const txHex = buffer_1.Buffer.from(psbt.extract()).toString("hex");
        return await super._sendTransaction(txHex);
    }
    /**
     * @inheritDoc
     */
    async fundPsbt(inputPsbt, feeRate, utxos) {
        const { psbt } = await super._fundPsbt(this.toBitcoinWalletAccounts(), inputPsbt, feeRate, utxos);
        if (psbt == null) {
            throw new BitcoinNotEnoughBalanceError_1.BitcoinNotEnoughBalanceError("Not enough balance!");
        }
        return psbt;
    }
    /**
     * @inheritDoc
     */
    async signPsbt(psbt, signInputs) {
        if (!this.privKey)
            throw new Error("Not supported.");
        for (let signInput of signInputs) {
            psbt.signIdx(this.privKey, signInput);
        }
        return psbt;
    }
    /**
     * @inheritDoc
     */
    async getTransactionFee(address, amount, feeRate, utxos) {
        const { fee } = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate, utxos);
        return fee;
    }
    /**
     * @inheritDoc
     */
    async getFundedPsbtFee(basePsbt, feeRate, utxos) {
        const { fee } = await super._fundPsbt(this.toBitcoinWalletAccounts(), basePsbt, feeRate, utxos);
        return fee;
    }
    /**
     * @inheritDoc
     */
    getReceiveAddress() {
        return this.address;
    }
    /**
     * Returns the public key of the wallet
     */
    getPublicKey() {
        return buffer_1.Buffer.from(this.pubkey).toString("hex");
    }
    /**
     * @inheritDoc
     */
    getBalance() {
        return this._getBalance(this.address);
    }
    /**
     * @inheritDoc
     */
    getSpendableBalance(psbt, feeRate, outputAddressType, utxos) {
        return this._getSpendableBalance([{ address: this.address, addressType: this.addressType }], psbt, feeRate, outputAddressType, utxos);
    }
    async getUtxoPool() {
        return this._getUtxoPool(this.address, this.addressType);
    }
    /**
     * Adds the requested UTXOs into the PSBT. Careful with this because it doesn't add change outputs automatically!
     *
     * @param psbt PSBT to fund (add UTXOs to)
     * @param utxos UTXOs to add to the PSBT
     */
    static fundPsbtWithExactUtxos(psbt, utxos) {
        //TODO: This only works for p2wpkh addresses!
        utxos.forEach((utxo) => {
            psbt.addInput({
                txid: utxo.txId, index: utxo.vout,
                witnessUtxo: {
                    amount: BigInt(utxo.value),
                    script: utxo.outputScript
                },
                sighashType: 0x01
            });
        });
        const fee = psbt.fee;
        const txVSize = BitcoinWallet_1.BitcoinWallet.estimatePsbtVSize(psbt);
        const txFeeRate = Number(fee) / txVSize;
        let cpfpInputsVSize = 0;
        let cpfpInputsFee = 0;
        utxos.forEach((utxo) => {
            if (utxo.cpfp == null)
                return;
            if (utxo.cpfp.txEffectiveFeeRate < txFeeRate)
                return;
            cpfpInputsVSize += utxo.cpfp.txVsize;
            cpfpInputsFee += Math.ceil(utxo.cpfp.txEffectiveFeeRate * utxo.cpfp.txVsize);
        });
        const feeRate = (cpfpInputsFee + Number(fee)) / (txVSize + cpfpInputsVSize);
        return {
            psbt,
            fee,
            feeRate
        };
    }
    /**
     * Generates a new random private key WIF that can be used to instantiate the bitcoin wallet instance
     *
     * @returns A WIF encoded bitcoin private key
     */
    static generateRandomPrivateKey(network) {
        const networkObject = network == null || typeof (network) === "object"
            ? network
            : BitcoinWallet_1.BitcoinWallet.bitcoinNetworkToObject(network);
        return (0, btc_signer_1.WIF)(networkObject).encode((0, utils_1.randomPrivateKeyBytes)());
    }
    /**
     * Generates a 12-word long mnemonic from any entropy source with 128-bits or more, the entropy is first hashed
     *  using sha256, and the first 16 bytes of the hash are used to generate the mnemonic
     *
     * @param entropy Entropy to use for generating the mnemonic
     */
    static mnemonicFromEntropy(entropy) {
        if (entropy.length < 16)
            throw new Error("Requires at least 128-bit entropy (16 bytes)");
        const entropyHash = buffer_1.Buffer.from((0, sha2_1.sha256)(entropy)).subarray(0, 16);
        return (0, bip39_1.entropyToMnemonic)(entropyHash, english_js_1.wordlist);
    }
    /**
     * Generates a random 12-word long mnemonic
     */
    static generateRandomMnemonic() {
        return (0, bip39_1.generateMnemonic)(english_js_1.wordlist, 128);
    }
    /**
     * Generates a WIF private key from mnemonic phrase
     *
     * @param mnemonic Mnemonic to generate the WIF key from
     * @param network Optional bitcoin network to generate the WIF for
     * @param derivationPath Optional custom derivation path to use for deriving the wallet
     */
    static async mnemonicToPrivateKey(mnemonic, network, derivationPath) {
        const networkObject = network == null || typeof (network) === "object"
            ? network
            : BitcoinWallet_1.BitcoinWallet.bitcoinNetworkToObject(network);
        derivationPath = networkObject == null || networkObject.bech32 === utils_1.NETWORK.bech32
            ? "m/84'/0'/0'/0/0" //Mainnet
            : "m/84'/1'/0'/0/0"; //Testnet
        const seed = await (0, bip39_1.mnemonicToSeed)(mnemonic);
        const hdKey = bip32_1.HDKey.fromMasterSeed(seed);
        const privateKey = hdKey.derive(derivationPath).privateKey;
        if (privateKey == null)
            throw new Error("Cannot derive private key from the mnemonic!");
        return (0, btc_signer_1.WIF)(networkObject).encode(privateKey);
    }
}
exports.SingleAddressBitcoinWallet = SingleAddressBitcoinWallet;
