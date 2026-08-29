import { Transaction } from "@scure/btc-signer";
/**
 * A type with minimum possible required data about a bitcoin wallet to be able to estimate fees and produce unsigned
 *  funded PSBTs with address's UTXOs
 *
 * @category Bitcoin
 */
export type MinimalBitcoinWalletInterface = {
    address: string;
    publicKey: string;
};
/**
 * A type with minimum possible required data about a bitcoin wallet to be able to estimate fees and sign PSBTs
 *
 * @category Bitcoin
 */
export type MinimalBitcoinWalletInterfaceWithSigner = MinimalBitcoinWalletInterface & {
    signPsbt: (psbtToSign: {
        psbt: Transaction;
        psbtHex: string;
        psbtBase64: string;
    }, signInputs: number[]) => Promise<Transaction | string>;
};
