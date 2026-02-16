import {decode as bolt11Decode} from "@atomiqlabs/bolt11";
import {Address, Transaction} from "@scure/btc-signer";
import {LNURL} from "../lnurl/LNURL";
import {BTC_NETWORK} from "@scure/btc-signer/utils";
import {SwapType} from "../enums/SwapType";
import {ChainIds, MultiChain, Swapper} from "./Swapper";
import {IBitcoinWallet} from "../bitcoin/wallet/IBitcoinWallet";
import {SingleAddressBitcoinWallet} from "../bitcoin/wallet/SingleAddressBitcoinWallet";
import {BigIntBufferUtils, ChainSwapType, isAbstractSigner} from "@atomiqlabs/base";
import {bigIntMax, fromDecimal, randomBytes} from "../utils/Utils";
import {MinimalBitcoinWalletInterface} from "../types/wallets/MinimalBitcoinWalletInterface";
import {TokenAmount, toTokenAmount} from "../types/TokenAmount";
import {BitcoinTokens, SCToken} from "../types/Token";
import {isLNURLWithdraw, LNURLWithdraw} from "../types/lnurl/LNURLWithdraw";
import {isLNURLPay, LNURLPay} from "../types/lnurl/LNURLPay";
import {toBitcoinWallet} from "../utils/BitcoinWalletUtils";

/**
 * Utility class providing helper methods for address parsing, token balances, serialization
 *  and other miscellaneous things.
 *
 * @category Core
 */
export class SwapperUtils<T extends MultiChain> {

    readonly bitcoinNetwork: BTC_NETWORK;
    private readonly root: Swapper<T>;

    constructor(root: Swapper<T>) {
        this.bitcoinNetwork = root._btcNetwork;
        this.root = root;
    }

    /**
     * Checks whether a passed address is a valid address on the smart chain
     *
     * @param address Address
     * @param chainId Smart chain identifier string to check the address for
     */
    isValidSmartChainAddress(address: string, chainId?: ChainIds<T>): boolean {
        if(chainId!=null) {
            if(this.root._chains[chainId]==null) throw new Error(`Unknown chain id: ${chainId}`);
            return this.root._chains[chainId].chainInterface.isValidAddress(address);
        }
        for(let chainId of this.root.getSmartChains()) {
            if(this.root._chains[chainId].chainInterface.isValidAddress(address)) return true;
        }
        return false;
    }

    /**
     * Checks whether an address is a valid BOLT11 bitcoin lightning invoice
     *
     * @param address Address to check
     */
    isLightningInvoice(address: string): boolean {
        try {
            bolt11Decode(address);
            return true;
        } catch (e) {}
        return false;
    }

