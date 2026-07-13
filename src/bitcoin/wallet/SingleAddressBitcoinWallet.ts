import {CoinselectAddressTypes} from "../coinselect2/index.js";
import {BTC_NETWORK, NETWORK, pubECDSA, randomPrivateKeyBytes, TEST_NETWORK} from "@scure/btc-signer/utils"
import {getAddress, Transaction, WIF} from "@scure/btc-signer";
import {Buffer} from "buffer";
import {identifyAddressType, BitcoinWallet} from "./BitcoinWallet.js";
import {BitcoinNetwork, BitcoinRpcWithAddressIndex, getLogger} from "@atomiqlabs/base";
import {HDKey} from "@scure/bip32";
import {entropyToMnemonic, generateMnemonic, mnemonicToSeed} from "@scure/bip39";
import {wordlist} from "@scure/bip39/wordlists/english.js";
import {sha256} from "@noble/hashes/sha2";
import {BitcoinWalletUtxo, BitcoinWalletUtxoBase} from "./IBitcoinWallet.js";

const logger = getLogger("SingleAddressBitcoinWallet: ");

/**
 * Bitcoin wallet implementation deriving a single address from a WIF encoded private key
 *
 * @category Bitcoin
 */
export class SingleAddressBitcoinWallet extends BitcoinWallet {

    protected readonly privKey?: Uint8Array;
    protected readonly pubkey: Buffer;
    protected readonly address: string;
    protected readonly addressType: CoinselectAddressTypes;

    constructor(
        mempoolApi: BitcoinRpcWithAddressIndex<any>,
        _network: BitcoinNetwork | BTC_NETWORK,
        addressDataOrWIF: string | {address: string, publicKey: string},
        feeMultiplier: number = 1.25,
        feeOverride?: number
    ) {
        const network = typeof(_network)==="object"
            ? _network
            : BitcoinWallet.bitcoinNetworkToObject(_network);
        super(mempoolApi, network, feeMultiplier, feeOverride);
        if(typeof(addressDataOrWIF)==="string") {
            try {
                this.privKey = WIF(network).decode(addressDataOrWIF);
            } catch(e) {
                this.privKey = WIF().decode(addressDataOrWIF);
            }
            this.pubkey = Buffer.from(pubECDSA(this.privKey));
            const address = getAddress("wpkh", this.privKey, network);
            if(address==null) throw new Error("Failed to generate p2wpkh address from the provided private key!");
            this.address = address;
            this.addressType = identifyAddressType(this.address, network);
        } else {
            this.address = addressDataOrWIF.address;
            this.addressType = identifyAddressType(this.address, network);
            this.pubkey = Buffer.from(addressDataOrWIF.publicKey, "hex");
            // Some wallets seem to be returning a full 33-byte compressed pubkey instead of a taproot
            //  32-byte long X-only key. Handle these cases here
            if(this.addressType==="p2tr") {
                if(this.pubkey.length!==33) return;
                const leadingByte = this.pubkey[0];
                if(leadingByte!==0x03 && leadingByte!==0x02) throw new Error("Invalid public key passed for taproot bitcoin wallet, expected an X-only 32-byte public key, or a compressed 33-byte public key");
                logger.debug(`constructor(): Converting compressed public key ${addressDataOrWIF.publicKey} to taproot X-only 32-byte public key`);
                this.pubkey = this.pubkey.slice(1);
            }
        }
    }

    /**
     * Returns all the wallet addresses controlled by the wallet
     *
     * @protected
     */
    protected toBitcoinWalletAccounts(): [{pubkey: string, address: string, addressType: CoinselectAddressTypes}] {
        return [{
            pubkey: this.pubkey.toString("hex"), address: this.address, addressType: this.addressType
        }];
    }

