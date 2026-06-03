/// <reference types="node" />
/// <reference types="node" />
import { Transaction } from "@scure/btc-signer";
import { CoinselectAddressTypes } from "../coinselect2";
/**
 * UTXO data structure for Bitcoin wallets
 *
 * @category Bitcoin
 */
export type BitcoinWalletUtxo = {
    vout: number;
    txId: string;
    value: number;
    type: CoinselectAddressTypes;
    outputScript: Buffer;
    address: string;
    cpfp?: {
        txVsize: number;
        txEffectiveFeeRate: number;
    };
    confirmed: boolean;
};
/**
 * Base UTXO data structure used for maximum spendable balance calculation, doesn't contain all the fields necessary
 *  for constructing the full transaction.
 *
 * @category Bitcoin
 */
export type BitcoinWalletUtxoBase = Omit<BitcoinWalletUtxo, "txId" | "vout" | "outputScript" | "address" | "confirmed">;
/**
 * Type guard to check if an object implements {@link IBitcoinWallet}
 *
 * @category Bitcoin
 */
export declare function isIBitcoinWallet(val: any): val is IBitcoinWallet;
/**
 * Interface to be implemented by Bitcoin wallets
 *
 * @category Bitcoin
 */
export interface IBitcoinWallet {
    /**
     * Signs and broadcasts a transaction sending `amount` of sats to `address`, optionally with the
     *  `feeRate` sats/vB fee rate.
     *
     * @param address Destination address of the transaction
     * @param amount Amount of satoshis to send (1 BTC = 100,000,000 sats)
     * @param feeRate Optional fee rate in sats/vB to use for the transaction
     */
    sendTransaction(address: string, amount: bigint, feeRate?: number): Promise<string>;
    /**
     * Funds (populates the inputs) for a given PSBT from wallet's UTXO set
     *
     * @param psbt PSBT to add the inputs to
     * @param feeRate Optional fee rate in sats/vB to use for the transaction
     * @param utxos Pre-fetched list of UTXOs to spend from
     * @param spendFully Instructs the wallet to spend all the passed UTXOs in the transaction without creating any
     *  change output, if the `feeRate` is passed, it will also enforce that the feeRate in sats/vB for the resulting
     *  transaction is not more than 50% and 10 sats/vB larger (considering also the CPFP adjustments)
     */
    fundPsbt(psbt: Transaction, feeRate?: number, utxos?: BitcoinWalletUtxo[], spendFully?: boolean): Promise<Transaction>;
    /**
     * Signs inputs in the provided PSBT
     *
     * @param psbt A PSBT to sign
     * @param signInputs Indices of the inputs to sign
     */
    signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction>;
    /**
     * Returns the current fee rate in sats/vB
     */
    getFeeRate(): Promise<number>;
    /**
     * Estimates a total fee in satoshis for a given transaction
     *
     * @param address Destination address of the transaction
     * @param amount Amount of satoshis to send (1 BTC = 100,000,000 sats)
     * @param feeRate Optional fee rate in sats/vB to use for the transaction
     */
    getTransactionFee(address: string, amount: bigint, feeRate?: number): Promise<number>;
    /**
     * Estimates a total fee in satoshis for a given transaction as identified by the PSBT
     *
     * @param psbt A PSBT to which additional inputs from wallet's UTXO set will be added and fee estimated
     * @param feeRate Optional fee rate in sats/vB to use for the transaction
     */
    getFundedPsbtFee(psbt: Transaction, feeRate?: number): Promise<number>;
    /**
     * Returns the bitcoin address suitable for receiving funds
     */
    getReceiveAddress(): string;
    /**
     * Returns confirmed and unconfirmed balance in satoshis of the wallet
     */
    getBalance(): Promise<{
        confirmedBalance: bigint;
        unconfirmedBalance: bigint;
    }>;
    /**
     * Returns the maximum spendable balance in satoshis given a specific PSBT that should be funded
     *
     * @param psbt A PSBT to which additional inputs from wallet's UTXO set will be added and fee estimated
     * @param feeRate Optional fee rate in sats/vB to use for the transaction
     * @param outputAddressType Expected output address type, if known
     * @param utxos Optional pre-fetched UTXOs
     */
    getSpendableBalance(psbt?: Transaction, feeRate?: number, outputAddressType?: CoinselectAddressTypes, utxos?: BitcoinWalletUtxoBase[]): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
    /**
     * Returns a list of available UTXOs for the wallet
     */
    getUtxoPool?(): Promise<BitcoinWalletUtxo[]>;
}
