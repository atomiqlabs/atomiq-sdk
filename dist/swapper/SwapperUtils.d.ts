import { Transaction } from "@scure/btc-signer";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { SwapType } from "../enums/SwapType";
import { ChainIds, MultiChain, Swapper } from "./Swapper";
import { IBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet";
import { MinimalBitcoinWalletInterface } from "../types/wallets/MinimalBitcoinWalletInterface";
import { TokenAmount } from "../types/TokenAmount";
import { SCToken } from "../types/Token";
import { LNURLWithdraw } from "../types/lnurl/LNURLWithdraw";
import { LNURLPay } from "../types/lnurl/LNURLPay";
/**
 * Utility class providing helper methods for address parsing, token balances, serialization
 *  and other miscellaneous things.
 *
 * @category Core
 */
export declare class SwapperUtils<T extends MultiChain> {
    readonly bitcoinNetwork: BTC_NETWORK;
    private readonly root;
    constructor(root: Swapper<T>);
    /**
     * Checks whether a passed address is a valid address on the smart chain
     *
     * @param address Address
     * @param chainId Smart chain identifier string to check the address for
     */
    isValidSmartChainAddress(address: string, chainId?: ChainIds<T>): boolean;
    /**
     * Checks whether an address is a valid BOLT11 bitcoin lightning invoice
     *
     * @param address Address to check
     */
    isLightningInvoice(address: string): boolean;
    /**
     * Checks whether an address is a valid bitcoin address
     *
     * @param address Address to check
     */
    isValidBitcoinAddress(address: string): boolean;
    /**
     * Checks whether an address is a valid BOLT11 bitcoin lightning invoice WITH AMOUNT
     *
     * @param address Address to check
     */
    isValidLightningInvoice(address: string): boolean;
    /**
     * Checks whether an address is a valid LNURL (no checking on type is performed)
     *
     * @param address Address to check
     */
    isValidLNURL(address: string): boolean;
    /**
     * Returns type and data about an LNURL
     *
     * @param lnurl LNURL link to check, can be either `pay` or `withdraw` type
     * @param shouldRetry Optional whether HTTP requests should retried on failure
     */
    getLNURLTypeAndData(lnurl: string, shouldRetry?: boolean): Promise<LNURLPay | LNURLWithdraw | null>;
    /**
     * Returns satoshi value of BOLT11 bitcoin lightning invoice WITH AMOUNT, returns null otherwise
     *
     * @param lnpr
     */
    getLightningInvoiceValue(lnpr: string): bigint | null;
    private parseBitcoinAddress;
    private parseLNURLSync;
    private parseLNURL;
    private parseLightningInvoice;
    private parseSmartchainAddress;
    /**
     * General parser for bitcoin addresses, LNURLs, lightning invoices, smart chain addresses. Also fetches LNURL data
     *  (hence async and returns Promise).
     *
     * @param addressString Address to parse
     * @throws {Error} Error in address parsing
     * @returns Address data or `null` if address doesn't conform to any known format
     */
    parseAddress(addressString: string): Promise<{
        address: string;
        type: "BITCOIN" | "LIGHTNING" | "LNURL" | ChainIds<T>;
        swapType: SwapType.TO_BTC | SwapType.TO_BTCLN | SwapType.SPV_VAULT_FROM_BTC | SwapType.FROM_BTCLN | null;
        lnurl?: LNURLPay | LNURLWithdraw;
        min?: TokenAmount;
        max?: TokenAmount;
        amount?: TokenAmount;
    } | null>;
    /**
     * Synchronous general parser for bitcoin addresses, LNURLs, lightning invoices, smart chain addresses, doesn't fetch
     *  LNURL data, returns `swapType: null` instead to prevent returning a Promise
     *
     * @param addressString Address to parse
     * @throws {Error} Error in address parsing
     * @returns Address data or `null` if address doesn't conform to any known format
     */
    parseAddressSync(addressString: string): {
        address: string;
        type: "BITCOIN" | "LIGHTNING" | "LNURL" | ChainIds<T>;
        swapType: SwapType.TO_BTC | SwapType.TO_BTCLN | SwapType.SPV_VAULT_FROM_BTC | null;
        min?: TokenAmount;
        max?: TokenAmount;
        amount?: TokenAmount;
    } | null;
    /**
     * Returns a random PSBT that can be used for fee estimation for SPV vault (UTXO-controlled vault) based swaps
     *  {@link SwapType.SPV_VAULT_FROM_BTC}, the last output (the LP output) is omitted to allow for coinselection
     *  algorithm to determine maximum sendable amount there
     *
     * @param chainIdentifier Smart chain to swap to
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    getRandomSpvVaultPsbt<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, includeGasToken?: boolean): Transaction;
    /**
     * Returns the spendable balance of a bitcoin wallet
     *
     * @param wallet Bitcoin wallet to check the spendable balance for, can either be a simple
     *  bitcoin address string or a wallet object
     * @param targetChain Destination smart chain for the swap, the ensures proper spendable balance
     *  is estimated taking into consideration different swap primitives available on different chains
     * @param options Additional options
     */
    getBitcoinSpendableBalance(wallet: string | IBitcoinWallet | MinimalBitcoinWalletInterface, targetChain?: ChainIds<T>, options?: {
        gasDrop?: boolean;
        feeRate?: number;
        minFeeRate?: number;
    }): Promise<{
        balance: TokenAmount;
        feeRate: number;
    }>;
    /**
     * Returns the maximum spendable balance of the smart chain wallet, deducting the fee needed
     *  to initiate a swap for native balances
     */
    getSpendableBalance<ChainIdentifier extends ChainIds<T>>(wallet: string | T[ChainIdentifier]["Signer"] | T[ChainIdentifier]["NativeSigner"], token: SCToken<ChainIdentifier>, options?: {
        feeMultiplier?: number;
        feeRate?: any;
    }): Promise<TokenAmount>;
    /**
     * Returns the address of the native currency of the smart chain
     */
    getNativeToken<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): SCToken<ChainIdentifier>;
    /**
     * Returns a random signer for a given smart chain
     *
     * @param chainIdentifier
     */
    randomSigner<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): T[ChainIdentifier]["Signer"];
    /**
     * Returns a random address for a given smart chain
     *
     * @param chainIdentifier
     */
    randomAddress<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): string;
    /**
     * Signs and broadcasts the supplied smart chain transaction
     *
     * @param chainIdentifier Smart chain identifier string
     * @param signer Signer to use for signing the transactions
     * @param txs An array of transactions to sign
     * @param abortSignal Abort signal
     * @param onBeforePublish Callback invoked before a transaction is sent (invoked for every transaction to be sent)
     */
    sendAndConfirm<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: T[ChainIdentifier]["NativeSigner"] | T[ChainIdentifier]["Signer"], txs: T[ChainIdentifier]["TX"][], abortSignal?: AbortSignal, onBeforePublish?: (txId: string, rawTx: string) => Promise<void>): Promise<string[]>;
    /**
     * Broadcasts already signed smart chain transactions
     *
     * @param chainIdentifier Smart chain identifier string
     * @param txs An array of already signed transactions
     * @param abortSignal Abort signal
     * @param onBeforePublish Callback invoked before a transaction is sent (invoked for every transaction to be sent)
     */
    sendSignedAndConfirm<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, txs: T[ChainIdentifier]["SignedTXType"][], abortSignal?: AbortSignal, onBeforePublish?: (txId: string, rawTx: string) => Promise<void>): Promise<string[]>;
    /**
     * Serializes an unsigned smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx An unsigned transaction to serialize
     */
    serializeUnsignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: T[ChainIdentifier]["TX"]): Promise<string>;
    /**
     * Deserializes an unsigned smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx Serialized unsigned transaction
     */
    deserializeUnsignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: string): Promise<T[ChainIdentifier]["TX"]>;
    /**
     * Serializes a signed smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx A signed transaction to serialize
     */
    serializeSignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: T[ChainIdentifier]["SignedTXType"]): Promise<string>;
    /**
     * Deserializes a signed smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx Serialized signed transaction
     */
    deserializeSignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: string): Promise<T[ChainIdentifier]["SignedTXType"]>;
}
