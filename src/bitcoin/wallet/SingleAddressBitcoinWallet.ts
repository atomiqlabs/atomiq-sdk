import {CoinselectAddressTypes} from "../coinselect2";
import {BTC_NETWORK, NETWORK, pubECDSA, randomPrivateKeyBytes, TEST_NETWORK} from "@scure/btc-signer/utils"
import {getAddress, Transaction, WIF} from "@scure/btc-signer";
import {Buffer} from "buffer";
import {identifyAddressType, BitcoinWallet} from "./BitcoinWallet";
import {BitcoinNetwork, BitcoinRpcWithAddressIndex, BtcAddressUtxo} from "@atomiqlabs/base";
import {HDKey} from "@scure/bip32";
import {entropyToMnemonic, generateMnemonic, mnemonicToSeed} from "@scure/bip39";
import {wordlist} from "@scure/bip39/wordlists/english.js";
import {sha256} from "@noble/hashes/sha2";
import {BitcoinNotEnoughBalanceError} from "../../errors/BitcoinNotEnoughBalanceError";
import {toOutputScript} from "../../utils/BitcoinUtils";
import {BitcoinWalletUtxo} from "./IBitcoinWallet";

/**
 * Bitcoin wallet implementation deriving a single address from a WIF encoded private key
 *
 * @category Bitcoin
 */
export class SingleAddressBitcoinWallet extends BitcoinWallet {

    protected readonly privKey?: Uint8Array;
    protected readonly pubkey: Uint8Array;
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
            this.pubkey = pubECDSA(this.privKey);
            const address = getAddress("wpkh", this.privKey, network);
            if(address==null) throw new Error("Failed to generate p2wpkh address from the provided private key!");
            this.address = address;
        } else {
            this.address = addressDataOrWIF.address;
            this.pubkey = Buffer.from(addressDataOrWIF.publicKey, "hex");
        }
        this.addressType = identifyAddressType(this.address, network);
    }

    /**
     * Returns all the wallet addresses controlled by the wallet
     *
     * @protected
     */
    protected toBitcoinWalletAccounts(): [{pubkey: string, address: string, addressType: CoinselectAddressTypes}] {
        return [{
            pubkey: Buffer.from(this.pubkey).toString("hex"), address: this.address, addressType: this.addressType
        }];
    }

    /**
     * @inheritDoc
     */
    async sendTransaction(address: string, amount: bigint, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<string> {
        if(!this.privKey) throw new Error("Not supported.");
        const {psbt, fee} = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate, utxos);
        if(psbt==null) throw new BitcoinNotEnoughBalanceError(`Not enough funds, required for fee: ${fee} sats!`);
        psbt.sign(this.privKey);
        psbt.finalize();
        const txHex = Buffer.from(psbt.extract()).toString("hex");
        return await super._sendTransaction(txHex);
    }

    /**
     * @inheritDoc
     */
    async fundPsbt(inputPsbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<Transaction> {
        const {psbt} = await super._fundPsbt(this.toBitcoinWalletAccounts(), inputPsbt, feeRate, utxos);
        if(psbt==null) {
            throw new BitcoinNotEnoughBalanceError("Not enough balance!");
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
    async getTransactionFee(address: string, amount: bigint, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<number> {
        const {fee} = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate, utxos);
        return fee;
    }

    /**
     * @inheritDoc
     */
    async getFundedPsbtFee(basePsbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<number> {
        const {fee} = await super._fundPsbt(this.toBitcoinWalletAccounts(), basePsbt, feeRate, utxos);
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
        return Buffer.from(this.pubkey).toString("hex");
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
    getSpendableBalance(psbt?: Transaction, feeRate?: number, outputAddressType?: CoinselectAddressTypes, utxos?: BitcoinWalletUtxo[]): Promise<{
        balance: bigint,
        feeRate: number,
        totalFee: number
    }> {
        return this._getSpendableBalance([{address: this.address, addressType: this.addressType}], psbt, feeRate, outputAddressType, utxos);
    }

    async getUtxoPool(): Promise<BitcoinWalletUtxo[]> {
        return this._getUtxoPool(this.address, this.addressType);
    }

    /**
     * Adds the requested UTXOs into the PSBT. Careful with this because it doesn't add change outputs automatically!
     *
     * @param psbt PSBT to fund (add UTXOs to)
     * @param utxos UTXOs to add to the PSBT
     */
    fundPsbtWithExactUtxos(psbt: Transaction, utxos: BitcoinWalletUtxo[]): {
        psbt: Transaction,
        fee: bigint,
        feeRate: number
    } {
        //TODO: This only works for p2wpkh addresses!
        utxos.forEach((utxo) => {
            psbt.addInput({
                txid: utxo.txId, index: utxo.vout,
                witnessUtxo: {
                    amount: BigInt(utxo.value),
                    script: toOutputScript(this.network, this.address)
                },
                sighashType: 0x01
            });
        });
        const fee = psbt.fee;

        const txVSize = BitcoinWallet.estimatePsbtVSize(psbt);
        const txFeeRate = Number(fee) / txVSize;
        let cpfpInputsVSize = 0;
        let cpfpInputsFee = 0;
        utxos.forEach((utxo) => {
            if(utxo.cpfp==null) return;
            if(utxo.cpfp.txEffectiveFeeRate < txFeeRate) return;
            cpfpInputsVSize += utxo.cpfp.txVsize;
            cpfpInputsFee += Math.ceil(utxo.cpfp.txEffectiveFeeRate * utxo.cpfp.txVsize);
        });

        const feeRate = (cpfpInputsFee + Number(fee)) / (txVSize + cpfpInputsVSize)

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

        derivationPath = networkObject==null || networkObject.bech32===NETWORK.bech32
            ? "m/84'/0'/0'/0/0" //Mainnet
            : "m/84'/1'/0'/0/0"; //Testnet
        const seed = await mnemonicToSeed(mnemonic);
        const hdKey = HDKey.fromMasterSeed(seed);
        const privateKey = hdKey.derive(derivationPath).privateKey;
        if(privateKey==null) throw new Error("Cannot derive private key from the mnemonic!");
        return WIF(networkObject).encode(privateKey);
    }

}