    /**
     * @inheritDoc
     */
    async sendTransaction(address: string, amount: bigint, feeRate?: number): Promise<string> {
        if(!this.privKey) throw new Error("Not supported.");
        const {psbt, fee} = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate);
        if(psbt==null) throw new Error(`Not enough funds, required for fee: ${fee} sats!`);
        psbt.sign(this.privKey);
        psbt.finalize();
        const txHex = Buffer.from(psbt.extract()).toString("hex");
        return await super._sendTransaction(txHex);
    }

    /**
     * @inheritDoc
     */
    async fundPsbt(inputPsbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[], spendFully?: boolean): Promise<Transaction> {
        const {psbt} = await super._fundPsbt(this.toBitcoinWalletAccounts(), inputPsbt, feeRate, utxos, spendFully);
        if(psbt==null) {
            throw new Error("Not enough balance!");
        }
        return psbt;
    }

    /**
     * @inheritDoc
     */
    async signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction> {
        if(!this.privKey) throw new Error("Not supported.");
        for(let signInput of signInputs) {
            psbt.signIdx(this.privKey, signInput);
        }
        return psbt;
    }

    /**
     * @inheritDoc
     */
    async getTransactionFee(address: string, amount: bigint, feeRate?: number): Promise<number> {
        const {fee} = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate);
        return fee;
    }

    /**
     * @inheritDoc
     */
    async getFundedPsbtFee(basePsbt: Transaction, feeRate?: number): Promise<number> {
        const {fee} = await super._fundPsbt(this.toBitcoinWalletAccounts(), basePsbt, feeRate);
        return fee;
    }

    /**
     * @inheritDoc
     */
    getReceiveAddress(): string {
        return this.address;
    }

    /**
     * Returns the public key of the wallet
     */
    getPublicKey(): string {
        return this.pubkey.toString("hex");
    }

    /**
     * @inheritDoc
     */
    getBalance(): Promise<{
        confirmedBalance: bigint,
        unconfirmedBalance: bigint
    }> {
        return this._getBalance(this.address);
    }

    /**
     * @inheritDoc
     */
    getSpendableBalance(psbt?: Transaction, feeRate?: number, outputAddressType?: CoinselectAddressTypes, utxos?: BitcoinWalletUtxoBase[]): Promise<{
        balance: bigint,
        feeRate: number,
        totalFee: number
    }> {
        return this._getSpendableBalance([{address: this.address, pubkey: this.getPublicKey(), addressType: this.addressType}], psbt, feeRate, outputAddressType, utxos);
    }

    /**
     * @inheritDoc
     */
    async getUtxoPool(): Promise<BitcoinWalletUtxo[]> {
        return this._getUtxoPool(this.address, this.getPublicKey(), this.addressType);
    }

    /**
     * Generates a new random private key WIF that can be used to instantiate the bitcoin wallet instance
     *
     * @returns A WIF encoded bitcoin private key
     */
    static generateRandomPrivateKey(network?: BitcoinNetwork | BTC_NETWORK): string {
        const networkObject = network==null || typeof(network)==="object"
            ? network
            : BitcoinWallet.bitcoinNetworkToObject(network);
         return WIF(networkObject).encode(randomPrivateKeyBytes());
    }

    /**
     * Generates a 12-word long mnemonic from any entropy source with 128-bits or more, the entropy is first hashed
     *  using sha256, and the first 16 bytes of the hash are used to generate the mnemonic
     *
     * @param entropy Entropy to use for generating the mnemonic
     */
    static mnemonicFromEntropy(entropy: Buffer): string {
        if(entropy.length<16) throw new Error("Requires at least 128-bit entropy (16 bytes)");
        const entropyHash = Buffer.from(sha256(entropy)).subarray(0, 16);
        return entropyToMnemonic(entropyHash, wordlist);
    }

    /**
     * Generates a random 12-word long mnemonic
     */
    static generateRandomMnemonic(): string {
        return generateMnemonic(wordlist, 128)
    }

    /**
     * Generates a WIF private key from mnemonic phrase
     *
     * @param mnemonic Mnemonic to generate the WIF key from
     * @param network Optional bitcoin network to generate the WIF for
     * @param derivationPath Optional custom derivation path to use for deriving the wallet
     */
    static async mnemonicToPrivateKey(
        mnemonic: string,
        network?: BitcoinNetwork | BTC_NETWORK,
        derivationPath?: string
    ): Promise<string> {
        const networkObject = network==null || typeof(network)==="object"
            ? network
            : BitcoinWallet.bitcoinNetworkToObject(network);

        derivationPath ??= networkObject==null || networkObject.bech32===NETWORK.bech32
            ? "m/84'/0'/0'/0/0" //Mainnet
            : "m/84'/1'/0'/0/0"; //Testnet
        const seed = await mnemonicToSeed(mnemonic);
        const hdKey = HDKey.fromMasterSeed(seed);
        const privateKey = hdKey.derive(derivationPath).privateKey;
        if(privateKey==null) throw new Error("Cannot derive private key from the mnemonic!");
        return WIF(networkObject).encode(privateKey);
    }

    /**
     * Creates a single-address wallet from a mnemonic using the same async derivation as
     * {@link SingleAddressBitcoinWallet.mnemonicToPrivateKey}.
     *
     * @param mempoolApi Bitcoin RPC/address-index backend used for wallet balance, UTXO and broadcast operations
     * @param network Bitcoin network used for derivation defaults and address encoding
     * @param mnemonic Mnemonic phrase to derive the wallet private key from
     * @param derivationPath Optional BIP32 derivation path; defaults to native segwit account 0 for the network
     * @param feeMultiplier Optional multiplier applied to backend fee estimates
     * @param feeOverride Optional fixed fee rate in sats/vB returned by this wallet
     * @returns Wallet derived from the mnemonic at `derivationPath`
     * @throws {Error} if the mnemonic cannot derive a private key for the selected path
     */
    static async fromMnemonic(
        mempoolApi: BitcoinRpcWithAddressIndex<any>,
        network: BitcoinNetwork | BTC_NETWORK,
        mnemonic: string,
        derivationPath?: string,
        feeMultiplier?: number,
        feeOverride?: number
    ): Promise<SingleAddressBitcoinWallet> {
        return new SingleAddressBitcoinWallet(
            mempoolApi,
            network,
            await SingleAddressBitcoinWallet.mnemonicToPrivateKey(mnemonic, network, derivationPath),
            feeMultiplier,
            feeOverride
        );
    }

}
