import { CoinselectAddressTypes, CoinselectTxInput, CoinselectTxOutput } from "../coinselect2";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { Transaction } from "@scure/btc-signer";
import { BitcoinWalletUtxo, IBitcoinWallet } from "./IBitcoinWallet";
import { BitcoinNetwork, BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
/**
 * Identifies the address type of a Bitcoin address
 *
 * @category Bitcoin
 */
export declare function identifyAddressType(address: string, network: BTC_NETWORK): CoinselectAddressTypes;
/**
 * Abstract base class for Bitcoin wallet implementations, using bitcoin rpc with address index
 *  as a backend for fetching balances, UTXOs, etc.
 *
 * @category Bitcoin
 */
export declare abstract class BitcoinWallet implements IBitcoinWallet {
    protected readonly rpc: BitcoinRpcWithAddressIndex<any>;
    protected readonly network: BTC_NETWORK;
    protected feeMultiplier: number;
    protected feeOverride?: number;
    constructor(mempoolApi: BitcoinRpcWithAddressIndex<any>, network: BitcoinNetwork | BTC_NETWORK, feeMultiplier?: number, feeOverride?: number);
    /**
     * @inheritDoc
     */
    getFeeRate(): Promise<number>;
    /**
     * Internal helper function for sending a raw transaction through the underlying RPC
     *
     * @param rawHex Serialized bitcoin transaction in hexadecimal format
     * @returns txId Transaction ID of the submitted bitcoin transaction
     *
     * @protected
     */
    protected _sendTransaction(rawHex: string): Promise<string>;
    /**
     * Internal helper function for fetching the balance of the wallet given a specific bitcoin wallet address
     *
     * @param address
     * @protected
     */
    protected _getBalance(address: string): Promise<{
        confirmedBalance: bigint;
        unconfirmedBalance: bigint;
    }>;
    /**
     * Internal helper function for fetching the UTXO set of a given wallet address
     *
     * @param sendingAddress
     * @param sendingAddressType
     * @protected
     */
    protected _getUtxoPool(sendingAddress: string, sendingAddressType: CoinselectAddressTypes): Promise<BitcoinWalletUtxo[]>;
    /**
     * @protected
     */
    protected _getPsbt(sendingAccounts: {
        pubkey: string;
        address: string;
        addressType: CoinselectAddressTypes;
    }[], recipient: string, amount: number, feeRate?: number, utxoPool?: BitcoinWalletUtxo[]): Promise<{
        fee: number;
        psbt?: Transaction;
        inputAddressIndexes?: {
            [address: string]: number[];
        };
    }>;
    protected _fundPsbt(sendingAccounts: {
        pubkey: string;
        address: string;
        addressType: CoinselectAddressTypes;
    }[], psbt: Transaction, feeRate?: number, utxoPool?: BitcoinWalletUtxo[]): Promise<{
        fee: number;
        psbt?: Transaction;
        inputAddressIndexes?: {
            [address: string]: number[];
        };
    }>;
    protected _getSpendableBalance(sendingAccounts: {
        address: string;
        addressType: CoinselectAddressTypes;
    }[], psbt?: Transaction, feeRate?: number, outputAddressType?: CoinselectAddressTypes, utxoPool?: BitcoinWalletUtxo[]): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
    abstract sendTransaction(address: string, amount: bigint, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<string>;
    abstract fundPsbt(psbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<Transaction>;
    abstract signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction>;
    abstract getTransactionFee(address: string, amount: bigint, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<number>;
    abstract getFundedPsbtFee(psbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[]): Promise<number>;
    abstract getReceiveAddress(): string;
    abstract getBalance(): Promise<{
        confirmedBalance: bigint;
        unconfirmedBalance: bigint;
    }>;
    abstract getSpendableBalance(psbt?: Transaction, feeRate?: number, outputAddressType?: CoinselectAddressTypes, utxos?: BitcoinWalletUtxo[]): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
    static bitcoinNetworkToObject(network: BitcoinNetwork): BTC_NETWORK;
    static psbtInputToCoinselectInput(psbt: Transaction, vin: number): CoinselectTxInput;
    static psbtOutputToCoinselectOutput(psbt: Transaction, vout: number): CoinselectTxOutput;
    static estimatePsbtVSize(psbt: Transaction): number;
}
