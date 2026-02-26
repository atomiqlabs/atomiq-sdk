/// <reference types="node" />
/// <reference types="node" />
import { CoinselectAddressTypes } from "../coinselect2";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { Transaction } from "@scure/btc-signer";
import { Buffer } from "buffer";
import { BitcoinWallet } from "./BitcoinWallet";
import { BitcoinNetwork, BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
import { BitcoinWalletUtxo } from "./IBitcoinWallet";
/**
 * Bitcoin wallet implementation deriving a single address from a WIF encoded private key
 *
 * @category Bitcoin
 */
export declare class SingleAddressBitcoinWallet extends BitcoinWallet {
    protected readonly privKey?: Uint8Array;
    protected readonly pubkey: Uint8Array;
    protected readonly address: string;
    protected readonly addressType: CoinselectAddressTypes;
    constructor(mempoolApi: BitcoinRpcWithAddressIndex<any>, _network: BitcoinNetwork | BTC_NETWORK, addressDataOrWIF: string | {
        address: string;
        publicKey: string;
    }, feeMultiplier?: number, feeOverride?: number);
    /**
     * Returns all the wallet addresses controlled by the wallet
     *
     * @protected
     */
    protected toBitcoinWalletAccounts(): [{
        pubkey: string;
        address: string;
        addressType: CoinselectAddressTypes;
    }];
    /**
     * @inheritDoc
     */
    sendTransaction(address: string, amount: bigint, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<string>;
    /**
     * @inheritDoc
     */
    fundPsbt(inputPsbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<Transaction>;
    /**
     * @inheritDoc
     */
    signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction>;
    /**
     * @inheritDoc
     */
    getTransactionFee(address: string, amount: bigint, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<number>;
    /**
     * @inheritDoc
     */
    getFundedPsbtFee(basePsbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<number>;
    /**
     * @inheritDoc
     */
    getReceiveAddress(): string;
    /**
     * Returns the public key of the wallet
     */
    getPublicKey(): string;
    /**
     * @inheritDoc
     */
    getBalance(): Promise<{
        confirmedBalance: bigint;
        unconfirmedBalance: bigint;
    }>;
    /**
     * @inheritDoc
     */
    getSpendableBalance(psbt?: Transaction, feeRate?: number, outputAddressType?: CoinselectAddressTypes, utxos?: BitcoinWalletUtxo[]): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
    getUtxoPool(): Promise<BitcoinWalletUtxo[]>;
    /**
     * Adds the requested UTXOs into the PSBT. Careful with this because it doesn't add change outputs automatically!
     *
     * @param psbt PSBT to fund (add UTXOs to)
     * @param utxos UTXOs to add to the PSBT
     */
    fundPsbtWithExactUtxos(psbt: Transaction, utxos: BitcoinWalletUtxo[]): {
        psbt: Transaction;
        fee: bigint;
        feeRate: number;
    };
    /**
     * Generates a new random private key WIF that can be used to instantiate the bitcoin wallet instance
     *
     * @returns A WIF encoded bitcoin private key
     */
    static generateRandomPrivateKey(network?: BitcoinNetwork | BTC_NETWORK): string;
    /**
     * Generates a 12-word long mnemonic from any entropy source with 128-bits or more, the entropy is first hashed
     *  using sha256, and the first 16 bytes of the hash are used to generate the mnemonic
     *
     * @param entropy Entropy to use for generating the mnemonic
     */
    static mnemonicFromEntropy(entropy: Buffer): string;
    /**
     * Generates a random 12-word long mnemonic
     */
    static generateRandomMnemonic(): string;
    /**
     * Generates a WIF private key from mnemonic phrase
     *
     * @param mnemonic Mnemonic to generate the WIF key from
     * @param network Optional bitcoin network to generate the WIF for
     * @param derivationPath Optional custom derivation path to use for deriving the wallet
     */
    static mnemonicToPrivateKey(mnemonic: string, network?: BitcoinNetwork | BTC_NETWORK, derivationPath?: string): Promise<string>;
}
