import { IBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet";
import { Transaction } from "@scure/btc-signer";
import { MinimalBitcoinWalletInterface, MinimalBitcoinWalletInterfaceWithSigner } from "../types/wallets/MinimalBitcoinWalletInterface";
import { TokenAmount } from "../types/TokenAmount";
import { BtcToken } from "../types/Token";
/**
 * Type guard to check if an object is an {@link IBTCWalletSwap}
 *
 * @category Swaps
 */
export declare function isIBTCWalletSwap(obj: any): obj is IBTCWalletSwap;
/**
 * Interface for swaps requiring Bitcoin wallet interaction
 *
 * @category Swaps
 */
export interface IBTCWalletSwap {
    /**
     * Returns the PSBT that is already funded with wallet's UTXOs (runs a coin-selection algorithm to choose UTXOs to use),
     *  also returns inputs indices that need to be signed by the wallet before submitting the PSBT back to the SDK with
     *  {@link submitPsbt}
     *
     * @param _bitcoinWallet Sender's bitcoin wallet
     * @param feeRate Optional fee rate in sats/vB for the transaction
     * @param additionalOutputs additional outputs to add to the PSBT - can be used to collect fees from users
     */
    getFundedPsbt(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number, additionalOutputs?: ({
        amount: bigint;
        outputScript: Uint8Array;
    } | {
        amount: bigint;
        address: string;
    })[]): Promise<{
        psbt: Transaction;
        psbtHex: string;
        psbtBase64: string;
        signInputs: number[];
    }>;
    /**
     * Submits a PSBT signed by the wallet back to the SDK
     *
     * @param psbt A PSBT, either a Transaction object or a hex or base64 encoded PSBT string
     */
    submitPsbt(psbt: Transaction | string): Promise<string>;
    /**
     * Estimates a bitcoin on-chain fee paid for the bitcoin swap transaction
     *
     * @param wallet Sender's bitcoin wallet
     * @param feeRate Optional fee rate in sats/vB for the transaction
     */
    estimateBitcoinFee(wallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number): Promise<TokenAmount<any, BtcToken<false>> | null>;
    /**
     * Sends a swap bitcoin transaction via the passed bitcoin wallet
     *
     * @param wallet Sender's bitcoin wallet
     * @param feeRate Optional fee rate in sats/vB for the transaction
     */
    sendBitcoinTransaction(wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner, feeRate?: number): Promise<string>;
    /**
     * Waits till the bitcoin transaction gets the required number of confirmations
     *
     * @param updateCallback Callback called when txId is found, and also called with subsequent confirmations
     * @param checkIntervalSeconds How often to check the bitcoin transaction
     * @param abortSignal Abort signal
     * @throws {Error} if in invalid state
     */
    waitForBitcoinTransaction(updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<string>;
    /**
     * Returns the number of confirmations required for the bitcoin transaction for this swap
     *  to complete and settle
     */
    getRequiredConfirmationsCount(): number;
}
