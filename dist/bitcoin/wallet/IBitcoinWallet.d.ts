import { Transaction } from "@scure/btc-signer";
/**
 * Type guard to check if an object implements IBitcoinWallet
 * @category Bitcoin
 */
export declare function isIBitcoinWallet(val: any): val is IBitcoinWallet;
/**
 * Interface for Bitcoin wallet operations
 * @category Bitcoin
 */
export interface IBitcoinWallet {
    sendTransaction(address: string, amount: bigint, feeRate?: number): Promise<string>;
    fundPsbt(psbt: Transaction, feeRate?: number): Promise<Transaction>;
    signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction>;
    getFeeRate(): Promise<number>;
    getTransactionFee(address: string, amount: bigint, feeRate?: number): Promise<number>;
    getFundedPsbtFee(psbt: Transaction, feeRate?: number): Promise<number>;
    getReceiveAddress(): string;
    getBalance(): Promise<{
        confirmedBalance: bigint;
        unconfirmedBalance: bigint;
    }>;
    getSpendableBalance(psbt?: Transaction, feeRate?: number): Promise<{
        balance: bigint;
        feeRate: number;
        totalFee: number;
    }>;
}
