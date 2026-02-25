/// <reference types="node" />
/// <reference types="node" />
import { CoinselectAddressTypes } from "../coinselect2";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { Transaction } from "@scure/btc-signer";
import { Buffer } from "buffer";
import { BitcoinWallet } from "./BitcoinWallet";
import { BitcoinNetwork, BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
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
    sendTransaction(address: string, amount: bigint, feeRate?: number): Promise<string>;
    /**
     * @inheritDoc
     */
    fundPsbt(inputPsbt: Transaction, feeRate?: number): Promise<Transaction>;
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
    getBalance(): Promise<{
        confirmedBalance: bigint;
        unconfirmedBalance: bigint;
    }>;
    /**
     * @inheritDoc
     */
    getSpendableBalance(psbt?: Transaction, feeRate?: number): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
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