    /**
     * Checks whether an address is a valid bitcoin address
     *
     * @param address Address to check
     */
    isValidBitcoinAddress(address: string): boolean {
        try {
            Address(this.bitcoinNetwork).decode(address);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Checks whether an address is a valid BOLT11 bitcoin lightning invoice WITH AMOUNT
     *
     * @param address Address to check
     */
    isValidLightningInvoice(address: string): boolean {
        try {
            const parsed = bolt11Decode(address);
            if(parsed.millisatoshis!=null) return true;
        } catch (e) {}
        return false;
    }

    /**
     * Checks whether an address is a valid LNURL (no checking on type is performed)
     *
     * @param address Address to check
     */
    isValidLNURL(address: string): boolean {
        return LNURL.isLNURL(address);
    }

    /**
     * Returns type and data about an LNURL
     *
     * @param lnurl LNURL link to check, can be either `pay` or `withdraw` type
     * @param shouldRetry Optional whether HTTP requests should retried on failure
     */
    getLNURLTypeAndData(lnurl: string, shouldRetry?: boolean): Promise<LNURLPay | LNURLWithdraw | null> {
        return LNURL.getLNURLType(lnurl, shouldRetry);
    }

    /**
     * Returns satoshi value of BOLT11 bitcoin lightning invoice WITH AMOUNT, returns null otherwise
     *
     * @param lnpr
     */
    getLightningInvoiceValue(lnpr: string): bigint |  null {
        const parsed = bolt11Decode(lnpr);
        if(parsed.millisatoshis!=null) return (BigInt(parsed.millisatoshis) + 999n) / 1000n;
        return null;
    }

    private parseBitcoinAddress(resultText: string): {
        address: string,
        type: "BITCOIN",
        swapType: SwapType.TO_BTC,
        amount?: TokenAmount
    } | null {
        let _amount: bigint | undefined = undefined;
        if(resultText.includes("?")) {
            const arr = resultText.split("?");
            resultText = arr[0];
            const params = arr[1].split("&");
            for(let param of params) {
                const arr2 = param.split("=");
                const key = arr2[0];
                const value = decodeURIComponent(arr2[1]);
                if(key==="amount") {
                    _amount = fromDecimal(parseFloat(value).toFixed(8), 8);
                }
            }
        }
        if(this.isValidBitcoinAddress(resultText)) {
            return {
                address: resultText,
                type: "BITCOIN",
                swapType: SwapType.TO_BTC,
                amount: _amount==null ? undefined : toTokenAmount(_amount, BitcoinTokens.BTC, this.root.prices)
            };
        }
        return null;
    }

    private parseLNURLSync(resultText: string): {
        address: string,
        type: "LNURL",
        swapType: null
    } | null {
        if(this.isValidLNURL(resultText)) {
            return {
                address: resultText,
                type: "LNURL",
                swapType: null
            };
        }
        return null;
    }

    private async parseLNURL(resultText: string): Promise<{
        address: string,
        type: "LNURL",
        swapType: SwapType.TO_BTCLN | SwapType.FROM_BTCLN,
        lnurl: LNURLPay | LNURLWithdraw,
        min?: TokenAmount,
        max?: TokenAmount,
        amount?: TokenAmount
    } | null> {
        if(this.isValidLNURL(resultText)) {
            try {
                const result = await this.getLNURLTypeAndData(resultText);
                if(result==null) throw new Error("Invalid LNURL specified!");
                const swapType = isLNURLPay(result) ? SwapType.TO_BTCLN : isLNURLWithdraw(result) ? SwapType.FROM_BTCLN : null;
                if(swapType==null) return null;
                const response = {
                    address: resultText,
                    type: "LNURL",
                    swapType,
                    lnurl: result
                } as const;
                if(result.min===result.max) {
                    return {
                        ...response,
                        amount: result.min==null ? undefined : toTokenAmount(result.min, BitcoinTokens.BTCLN, this.root.prices)
                    }
                } else {
                    return {
                        ...response,
                        min: result.min==null ? undefined : toTokenAmount(result.min, BitcoinTokens.BTCLN, this.root.prices),
                        max: result.min==null ? undefined : toTokenAmount(result.max, BitcoinTokens.BTCLN, this.root.prices)
                    }
                }
            } catch (e) {
                throw new Error("Failed to contact LNURL service, check your internet connection and retry later.");
            }
        }
        return null;
    }

    private parseLightningInvoice(resultText: string): {
        address: string,
        type: "LIGHTNING",
        swapType: SwapType.TO_BTCLN,
        amount: TokenAmount
    } | null {
        if(this.isLightningInvoice(resultText)) {
            if(this.isValidLightningInvoice(resultText)) {
                const amount = this.getLightningInvoiceValue(resultText);
                if(amount==null) throw new Error();
                return {
                    address: resultText,
                    type: "LIGHTNING",
                    swapType: SwapType.TO_BTCLN,
                    amount: toTokenAmount(amount, BitcoinTokens.BTCLN, this.root.prices)
                }
            } else {
                throw new Error("Lightning invoice needs to contain an amount!");
            }
        }
        return null;
    }

    private parseSmartchainAddress(resultText: string): {
        address: string,
        type: ChainIds<T>,
        swapType: null,
        min?: TokenAmount,
        max?: TokenAmount
    } | null {
        for(let chainId of this.root.getSmartChains()) {
            if(this.root._chains[chainId].chainInterface.isValidAddress(resultText)) {
                return {
                    address: resultText,
                    type: chainId,
                    swapType: null
                }
            }
        }
        return null;
    }

    /**
     * General parser for bitcoin addresses, LNURLs, lightning invoices, smart chain addresses. Also fetches LNURL data
     *  (hence async and returns Promise).
     *
     * @param addressString Address to parse
     * @throws {Error} Error in address parsing
     * @returns Address data or `null` if address doesn't conform to any known format
     */
    async parseAddress(addressString: string): Promise<{
        address: string,
        type: "BITCOIN" | "LIGHTNING" | "LNURL" | ChainIds<T>,
        swapType: SwapType.TO_BTC | SwapType.TO_BTCLN | SwapType.SPV_VAULT_FROM_BTC | SwapType.FROM_BTCLN | null,
        lnurl?: LNURLPay | LNURLWithdraw,
        min?: TokenAmount,
        max?: TokenAmount,
        amount?: TokenAmount
    } | null> {
        if(addressString.startsWith("bitcoin:")) {
            const parsedBitcoinAddress = this.parseBitcoinAddress(addressString.substring(8));
            if(parsedBitcoinAddress!=null) return parsedBitcoinAddress;
            throw new Error("Invalid bitcoin address!");
        }

        const parsedBitcoinAddress = this.parseBitcoinAddress(addressString);
        if(parsedBitcoinAddress!=null) return parsedBitcoinAddress;

        if(addressString.startsWith("lightning:")) {
            const resultText = addressString.substring(10);
            const resultLnurl = await this.parseLNURL(resultText);
            if(resultLnurl!=null) return resultLnurl;

            const resultLightningInvoice = this.parseLightningInvoice(resultText);
            if(resultLightningInvoice!=null) return resultLightningInvoice;

            throw new Error("Invalid lightning network invoice or LNURL!");
        }

        const resultLnurl = await this.parseLNURL(addressString);
        if(resultLnurl!=null) return resultLnurl;

        const resultLightningInvoice = this.parseLightningInvoice(addressString);
        if(resultLightningInvoice!=null) return resultLightningInvoice;

        return this.parseSmartchainAddress(addressString);
    }

    /**
     * Synchronous general parser for bitcoin addresses, LNURLs, lightning invoices, smart chain addresses, doesn't fetch
     *  LNURL data, returns `swapType: null` instead to prevent returning a Promise
     *
     * @param addressString Address to parse
     * @throws {Error} Error in address parsing
     * @returns Address data or `null` if address doesn't conform to any known format
     */
    parseAddressSync(addressString: string): {
        address: string,
        type: "BITCOIN" | "LIGHTNING" | "LNURL" | ChainIds<T>,
        swapType: SwapType.TO_BTC | SwapType.TO_BTCLN | SwapType.SPV_VAULT_FROM_BTC | null,
        min?: TokenAmount,
        max?: TokenAmount,
        amount?: TokenAmount
    } | null {
        if(addressString.startsWith("bitcoin:")) {
            const parsedBitcoinAddress = this.parseBitcoinAddress(addressString.substring(8));
            if(parsedBitcoinAddress!=null) return parsedBitcoinAddress;
            throw new Error("Invalid bitcoin address!");
        }

        const parsedBitcoinAddress = this.parseBitcoinAddress(addressString);
        if(parsedBitcoinAddress!=null) return parsedBitcoinAddress;

        if(addressString.startsWith("lightning:")) {
            const resultText = addressString.substring(10);
            const resultLnurl = this.parseLNURLSync(resultText);
            if(resultLnurl!=null) return resultLnurl;

            const resultLightningInvoice = this.parseLightningInvoice(resultText);
            if(resultLightningInvoice!=null) return resultLightningInvoice;

            throw new Error("Invalid lightning network invoice or LNURL!");
        }

        const resultLnurl = this.parseLNURLSync(addressString);
        if(resultLnurl!=null) return resultLnurl;

        const resultLightningInvoice = this.parseLightningInvoice(addressString);
        if(resultLightningInvoice!=null) return resultLightningInvoice;

        return this.parseSmartchainAddress(addressString);
    }

    /**
     * Returns a random PSBT that can be used for fee estimation for SPV vault (UTXO-controlled vault) based swaps
     *  {@link SwapType.SPV_VAULT_FROM_BTC}, the last output (the LP output) is omitted to allow for coinselection
     *  algorithm to determine maximum sendable amount there
     *
     * @param chainIdentifier Smart chain to swap to
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    getRandomSpvVaultPsbt<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, includeGasToken?: boolean): Transaction {
        const wrapper = this.root._chains[chainIdentifier].wrappers[SwapType.SPV_VAULT_FROM_BTC];
        if(wrapper==null) throw new Error("Chain doesn't support spv vault swaps!");
        return wrapper.getDummySwapPsbt(includeGasToken);
    }

    /**
     * Returns the spendable balance of a bitcoin wallet
     *
     * @param wallet Bitcoin wallet to check the spendable balance for, can either be a simple
     *  bitcoin address string or a wallet object
     * @param targetChain Destination smart chain for the swap, the ensures proper spendable balance
     *  is estimated taking into consideration different swap primitives available on different chains
     * @param options Additional options
     */
    async getBitcoinSpendableBalance(
        wallet: string | IBitcoinWallet | MinimalBitcoinWalletInterface,
        targetChain?: ChainIds<T>,
        options?: {
            gasDrop?: boolean,
            feeRate?: number,
            minFeeRate?: number
        }
    ): Promise<{
        balance: TokenAmount,
        feeRate: number
    }> {
        let bitcoinWallet: IBitcoinWallet;
        if(typeof(wallet)==="string") {
            bitcoinWallet = new SingleAddressBitcoinWallet(this.root._bitcoinRpc, this.bitcoinNetwork, {address: wallet, publicKey: ""});
        } else {
            bitcoinWallet = toBitcoinWallet(wallet, this.root._bitcoinRpc, this.bitcoinNetwork);
        }

        let feeRate = options?.feeRate ?? await bitcoinWallet.getFeeRate();
        if(options?.minFeeRate!=null) feeRate = Math.max(feeRate, options.minFeeRate);

        let result: {balance: bigint, feeRate: number, totalFee: number};
        if(targetChain!=null && this.root.supportsSwapType(targetChain, SwapType.SPV_VAULT_FROM_BTC)) {
            result = await bitcoinWallet.getSpendableBalance(this.getRandomSpvVaultPsbt(targetChain, options?.gasDrop), feeRate);
        } else {
            result = await bitcoinWallet.getSpendableBalance(undefined, feeRate);
        }

        return {
            balance: toTokenAmount(result.balance, BitcoinTokens.BTC, this.root.prices),
            feeRate: result.feeRate
        }
    }

    /**
     * Returns the maximum spendable balance of the smart chain wallet, deducting the fee needed
     *  to initiate a swap for native balances
     */
    async getSpendableBalance<ChainIdentifier extends ChainIds<T>>(wallet: string | T[ChainIdentifier]["Signer"] | T[ChainIdentifier]["NativeSigner"], token: SCToken<ChainIdentifier>, options?: {
        feeMultiplier?: number,
        feeRate?: any
    }): Promise<TokenAmount> {
        if(this.root._chains[token.chainId]==null) throw new Error("Invalid chain identifier! Unknown chain: "+token.chainId);
        const {swapContract, chainInterface} = this.root._chains[token.chainId];

        let signer: string;
        if(typeof(wallet)==="string") {
            signer = wallet;
        } else {
            const abstractSigner = isAbstractSigner(wallet) ? wallet : await chainInterface.wrapSigner(wallet);
            signer = abstractSigner.getAddress();
        }

        let finalBalance: bigint;
        if(chainInterface.getNativeCurrencyAddress()!==token.address) {
            finalBalance = await chainInterface.getBalance(signer, token.address);
        } else {
            let [balance, commitFee] = await Promise.all([
                chainInterface.getBalance(signer, token.address),
                swapContract.getCommitFee(
                    signer,
                    //Use large amount, such that the fee for wrapping more tokens is always included!
                    await swapContract.createSwapData(
                        ChainSwapType.HTLC, signer, chainInterface.randomAddress(), token.address,
                        0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
                        swapContract.getHashForHtlc(randomBytes(32)).toString("hex"),
                        BigIntBufferUtils.fromBuffer(randomBytes(8)), BigInt(Math.floor(Date.now()/1000)),
                        true, false, BigIntBufferUtils.fromBuffer(randomBytes(2)), BigIntBufferUtils.fromBuffer(randomBytes(2))
                    ),
                    options?.feeRate
                )
            ]);

            if(options?.feeMultiplier!=null) {
                commitFee = commitFee * (BigInt(Math.floor(options.feeMultiplier*1000000))) / 1000000n;
            }

            finalBalance = bigIntMax(balance - commitFee, 0n);
        }

        return toTokenAmount(finalBalance, token, this.root.prices);
    }

    /**
     * Returns the address of the native currency of the smart chain
     */
    getNativeToken<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): SCToken<ChainIdentifier> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._tokens[chainIdentifier][this.root._chains[chainIdentifier].chainInterface.getNativeCurrencyAddress()] as SCToken<ChainIdentifier>;
    }

