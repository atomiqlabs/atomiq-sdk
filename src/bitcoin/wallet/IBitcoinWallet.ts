import {Transaction} from "@scure/btc-signer";

/**
 * Type guard to check if an object implements {@link IBitcoinWallet}
 *
 * @category Bitcoin
 */
export function isIBitcoinWallet(val: any): val is IBitcoinWallet {
    return val!==null &&
        typeof(val.sendTransaction)==="function" &&
        typeof(val.fundPsbt)==="function" &&
        typeof(val.signPsbt)==="function" &&
        typeof(val.getFeeRate)==="function" &&
        typeof(val.getTransactionFee)==="function" &&
        typeof(val.getFundedPsbtFee)==="function" &&
        typeof(val.getReceiveAddress)==="function" &&
        typeof(val.getBalance)==="function" &&
        typeof(val.getSpendableBalance)==="function";
}

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
     */
    fundPsbt(psbt: Transaction, feeRate?: number): Promise<Transaction>;

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
        confirmedBalance: bigint,
        unconfirmedBalance: bigint
    }>;

    /**
     * Returns the maximum spendable balance in satoshis given a specific PSBT that should be funded
     *
     * @param psbt A PSBT to which additional inputs from wallet's UTXO set will be added and fee estimated
     * @param feeRate Optional fee rate in sats/vB to use for the transaction
     */
    getSpendableBalance(psbt?: Transaction, feeRate?: number): Promise<{
        balance: bigint,
        feeRate: number,
        totalFee: number
    }>;
}
