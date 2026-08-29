/// <reference types="node" resolution-mode="require"/>
/// <reference types="node" resolution-mode="require"/>
import { CoinselectAddressTypes } from "../coinselect2/index.js";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { Transaction } from "@scure/btc-signer";
import { Buffer } from "buffer";
import { BitcoinWallet } from "./BitcoinWallet.js";
import { BitcoinNetwork, BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
import { BitcoinWalletUtxo, BitcoinWalletUtxoBase } from "./IBitcoinWallet.js";
/**
 * Bitcoin wallet implementation deriving a single address from a WIF encoded private key
 *
 * @category Bitcoin
 */
export declare class SingleAddressBitcoinWallet extends BitcoinWallet {
    protected readonly privKey?: Uint8Array;
    protected readonly pubkey: Buffer;
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
    sendTransaction(address: string, amount: bigint, feeRate?: number): Promise<string>;
    /**
     * @inheritDoc
     */
    fundPsbt(inputPsbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[], spendFully?: boolean): Promise<Transaction>;
    /**
     * @inheritDoc
     */
    signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction>;
    /**
     * @inheritDoc
     */
    getTransactionFee(address: string, amount: bigint, feeRate?: number): Promise<number>;
    /**
     * @inheritDoc
     */
    getFundedPsbtFee(basePsbt: Transaction, feeRate?: number): Promise<number>;
    /**
     * @inheritDoc
     */
    getReceiveAddress(): string;
    /**
     * @inheritDoc
     */
    getAddressInfo(change: boolean): {
        address: string;
        publicKey: string;
    };
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
    getSpendableBalance(psbt?: Transaction, feeRate?: number, outputAddressTypeOrAddress?: CoinselectAddressTypes | string, utxos?: BitcoinWalletUtxoBase[]): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
    /**
     * @inheritDoc
     */
    getUtxoPool(): Promise<BitcoinWalletUtxo[]>;
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
    static fromMnemonic(mempoolApi: BitcoinRpcWithAddressIndex<any>, network: BitcoinNetwork | BTC_NETWORK, mnemonic: string, derivationPath?: string, feeMultiplier?: number, feeOverride?: number): Promise<SingleAddressBitcoinWallet>;
}