    /**
     * Returns a random signer for a given smart chain
     *
     * @param chainIdentifier
     */
    randomSigner<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): T[ChainIdentifier]["Signer"] {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.randomSigner();
    }

    /**
     * Returns a random address for a given smart chain
     *
     * @param chainIdentifier
     */
    randomAddress<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): string {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.randomAddress();
    }

    /**
     * Signs and broadcasts the supplied smart chain transaction
     *
     * @param chainIdentifier Smart chain identifier string
     * @param signer Signer to use for signing the transactions
     * @param txs An array of transactions to sign
     * @param abortSignal Abort signal
     * @param onBeforePublish Callback invoked before a transaction is sent (invoked for every transaction to be sent)
     */
    sendAndConfirm<ChainIdentifier extends ChainIds<T>>(
        chainIdentifier: ChainIdentifier,
        signer: T[ChainIdentifier]["NativeSigner"] | T[ChainIdentifier]["Signer"],
        txs: T[ChainIdentifier]["TX"][],
        abortSignal?: AbortSignal,
        onBeforePublish?: (txId: string, rawTx: string) => Promise<void>
    ): Promise<string[]> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.sendAndConfirm(signer, txs, true, abortSignal, false, onBeforePublish);
    }

    /**
     * Broadcasts already signed smart chain transactions
     *
     * @param chainIdentifier Smart chain identifier string
     * @param txs An array of already signed transactions
     * @param abortSignal Abort signal
     * @param onBeforePublish Callback invoked before a transaction is sent (invoked for every transaction to be sent)
     */
    sendSignedAndConfirm<ChainIdentifier extends ChainIds<T>>(
        chainIdentifier: ChainIdentifier,
        txs: T[ChainIdentifier]["SignedTXType"][],
        abortSignal?: AbortSignal,
        onBeforePublish?: (txId: string, rawTx: string) => Promise<void>
    ): Promise<string[]> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.sendSignedAndConfirm(txs, true, abortSignal, false, onBeforePublish);
    }

    /**
     * Serializes an unsigned smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx An unsigned transaction to serialize
     */
    serializeUnsignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: T[ChainIdentifier]["TX"]): Promise<string> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.serializeTx(tx);
    }

    /**
     * Deserializes an unsigned smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx Serialized unsigned transaction
     */
    deserializeUnsignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: string): Promise<T[ChainIdentifier]["TX"]> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.deserializeTx(tx);
    }

    /**
     * Serializes a signed smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx A signed transaction to serialize
     */
    serializeSignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: T[ChainIdentifier]["SignedTXType"]): Promise<string> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.serializeSignedTx(tx);
    }

    /**
     * Deserializes a signed smart chain transaction
     *
     * @param chainIdentifier Smart chain string identifier
     * @param tx Serialized signed transaction
     */
    deserializeSignedTransaction<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, tx: string): Promise<T[ChainIdentifier]["SignedTXType"]> {
        if(this.root._chains[chainIdentifier]==null) throw new Error("Invalid chain identifier! Unknown chain: "+chainIdentifier);
        return this.root._chains[chainIdentifier].chainInterface.deserializeSignedTx(tx);
    }

}