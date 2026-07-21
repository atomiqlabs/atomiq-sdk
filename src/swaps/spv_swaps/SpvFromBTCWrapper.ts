import {ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens} from "../ISwapWrapper.js";
import {
    BitcoinRpcWithAddressIndex, BtcBlock,
    BtcRelay,
    ChainEvent,
    ChainType,
    isSpvVaultClaimEvent,
    isSpvVaultCloseEvent,
    isSpvVaultFrontEvent,
    RelaySynchronizer,
    SpvVaultClaimEvent,
    SpvVaultCloseEvent, SpvVaultData,
    SpvVaultFrontEvent,
    SpvVaultTokenBalance,
    SpvWithdrawalClaimedState,
    SpvWithdrawalFrontedState,
    SpvWithdrawalStateType
} from "@atomiqlabs/base";
import {SpvFromBTCSwap} from "./SpvFromBTCSwap.js";
import {BTC_NETWORK, TEST_NETWORK} from "@scure/btc-signer/utils";
import {SwapType} from "../../enums/SwapType.js";
import {UnifiedSwapStorage} from "../../storage/UnifiedSwapStorage.js";
import {UnifiedSwapEventListener} from "../../events/UnifiedSwapEventListener.js";
import {ISwapPrice} from "../../prices/abstract/ISwapPrice.js";
import {EventEmitter} from "events";
import {Intermediary} from "../../intermediaries/Intermediary.js";
import {extendAbortController, mapArrayToObject, randomBytes, throwIfUndefined} from "../../utils/Utils.js";
import {
    fromOutputScript,
    getDummyOutputScript,
    toCoinselectAddressType,
    toOutputScript
} from "../../utils/BitcoinUtils.js";
import {IntermediaryAPI, SpvFromBTCPrepareResponseType} from "../../intermediaries/apis/IntermediaryAPI.js";
import {OutOfBoundsError, RequestError} from "../../errors/RequestError.js";
import {IntermediaryError} from "../../errors/IntermediaryError.js";
import {CoinselectAddressTypes} from "../../bitcoin/coinselect2/index.js";
import {OutScript, Transaction} from "@scure/btc-signer";
import {ISwap} from "../ISwap.js";
import {IClaimableSwapWrapper} from "../IClaimableSwapWrapper.js";
import {AmountData} from "../../types/AmountData.js";
import {tryWithRetries} from "../../utils/RetryUtils.js";
import {AllOptional} from "../../utils/TypeUtils.js";
import {UserError} from "../../errors/UserError.js";
import {BitcoinWalletUtxo, BitcoinWalletUtxoBase, IBitcoinWallet} from "../../bitcoin/wallet/IBitcoinWallet.js";
import {utils} from "../../bitcoin/coinselect2/utils.js";
import {BitcoinWallet} from "../../bitcoin/wallet/BitcoinWallet.js";
import {SpvFromBTCSwapInit, SpvFromBTCSwapState} from "./SpvFromBTCSwapBase.js";
import {MinimalBitcoinWalletInterface} from "../../types/wallets/MinimalBitcoinWalletInterface";

export type SpvFromBTCOptions = {
    /**
     * Optional additional native token to receive as an output of the swap (e.g. STRK on Starknet or cBTC on Citrea).
     *
     * When passed as a `bigint` it is specified in base units of the token and in `string` it is the human readable
     *  decimal format.
     */
    gasAmount?: bigint | string,
    /**
     * The LP enforces a minimum bitcoin fee rate in sats/vB for the swap transaction. With this config you can optionally
     *  limit how high of a minimum fee rate would you accept.
     *
     * By default the maximum allowed fee rate is calculated dynamically based on current bitcoin fee rate as:
     *
     * `maxAllowedBitcoinFeeRate` = 10 + `currentBitcoinFeeRate` * 1.5
     */
    maxAllowedBitcoinFeeRate?: number,
    /**
     * A flag to attach 0 watchtower fee to the swap, this would make the settlement unattractive for the watchtowers
     *  and therefore automatic settlement for such swaps will not be possible, you will have to settle manually
     *  with {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} functions.
     */
    unsafeZeroWatchtowerFee?: boolean,
    /**
     * A safety factor to use when estimating the watchtower fee to attach to the swap (this has to cover the gas fee
     *  of watchtowers settling the swap). A higher multiple here would mean that a swap is more attractive for
     *  watchtowers to settle automatically.
     *
     * Uses a `1.25` multiple by default (i.e. the current network fee is multiplied by 1.25 and then used to estimate
     *  the settlement gas fee cost)
     */
    feeSafetyFactor?: number,
    /**
     * Instruct the LP to create a "sticky address" for your destination wallet address. After the first successful
     *  swap with that LP, the used bitcoin address will be permanently linked to your destination wallet address. So
     *  all subsequent swaps to the same address will yield the same LP deposit bitcoin address. Useful for corporate
     *  whitelist-only wallets
     */
    stickyAddress?: boolean,
    /**
     * Bitcoin fee rate to use when deriving `maxAllowedBitcoinFeeRate` and when calculating the input amount based
     *  on the `sourceWalletUtxos`
     */
    bitcoinFeeRate?: Promise<number> | number,

    /**
     * Source-wallet UTXOs from which to derive an exact-input quote. This option is only valid for exact-input swaps.
     *
     * When `amount` is `undefined`, the quote sweeps the spendable value of these UTXOs after Bitcoin network fees.
     * When `amount` is provided, it is the total BTC input budget including Bitcoin network fees; this also requires
     * {@link sourceWalletAddressType} and `sourceWalletSkipDetrimentalUtxos: false`. If the supplied UTXOs do not cover
     * that budget, the funding calculation models one additional UTXO using {@link sourceWalletCpfpAssumption}.
     *
     * This is a low-level funding override used by wallet-sweep and intermediate-wallet quote flows. Prefer the
     * dedicated swapper helpers for those flows where available.
     */
    sourceWalletUtxos?: BitcoinWalletUtxo[] | Promise<BitcoinWalletUtxo[]>,
    /**
     * Whether to exclude detrimental UTXOs whose value is lower than the fee required to spend them, including any
     * CPFP fee. Defaults to `false`.
     *
     * Must not be set to `true` when {@link sourceWalletUtxos} is used with a provided exact-input `amount`, because
     * that mode calculates the quote from the complete supplied funding set.
     */
    sourceWalletSkipDetrimentalUtxos?: boolean,
    /**
     * CPFP assumptions for the transaction that creates a potential additional source-wallet UTXO when the supplied
     * UTXOs do not cover a provided exact-input `amount`. `txVsize` is the parent transaction size in vbytes and
     * `txEffectiveFeeRate` is its effective fee rate in sats/vB. These values affect the quote-time funding and fee
     * calculation only for that modeled future UTXO.
     *
     * Defaults to `{txVsize: 200, txEffectiveFeeRate: 1}`.
     */
    sourceWalletCpfpAssumption?: {txVsize: number, txEffectiveFeeRate: number},
    /**
     * Bitcoin address type of the source wallet's change/receive address. It is used to estimate the size and dust
     * threshold of a change output or an additional funding UTXO.
     *
     * Required when {@link sourceWalletUtxos} is combined with a provided exact-input `amount`; ignored for a full
     * sweep where `amount` is `undefined`. Wallet-based helpers infer this value from the wallet's receive address.
     */
    sourceWalletAddressType?: CoinselectAddressTypes

    /**
     * @deprecated Use `maxAllowedBitcoinFeeRate` instead!
     */
    maxAllowedNetworkFeeRate?: number,
};

export type SpvFromBTCWrapperOptions = ISwapWrapperOptions & {
    maxConfirmations: number,
    bitcoinNetwork: BTC_NETWORK,
    bitcoinBlocktime: number,
    maxTransactionsDelta: number, //Maximum accepted difference in state between SC state and bitcoin state, in terms of by how many transactions are they differing
    maxRawAmountAdjustmentDifferencePPM: number,
    maxBtcFeeMultiplier: number,
    maxBtcFeeOffset: number
};

export type SpvFromBTCTypeDefinition<T extends ChainType> = SwapTypeDefinition<T, SpvFromBTCWrapper<T>, SpvFromBTCSwap<T>>;

export const REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE: CoinselectAddressTypes = "p2tr";
export const REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE: CoinselectAddressTypes = "p2wpkh";
export const DEFAULT_CPFP_ASSUMPTION = {txVsize: 200, txEffectiveFeeRate: 1};

export function assertSupportedSpvFundingType(
    type: CoinselectAddressTypes
): asserts type is "p2wpkh" | "p2sh-p2wpkh" | "p2tr" {
    if(type!=="p2wpkh" && type!=="p2sh-p2wpkh" && type!=="p2tr") {
        throw new UserError(
            `Unsupported SPV funding address type: ${type}. Supported types: p2wpkh, p2sh-p2wpkh, p2tr`
        );
    }
}

export type SelectedUtxosInfo = {
    selectedUtxos: BitcoinWalletUtxoBase[],
    skipDetrimental: boolean,
    lpOutputAmount: bigint,
    totalNetworkFee: bigint,
    changeOutputAmount?: bigint,
    additionalInputAmount?: bigint
};

/**
 * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring
 *  any initiation on the destination chain, and with the added possibility for the user to receive
 *  a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
export class SpvFromBTCWrapper<
    T extends ChainType
> extends ISwapWrapper<T, SpvFromBTCTypeDefinition<T>, SpvFromBTCWrapperOptions> implements IClaimableSwapWrapper<SpvFromBTCSwap<T>> {
    public readonly TYPE: SwapType.SPV_VAULT_FROM_BTC = SwapType.SPV_VAULT_FROM_BTC;
    /**
     * @internal
     */
    readonly _claimableSwapStates = [SpvFromBTCSwapState.BTC_TX_CONFIRMED];
    /**
     * @internal
     */
    readonly _swapDeserializer = SpvFromBTCSwap;


    /**
     * @internal
     */
    protected readonly btcRelay: (version?: string) => BtcRelay<any, T["TX"], any> = (version?: string) => {
        const _version = version ?? "v1";
        const data = this.versionedContracts[_version];
        if(data==null) throw new Error(`Invalid contract version ${_version} requested`);
        return data.btcRelay;
    };
    /**
     * @internal
     */
    protected readonly tickSwapState: Array<SpvFromBTCSwap<T>["_state"]> = [
        SpvFromBTCSwapState.CREATED,
        SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED,
        SpvFromBTCSwapState.SIGNED,
        SpvFromBTCSwapState.POSTED,
        SpvFromBTCSwapState.BROADCASTED
    ];


    /**
     * @internal
     */
    readonly _synchronizer: (version?: string) => RelaySynchronizer<any, T["TX"], any> = (version?: string) => {
        const _version = version ?? "v1";
        const data = this.versionedSynchronizer[_version];
        if(data==null) throw new Error(`Invalid contract version ${_version} requested`);
        return data.synchronizer;
    };
    /**
     * @internal
     */
    readonly _contract: (version?: string) => T["SpvVaultContract"] = (version?: string) => {
        const _version = version ?? "v1";
        const data = this.versionedContracts[_version];
        if(data==null) throw new Error(`Invalid contract version ${_version} requested`);
        return data.spvVaultContract;
    };
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpcWithAddressIndex<BtcBlock>;
    /**
     * @internal
     */
    readonly _spvWithdrawalDataDeserializer: (version?: string) => (new (data: any) => T["SpvVaultWithdrawalData"]) = (version?: string) => {
        const _version = version ?? "v1";
        const data = this.versionedContracts[_version];
        if(data==null) throw new Error(`Invalid contract version ${_version} requested`);
        return data.spvVaultWithdrawalDataConstructor;
    };

    /**
     * @internal
     */
    readonly _pendingSwapStates: Array<SpvFromBTCSwap<T>["_state"]> = [
        SpvFromBTCSwapState.CREATED,
        SpvFromBTCSwapState.SIGNED,
        SpvFromBTCSwapState.POSTED,
        SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED,
        SpvFromBTCSwapState.BROADCASTED,
        SpvFromBTCSwapState.DECLINED,
        SpvFromBTCSwapState.BTC_TX_CONFIRMED
    ];

    private readonly versionedContracts: {
        [version: string]: {
            btcRelay: BtcRelay<any, T["TX"], any>,
            spvVaultContract: T["SpvVaultContract"],
            spvVaultWithdrawalDataConstructor: new (data: any) => T["SpvVaultWithdrawalData"]
        }
    } = {};

    private readonly versionedSynchronizer: {
        [version: string]: {
            synchronizer: RelaySynchronizer<any, T["TX"], any>
        }
    } = {};

    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param prices Pricing to use
     * @param tokens
     * @param versionedContracts
     * @param versionedSynchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param lpApi
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        versionedContracts: {
            [version: string]: {
                btcRelay: BtcRelay<any, T["TX"], any>,
                spvVaultContract: T["SpvVaultContract"],
                spvVaultWithdrawalDataConstructor: new (data: any) => T["SpvVaultWithdrawalData"]
            }
        },
        versionedSynchronizer: {
            [version: string]: {
                synchronizer: RelaySynchronizer<any, T["TX"], any>
            }
        },
        btcRpc: BitcoinRpcWithAddressIndex<any>,
        lpApi: IntermediaryAPI,
        options?: AllOptional<SpvFromBTCWrapperOptions>,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(
            chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, lpApi,
            {
                ...options,
                bitcoinNetwork: options?.bitcoinNetwork ?? TEST_NETWORK,
                maxConfirmations: options?.maxConfirmations ?? 6,
                bitcoinBlocktime: options?.bitcoinBlocktime ?? 10*60,
                maxTransactionsDelta: options?.maxTransactionsDelta ?? 3,
                maxRawAmountAdjustmentDifferencePPM: options?.maxRawAmountAdjustmentDifferencePPM ?? 100,
                maxBtcFeeOffset: options?.maxBtcFeeOffset ?? 10,
                maxBtcFeeMultiplier: options?.maxBtcFeeMultiplier ?? 1.5
            },
            events
        );
        this.versionedContracts = versionedContracts;
        this.versionedSynchronizer = versionedSynchronizer;
        this._btcRpc = btcRpc;
    }

    private async processEventFront(event: SpvVaultFrontEvent, swap: SpvFromBTCSwap<T>): Promise<boolean> {
        if(
            swap._state===SpvFromBTCSwapState.SIGNED || swap._state===SpvFromBTCSwapState.POSTED ||
            swap._state===SpvFromBTCSwapState.BROADCASTED || swap._state===SpvFromBTCSwapState.DECLINED ||
            swap._state===SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED || swap._state===SpvFromBTCSwapState.BTC_TX_CONFIRMED
        ) {
            swap._state = SpvFromBTCSwapState.FRONTED;
            await swap._setBitcoinTxId(event.btcTxId).catch(e => {
                this.logger.warn("processEventFront(): Failed to set bitcoin txId: ", e);
            });
            return true;
        }
        return false;
    }

    private async processEventClaim(event: SpvVaultClaimEvent, swap: SpvFromBTCSwap<T>): Promise<boolean> {
        if(
            swap._state===SpvFromBTCSwapState.SIGNED || swap._state===SpvFromBTCSwapState.POSTED ||
            swap._state===SpvFromBTCSwapState.BROADCASTED || swap._state===SpvFromBTCSwapState.DECLINED ||
            swap._state===SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED || swap._state===SpvFromBTCSwapState.FRONTED ||
            swap._state===SpvFromBTCSwapState.BTC_TX_CONFIRMED
        ) {
            swap._state = SpvFromBTCSwapState.CLAIMED;
            await swap._setBitcoinTxId(event.btcTxId).catch(e => {
                this.logger.warn("processEventClaim(): Failed to set bitcoin txId: ", e);
            });
            return true;
        }
        return false;
    }

    private processEventClose(event: SpvVaultCloseEvent, swap: SpvFromBTCSwap<T>): Promise<boolean> {
        if(
            swap._state===SpvFromBTCSwapState.SIGNED || swap._state===SpvFromBTCSwapState.POSTED ||
            swap._state===SpvFromBTCSwapState.BROADCASTED || swap._state===SpvFromBTCSwapState.DECLINED ||
            swap._state===SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED || swap._state===SpvFromBTCSwapState.BTC_TX_CONFIRMED
        ) {
            swap._state = SpvFromBTCSwapState.CLOSED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected async processEvent(event: ChainEvent<T["Data"]>, swap: SpvFromBTCSwap<T>): Promise<void> {
        if(swap==null) return;

        let swapChanged: boolean = false;
        if(isSpvVaultFrontEvent(event)) {
            swapChanged = await this.processEventFront(event, swap);
            if(event.meta?.txId!=null && swap._frontTxId!==event.meta.txId) {
                swap._frontTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(isSpvVaultClaimEvent(event)) {
            swapChanged = await this.processEventClaim(event, swap);
            if(event.meta?.txId!=null && swap._claimTxId!==event.meta.txId) {
                swap._claimTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(isSpvVaultCloseEvent(event)) {
            swapChanged = await this.processEventClose(event, swap);
        }

        this.logger.info("processEvents(): "+event.constructor.name+" processed for "+swap.getId()+" swap: ", swap);

        if(swapChanged) {
            await swap._saveAndEmit();
        }
    }

    /**
     * Pre-fetches latest finalized block height of the smart chain
     *
     * @param abortController
     * @private
     */
    private async preFetchFinalizedBlockHeight(abortController: AbortController): Promise<number | undefined> {
        try {
            const block = await this._chain.getFinalizedBlock();
            return block.height;
        } catch (e) {
            abortController.abort(e);
        }
    }

    /**
     * Pre-fetches caller (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     * @param contractVersion
     * @private
     */
    private async preFetchCallerFeeInNativeToken(
        amountData: {amount?: bigint},
        options: {
            unsafeZeroWatchtowerFee: boolean,
            feeSafetyFactor: number
        },
        abortController: AbortController,
        contractVersion: string
    ): Promise<bigint | undefined> {
        if(options.unsafeZeroWatchtowerFee) return 0n;
        if(amountData.amount===0n) return 0n;

        try {
            const [
                feePerBlock,
                btcRelayData,
                currentBtcBlock,
                claimFeeRate
            ] = await Promise.all([
                this.btcRelay(contractVersion).getFeePerBlock(),
                this.btcRelay(contractVersion).getTipData(),
                this._btcRpc.getTipHeight(),
                this._contract(contractVersion).getClaimFee(this._chain.randomAddress())
            ]);

            if(btcRelayData==null) throw new Error("Btc relay doesn't seem to be initialized!");

            const currentBtcRelayBlock = btcRelayData.blockheight;
            const blockDelta = Math.max(currentBtcBlock-currentBtcRelayBlock+this._options.maxConfirmations, 0);

            const totalFeeInNativeToken = (
                (BigInt(blockDelta) * feePerBlock) +
                (claimFeeRate * BigInt(this._options.maxTransactionsDelta))
            ) * BigInt(Math.floor(options.feeSafetyFactor*1000000)) / 1_000_000n;

            return totalFeeInNativeToken;
        } catch (e) {
            abortController.abort(e);
        }
    }

    /**
     * Pre-fetches caller (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param amountPrefetch
     * @param totalFeeInNativeTokenPrefetch
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param pricePrefetch
     * @param nativeTokenPricePrefetch
     * @param abortSignal
     * @private
     */
    private async computeCallerFeeShare(
        amountPrefetch: Promise<bigint | undefined>,
        totalFeeInNativeTokenPrefetch: Promise<bigint | undefined>,
        amountData: {exactIn: boolean, token: string},
        options: {unsafeZeroWatchtowerFee: boolean},
        pricePrefetch: Promise<bigint | undefined>,
        nativeTokenPricePrefetch: Promise<bigint | undefined> | undefined,
        abortSignal?: AbortSignal
    ): Promise<bigint> {
        if(options.unsafeZeroWatchtowerFee) return 0n;

        const amount = await throwIfUndefined(amountPrefetch, "Cannot get swap amount!");
        if(amount===0n) return 0n;

        const totalFeeInNativeToken = await throwIfUndefined(totalFeeInNativeTokenPrefetch, "Cannot get total fee in native token!");
        const nativeTokenPrice = await nativeTokenPricePrefetch;

        let payoutAmount: bigint;
        if(amountData.exactIn) {
            //Convert input amount in BTC to
            const amountInNativeToken = await this._prices.getFromBtcSwapAmount(this.chainIdentifier, amount, this._chain.getNativeCurrencyAddress(), abortSignal, nativeTokenPrice);
            payoutAmount = amountInNativeToken - totalFeeInNativeToken;
        } else {
            if(amountData.token===this._chain.getNativeCurrencyAddress()) {
                //Both amounts in same currency
                payoutAmount = amount;
            } else {
                //Need to convert both to native currency
                const btcAmount = await this._prices.getToBtcSwapAmount(this.chainIdentifier, amount, amountData.token, abortSignal, await pricePrefetch);
                payoutAmount = await this._prices.getFromBtcSwapAmount(this.chainIdentifier, btcAmount, this._chain.getNativeCurrencyAddress(), abortSignal, nativeTokenPrice);
            }
        }

        this.logger.debug("computeCallerFeeShare(): Caller fee in native token: "+totalFeeInNativeToken.toString(10)+" total payout in native token: "+payoutAmount.toString(10));

        const callerFeeShare = ((totalFeeInNativeToken * 100_000n) + payoutAmount - 1n) / payoutAmount; //Make sure to round up here
        if(callerFeeShare < 0n) return 0n;
        if(callerFeeShare >= 2n**20n) return 2n**20n - 1n;
        return callerFeeShare;
    }

    /**
     * Verifies response returned from intermediary
     *
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param callerFeeShare
     * @param maxBitcoinFeeRatePromise Maximum accepted fee rate from the LPs
     * @param bitcoinFeeRatePromise
     * @param abortSignal
     * @private
     * @throws {IntermediaryError} in case the response is invalid
     */
    private async verifyReturnedData(
        resp: SpvFromBTCPrepareResponseType,
        amountData: {exactIn: boolean, amount?: bigint},
        lp: Intermediary,
        options: {
            gasAmount: bigint,
            sourceWalletUtxos?: Promise<BitcoinWalletUtxoBase[]>,
            sourceWalletSkipDetrimentalUtxos?: boolean,
            sourceWalletAddressType?: CoinselectAddressTypes,
            sourceWalletCpfpAssumption?: {txVsize: number, txEffectiveFeeRate: number}
        },
        callerFeeShare: bigint,
        maxBitcoinFeeRatePromise: Promise<number | undefined>,
        bitcoinFeeRatePromise: Promise<number | undefined> | undefined,
        abortSignal: AbortSignal
    ): Promise<{
        vault: T["SpvVaultData"],
        vaultUtxoValue: number,
        utxoSelection?: SelectedUtxosInfo
    }> {
        const btcFeeRate = await throwIfUndefined(maxBitcoinFeeRatePromise, "Bitcoin fee rate promise failed!");
        abortSignal.throwIfAborted();
        if(btcFeeRate!=null && resp.btcFeeRate > btcFeeRate) throw new IntermediaryError(`Required bitcoin fee rate returned from the LP is too high! Maximum accepted: ${btcFeeRate} sats/vB, required by LP: ${resp.btcFeeRate} sats/vB`);

        const lpVersion = lp.getContractVersion(this.chainIdentifier);

        //Vault related
        let vaultScript: Uint8Array;
        let vaultAddressType: CoinselectAddressTypes;
        let btcAddressScript: Uint8Array;
        let btcAddressType: CoinselectAddressTypes;
        //Ensure valid btc addresses returned
        try {
            vaultScript = toOutputScript(this._options.bitcoinNetwork, resp.vaultBtcAddress);
            vaultAddressType = toCoinselectAddressType(vaultScript);
            btcAddressScript = toOutputScript(this._options.bitcoinNetwork, resp.btcAddress);
            btcAddressType = toCoinselectAddressType(btcAddressScript);
        } catch (e) {
            throw new IntermediaryError("Invalid btc address data returned", e);
        }
        const decodedUtxo = resp.btcUtxo.split(":");
        if(
            resp.address!==lp.getAddress(this.chainIdentifier) || //Ensure the LP is indeed the vault owner
            resp.vaultId < 0n || //Ensure vaultId is not negative
            vaultScript==null || //Make sure vault script is parsable and of known type
            btcAddressScript==null || //Make sure btc address script is parsable and of known type
            btcAddressType!==REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE || //Constrain the btc address script type
            vaultAddressType!==REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE || //Constrain the vault script type
            decodedUtxo.length!==2 || decodedUtxo[0].length!==64 || isNaN(parseInt(decodedUtxo[1])) || //Check valid UTXO
            resp.btcFeeRate < 1 || resp.btcFeeRate > 10000 //Sanity check on the returned BTC fee rate
        ) throw new IntermediaryError("Invalid vault data returned!");

        //Amounts sanity
        if(resp.btcAmountSwap + resp.btcAmountGas !==resp.btcAmount) throw new Error("Btc amount mismatch");
        if(resp.swapFeeBtc + resp.gasSwapFeeBtc !==resp.totalFeeBtc) throw new Error("Btc fee mismatch");

        //TODO: For now ensure fees are at 0
        if(
            resp.callerFeeShare!==callerFeeShare ||
            resp.frontingFeeShare!==0n ||
            resp.executionFeeShare!==0n
        ) throw new IntermediaryError("Invalid caller/fronting/execution fee returned");

        //Check expiry
        const timeNowSeconds = Math.floor(Date.now()/1000);
        if(resp.expiry < timeNowSeconds) throw new IntermediaryError(`Quote already expired, expiry: ${resp.expiry}, systemTime: ${timeNowSeconds}, clockAdjusted: ${(Date as any)._now!=null}`);

        let utxo = resp.btcUtxo.toLowerCase();
        const [txId, voutStr] = utxo.split(":");

        const abortController = extendAbortController(abortSignal);
        let [{vault, utxoSelection}, {vaultUtxoValue, btcTx}] = await Promise.all([
            (async() => {
                //Fetch vault data
                let vault: T["SpvVaultData"] | null;
                try {
                    vault = await this._contract(lpVersion).getVaultData(resp.address, resp.vaultId);
                } catch (e) {
                    this.logger.error("Error getting spv vault (owner: "+resp.address+" vaultId: "+resp.vaultId.toString(10)+"): ", e);
                    throw new IntermediaryError("Spv swap vault not found", e);
                }
                abortController.signal.throwIfAborted();

                //Make sure vault is opened
                if(vault==null || !vault.isOpened()) throw new IntermediaryError("Returned spv swap vault is not opened!");
                //Make sure the vault doesn't require insane amount of confirmations
                if(vault.getConfirmations()>this._options.maxConfirmations) throw new IntermediaryError("SPV swap vault needs too many confirmations: "+vault.getConfirmations());
                const tokenData = vault.getTokenData();

                //Amounts - make sure the amounts match
                let utxoSelection: SelectedUtxosInfo | undefined;
                if(amountData.exactIn) {
                    if(options.sourceWalletUtxos==null) {
                        //Legacy calculation
                        if(resp.btcAmount !== amountData.amount) throw new IntermediaryError("Invalid amount returned");
                    } else {
                        if(!resp.usedUtxoInputCalculation) throw new IntermediaryError("Invalid usedUtxoInputCalculation flag returned");
                        //Implies the raw UTXOs were passed for amount derivation
                        //Verify the derivation was done correctly
                        if(bitcoinFeeRatePromise==null) throw new Error("bitcoinFeeRatePromise must be passed for UTXO-based input amount calculation checks");
                        const walletUtxos = await options.sourceWalletUtxos;
                        const bitcoinFeeRate = await throwIfUndefined(bitcoinFeeRatePromise, "Failed to fetch bitcoin fee rate!");

                        utxoSelection = await this.calculateSelectedUtxosAndAmounts(
                            walletUtxos, Math.max(resp.btcFeeRate, bitcoinFeeRate), options.gasAmount!==0n,
                            amountData.amount, options.sourceWalletAddressType, options.sourceWalletSkipDetrimentalUtxos,
                            options.sourceWalletCpfpAssumption
                        );
                        const {lpOutputAmount} = utxoSelection;

                        if(resp.btcAmount !== lpOutputAmount) throw new IntermediaryError(`Invalid amount returned, expected: ${lpOutputAmount.toString(10)}, got: ${resp.btcAmount.toString(10)}`);
                    }
                } else {
                    if(amountData.amount==null) throw new Error("Amount must always be set for exact output swap");
                    //Check the difference between amount adjusted due to scaling to raw amount
                    const adjustedAmount = amountData.amount / tokenData[0].multiplier * tokenData[0].multiplier;
                    const adjustmentPPM = (amountData.amount - adjustedAmount)*1_000_000n / amountData.amount;
                    if(adjustmentPPM > this._options.maxRawAmountAdjustmentDifferencePPM)
                        throw new IntermediaryError("Invalid amount0 multiplier used, rawAmount diff too high");
                    if(resp.total !== adjustedAmount) throw new IntermediaryError("Invalid total returned");
                }
                if(options.gasAmount===0n) {
                    if(resp.totalGas !== 0n) throw new IntermediaryError("Invalid gas total returned");
                } else {
                    //Check the difference between amount adjusted due to scaling to raw amount
                    const adjustedGasAmount = options.gasAmount / tokenData[0].multiplier * tokenData[0].multiplier;
                    const adjustmentPPM = (options.gasAmount - adjustedGasAmount)*1_000_000n / options.gasAmount;
                    if(adjustmentPPM > this._options.maxRawAmountAdjustmentDifferencePPM)
                        throw new IntermediaryError("Invalid amount1 multiplier used, rawAmount diff too high");
                    if(resp.totalGas !== adjustedGasAmount) throw new IntermediaryError("Invalid gas total returned");
                }

                return {vault, utxoSelection};
            })(),
            (async() => {
                //Require the vault UTXO to have at least 1 confirmation
                let btcTx = await this._btcRpc.getTransaction(txId);
                if(btcTx==null) throw new IntermediaryError("Invalid UTXO, doesn't exist (txId)");
                abortController.signal.throwIfAborted();
                if(btcTx.confirmations==null || btcTx.confirmations<1) throw new IntermediaryError("SPV vault UTXO not confirmed");
                const vout = parseInt(voutStr);
                if(btcTx.outs[vout]==null) throw new IntermediaryError("Invalid UTXO, doesn't exist");
                const vaultUtxoValue = btcTx.outs[vout].value;
                return {btcTx, vaultUtxoValue};
            })(),
            (async() => {
                //Require vault UTXO is unspent
                if(await this._btcRpc.isSpent(utxo)) throw new IntermediaryError("Returned spv vault UTXO is already spent", null, true);
                abortController.signal.throwIfAborted();
            })()
        ]).catch(e => {
            abortController.abort(e);
            throw e;
        });

        this.logger.debug("verifyReturnedData(): Vault UTXO: "+vault.getUtxo()+" current utxo: "+utxo);

        //Trace returned utxo back to what's saved on-chain
        let pendingWithdrawals: T["SpvVaultWithdrawalData"][] = [];
        while(vault.getUtxo()!==utxo) {
            const [txId, voutStr] = utxo.split(":");
            //Such that 1st tx isn't fetched twice
            if(btcTx.txid!==txId) {
                const _btcTx = await this._btcRpc.getTransaction(txId);
                if(_btcTx==null) throw new IntermediaryError("Invalid ancestor transaction (not found)");
                btcTx = _btcTx;
            }
            const withdrawalData = await this._contract(lpVersion).getWithdrawalData(btcTx);
            abortSignal.throwIfAborted();
            pendingWithdrawals.unshift(withdrawalData);
            utxo = pendingWithdrawals[0].getSpentVaultUtxo();
            this.logger.debug("verifyReturnedData(): Vault UTXO: "+vault.getUtxo()+" current utxo: "+utxo);
            if(pendingWithdrawals.length>=this._options.maxTransactionsDelta)
                throw new IntermediaryError("BTC <> SC state difference too deep, maximum: "+this._options.maxTransactionsDelta);
        }

        //Verify that the vault has enough balance after processing all pending withdrawals
        let vaultBalances: {balances: SpvVaultTokenBalance[]};
        try {
            vaultBalances = vault.calculateStateAfter(pendingWithdrawals);
        } catch (e) {
            this.logger.error("Error calculating spv vault balance (owner: "+resp.address+" vaultId: "+resp.vaultId.toString(10)+"): ", e);
            throw new IntermediaryError("Spv swap vault balance prediction failed", e);
        }
        if(vaultBalances.balances[0].scaledAmount < resp.total)
            throw new IntermediaryError("SPV swap vault, insufficient balance, required: "+resp.total.toString(10)+
                " has: "+vaultBalances.balances[0].scaledAmount.toString(10));
        if(vaultBalances.balances[1].scaledAmount < resp.totalGas)
            throw new IntermediaryError("SPV swap vault, insufficient balance, required: "+resp.totalGas.toString(10)+
                " has: "+vaultBalances.balances[1].scaledAmount.toString(10));

        //Also verify that all the withdrawal txns are valid, this is an extra sanity check
        try {
            for(let withdrawal of pendingWithdrawals) {
                await this._contract(lpVersion).checkWithdrawalTx(withdrawal);
            }
        } catch (e) {
            this.logger.error("Error calculating spv vault balance (owner: "+resp.address+" vaultId: "+resp.vaultId.toString(10)+"): ", e);
            throw new IntermediaryError("Spv swap vault balance prediction failed", e);
        }
        abortSignal.throwIfAborted();

        return {
            vault,
            vaultUtxoValue,
            utxoSelection
        };
    }

    private async calculateSelectedUtxosAndAmounts(
        walletUtxos: BitcoinWalletUtxoBase[],
        bitcoinFeeRate: number,
        includeGas: boolean,
        amount?: bigint,
        walletType?: CoinselectAddressTypes,
        skipDetrimental: boolean = true,
        cpfpAssumption?: { txVsize: number, txEffectiveFeeRate: number }
    ): Promise<SelectedUtxosInfo> {
        skipDetrimental ??= true;
        cpfpAssumption ??= DEFAULT_CPFP_ASSUMPTION;

        const swapPsbt = this.getDummySwapPsbt(includeGas);

        if(amount!=null) {
            const dustLimit = utils.dustThreshold({type: walletType!});
            swapPsbt.addOutput({
                script: getDummyOutputScript(walletType!),
                amount: BigInt(dustLimit)
            });
        }

        let spendableBalance = await BitcoinWallet.getSpendableBalance(
            walletUtxos, bitcoinFeeRate,
            swapPsbt, REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE, skipDetrimental
        );

        let changeOutputAmount: bigint | undefined = undefined;
        let additionalInputAmount: bigint | undefined = undefined;
        if(amount!=null) {
            const dustLimit = BigInt(utils.dustThreshold({type: walletType!}));
            const selectedUtxosBalance = spendableBalance.selectedUtxos.reduce((previous, curr) => previous + BigInt(curr.value), 0n);
            const difference = selectedUtxosBalance - amount;
            if(difference < 0n) {
                //Trying to spend too much, return the requirement of funding the wallet with another fresh UTXO
                const swapPsbt = this.getDummySwapPsbt(includeGas);
                additionalInputAmount = -difference;
                if(additionalInputAmount < dustLimit) additionalInputAmount = dustLimit;
                const syntheticUtxo = {type: walletType!, value: Number(additionalInputAmount), cpfp: cpfpAssumption};
                spendableBalance = BitcoinWallet.getSpendableBalance(
                    [...walletUtxos, syntheticUtxo],
                    bitcoinFeeRate, swapPsbt, REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE, skipDetrimental
                );
                // Remove the synthetic UTXO from the list
                const index = spendableBalance.selectedUtxos.indexOf(syntheticUtxo);
                if(index!==-1) spendableBalance.selectedUtxos.splice(index, 1);
            } else if(difference < dustLimit) {
                //Spending so big of a chunk that we cannot reasonably add a dust output, remove the change output
                // by re-generating the swap dummy psbt
                const swapPsbt = this.getDummySwapPsbt(includeGas);
                spendableBalance = BitcoinWallet.getSpendableBalance(
                    walletUtxos, bitcoinFeeRate,
                    swapPsbt, REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE, skipDetrimental
                );
            } else {
                //We adjust the added output's amount to reflect the difference
                swapPsbt.updateOutput(swapPsbt.outputsLength - 1, {amount: difference});
                changeOutputAmount = difference;
                spendableBalance = BitcoinWallet.getSpendableBalance(
                    walletUtxos, bitcoinFeeRate,
                    swapPsbt, REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE, skipDetrimental
                );
            }
        }

        return {
            selectedUtxos: spendableBalance.selectedUtxos,
            skipDetrimental,
            lpOutputAmount: spendableBalance.balance,
            totalNetworkFee: BigInt(spendableBalance.totalFee),
            changeOutputAmount,
            additionalInputAmount
        };
    }

    private async amountPrefetch(
        amountData: {token: string, exactIn: boolean, amount?: bigint},
        bitcoinFeeRatePromise: Promise<number | undefined>,
        walletUtxosPromise: Promise<BitcoinWalletUtxoBase[]> | undefined,
        includeGas: boolean,
        abortController: AbortController,
        walletType?: CoinselectAddressTypes,
        skipDetrimental?: boolean,
        sourceWalletCpfpAssumption?: {txVsize: number, txEffectiveFeeRate: number}
    ): Promise<bigint | undefined> {
        try {
            if(walletUtxosPromise==null) {
                if(amountData.amount==null) throw new UserError("Amount has to be specified when not passing UTXOs!");
                return amountData.amount;
            } else {
                if(amountData.amount!=null) {
                    if(walletType==null) throw new UserError("Wallet type has to be specified when passing UTXOs and amount!");
                }
                const bitcoinFeeRate = await throwIfUndefined(bitcoinFeeRatePromise, "Cannot fetch Bitcoin fee rate!");
                const walletUtxos = await walletUtxosPromise;

                return (await this.calculateSelectedUtxosAndAmounts(
                    walletUtxos,
                    bitcoinFeeRate,
                    includeGas,
                    amountData.amount,
                    walletType,
                    skipDetrimental,
                    sourceWalletCpfpAssumption
                )).lpOutputAmount;
            }
        } catch (e) {
            abortController.abort(e);
        }
    }

    private bitcoinFeeRatePrefetch(
        options: {
            maxAllowedBitcoinFeeRate: number,
            sourceWalletUtxos?: Promise<BitcoinWalletUtxoBase[]>,
            bitcoinFeeRate?: Promise<number>
        },
        abortController: AbortController
    ) {
        let bitcoinFeeRatePromise: Promise<number | undefined> | undefined;
        if(options?.sourceWalletUtxos!=null) {
            if(options.bitcoinFeeRate!=null) {
                bitcoinFeeRatePromise = options.bitcoinFeeRate.then(value => {
                    if(options.maxAllowedBitcoinFeeRate!=Infinity && options.maxAllowedBitcoinFeeRate<value)
                        throw new Error("Passed `maxAllowedBitcoinFeeRate` cannot be lower than `bitcoinFeeRate`");
                    return value;
                });
            } else {
                bitcoinFeeRatePromise = this._btcRpc.getFeeRate().then(value => {
                    if(options.maxAllowedBitcoinFeeRate!=Infinity && value > options.maxAllowedBitcoinFeeRate) return options.maxAllowedBitcoinFeeRate;
                    return value;
                });
            }
            bitcoinFeeRatePromise = bitcoinFeeRatePromise.catch(e => {
                abortController.abort(e);
                return undefined;
            });
        }
        const maxBitcoinFeeRatePromise: Promise<number | undefined> = options.maxAllowedBitcoinFeeRate!=Infinity
            ? Promise.resolve(options.maxAllowedBitcoinFeeRate)
            : throwIfUndefined(bitcoinFeeRatePromise ?? options.bitcoinFeeRate ?? this._btcRpc.getFeeRate())
                .then(x => this._options.maxBtcFeeOffset + (x*this._options.maxBtcFeeMultiplier))
                .catch(e => {
                    abortController.abort(e);
                    return undefined;
                });

        return {
            bitcoinFeeRatePromise,
            maxBitcoinFeeRatePromise
        }
    }

    private async initialSelectedUtxosInfoPrefetch(
        amountData: { amount?: bigint },
        options: {
            gasAmount: bigint,
            sourceWalletUtxos?: Promise<BitcoinWalletUtxoBase[]>,
            sourceWalletAddressType?: CoinselectAddressTypes,
            sourceWalletCpfpAssumption: {txVsize: number, txEffectiveFeeRate: number},
        },
        abortController: AbortController
    ) {
        try {
            const utxos = await options.sourceWalletUtxos!;
            return await this.calculateSelectedUtxosAndAmounts(
                utxos, 0, options.gasAmount!==0n, amountData.amount,
                options.sourceWalletAddressType, false, //Enforced as false in the previous condition
                options.sourceWalletCpfpAssumption
            );
        } catch (e) {
            abortController.abort(e);
        }
    }

    /**
     * Internal creation function for Bitcoin -> Smart chain swap using the SPV vault (UTXO-controlled vault) swap protocol,
     *  accepts three modes of operation:
     *  - Exact output - amount has to be specified, and it creates a quote paying exactly the specified amount
     *  - Exact input without UTXOs - amount has to be specified, specifies the clean input amount in BTC
     *   (without network fees) for the swap
     *  - Exact input with UTXOs - amount is optional:
     *      - Without amount - spends the whole balance of UTXOs that are passed (optionally skipping uneconomical
     *       utxos, controlled with the `options.sourceWalletSkipDetrimentalUtxos` option
     *      - With amount - specifies the input amount in BTC WITH the network fees already included, in this case
     *       all inputs are used without checking whether they are economical to spend
     *       (`options.sourceWalletSkipDetrimentalUtxos` has to be explicitly set to `false`)
     *
     * @param recipient Recipient address on the destination smart chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    private _create(
        recipient: string,
        amountData: { amount?: bigint, token: string, exactIn: boolean },
        lps: Intermediary[],
        options?: SpvFromBTCOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): {
        result: Promise<{
            quote: SpvFromBTCSwap<T>,
            utxoSelection?: SelectedUtxosInfo
        }>,
        intermediary: Intermediary
    }[] {
        const _options = {
            gasAmount: this.parseGasAmount(options?.gasAmount),
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false,
            feeSafetyFactor: options?.feeSafetyFactor ?? 1.25,
            maxAllowedBitcoinFeeRate: options?.maxAllowedBitcoinFeeRate ?? options?.maxAllowedNetworkFeeRate ?? Infinity,
            sourceWalletUtxos: options?.sourceWalletUtxos==undefined
                ? undefined
                : options?.sourceWalletUtxos instanceof Promise ? options.sourceWalletUtxos : Promise.resolve(options.sourceWalletUtxos),
            bitcoinFeeRate: options?.bitcoinFeeRate==undefined
                ? undefined
                : options?.bitcoinFeeRate instanceof Promise ? options.bitcoinFeeRate : Promise.resolve(options.bitcoinFeeRate),
            sourceWalletSkipDetrimentalUtxos: options?.sourceWalletSkipDetrimentalUtxos ?? false,
            sourceWalletAddressType: options?.sourceWalletAddressType,
            sourceWalletCpfpAssumption: options?.sourceWalletCpfpAssumption ?? DEFAULT_CPFP_ASSUMPTION
        };

        if(
            _options.gasAmount!==0n &&
            (
                this._chain.shouldGetNativeTokenDrop!=null
                    ? !this._chain.shouldGetNativeTokenDrop(amountData.token)
                    : amountData.token===this._chain.getNativeCurrencyAddress()
            )
        ) throw new UserError("Cannot specify `gasAmount` for swaps to a native token!");

        let initialSelectedUtxosInfo: Promise<SelectedUtxosInfo | undefined> | undefined;

        const _abortController = extendAbortController(abortSignal);

        if(amountData.amount==null && _options?.sourceWalletUtxos==null)
            throw new UserError("Source wallet UTXOs need to be passed when amount is null!");
        if(amountData.amount==null && !amountData.exactIn)
            throw new UserError("Amount can be null only for exactIn swaps!");
        if(_options?.sourceWalletUtxos!=null && !amountData.exactIn)
            throw new UserError("Source wallet UTXOs can only be set for exactIn swaps!");
        //Allow amount with source wallet utxos! But require the change address type to be passed
        if(amountData.amount!=null && _options?.sourceWalletUtxos!=null) {
            if(_options?.sourceWalletAddressType==null)
                throw new UserError("Source wallet address type is required when specifying an input amount with source wallet UTXOs!");
            if(_options.sourceWalletSkipDetrimentalUtxos)
                throw new UserError("Skip detrimental UTXOs must be set to false when specifying an input amount with source wallet UTXOs!");
            initialSelectedUtxosInfo = this.initialSelectedUtxosInfoPrefetch(amountData, _options, _abortController);
        }

        const lpVersions = Intermediary.getContractVersionsForLps(this.chainIdentifier, lps);

        const pricePrefetchPromise: Promise<bigint | undefined> = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise: Promise<number | undefined> = this.preFetchUsdPrice(_abortController.signal);
        const finalizedBlockHeightPrefetchPromise: Promise<number | undefined> = this.preFetchFinalizedBlockHeight(_abortController);
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const gasTokenPricePrefetchPromise: Promise<bigint | undefined> | undefined = _options.gasAmount===0n ?
            undefined :
            this.preFetchPrice({token: nativeTokenAddress}, _abortController.signal);
        const callerFeePrefetchPromise = mapArrayToObject(lpVersions, (contractVersion: string) => {
            return this.preFetchCallerFeeInNativeToken(amountData, _options, _abortController, contractVersion);
        });
        const {maxBitcoinFeeRatePromise, bitcoinFeeRatePromise} = this.bitcoinFeeRatePrefetch(_options, _abortController);
        const amountPromise = this.amountPrefetch(
            amountData, maxBitcoinFeeRatePromise, _options.sourceWalletUtxos, _options.gasAmount!==0n, _abortController,
            _options.sourceWalletAddressType, _options.sourceWalletSkipDetrimentalUtxos, _options.sourceWalletCpfpAssumption
        );

        return lps.map(lp => {
            return {
                intermediary: lp,
                result: tryWithRetries(async () => {
                    if(lp.services[SwapType.SPV_VAULT_FROM_BTC]==null) throw new Error("LP service for processing spv vault swaps not found!");
                    const version = lp.getContractVersion(this.chainIdentifier);

                    const abortController = extendAbortController(_abortController.signal);
                    const callerFeeRatePromise = this.computeCallerFeeShare(
                        amountPromise,
                        callerFeePrefetchPromise[version],
                        amountData,
                        _options,
                        pricePrefetchPromise,
                        gasTokenPricePrefetchPromise,
                        abortController.signal
                    );

                    try {
                        const resp = await tryWithRetries(async(retryCount: number) => {
                            return await this._lpApi.prepareSpvFromBTC(
                                this.chainIdentifier, lp.url,
                                {
                                    address: recipient,
                                    amount: throwIfUndefined(amountPromise, "Failed to compute swap amount"),
                                    token: amountData.token.toString(),
                                    exactOut: !amountData.exactIn,
                                    gasToken: nativeTokenAddress,
                                    gasAmount: _options.gasAmount,
                                    callerFeeRate: throwIfUndefined(callerFeeRatePromise, "Caller fee prefetch failed!"),
                                    frontingFeeRate: 0n,
                                    stickyAddress: options?.stickyAddress,
                                    amountUtxos: _options.sourceWalletUtxos!=null
                                        ? (async() => {
                                            const utxos = (await _options.sourceWalletUtxos!).map(utxo => ({
                                                value: utxo.value,
                                                vSize: utils.inputBytes({type: utxo.type}),
                                                cpfp: utxo.cpfp==null ? undefined : {effectiveVSize: utxo.cpfp?.txVsize, effectiveFeeRate: utxo.cpfp?.txEffectiveFeeRate}
                                            }));
                                            let additionalInputAmount = (await initialSelectedUtxosInfo)?.additionalInputAmount;
                                            if(utxos.length===0 && additionalInputAmount==null) return undefined;
                                            return utxos.concat(additionalInputAmount==null ? [] : [{
                                                value: Number(additionalInputAmount),
                                                vSize: utils.inputBytes({type: _options.sourceWalletAddressType!}),
                                                cpfp: {
                                                    effectiveVSize: _options.sourceWalletCpfpAssumption.txVsize,
                                                    effectiveFeeRate: _options.sourceWalletCpfpAssumption.txEffectiveFeeRate
                                                }
                                            }]);
                                        })()
                                        : undefined,
                                    amountFeeRate: bitcoinFeeRatePromise,
                                    amountSkipDetrimental: _options.sourceWalletSkipDetrimentalUtxos,
                                    amountChangeValue: initialSelectedUtxosInfo?.then(value => value?.changeOutputAmount),
                                    amountChangeVSize: initialSelectedUtxosInfo?.then(
                                        value => value?.changeOutputAmount!=null ? utils.outputBytes({type: _options.sourceWalletAddressType!})  : undefined
                                    ),
                                    additionalParams
                                },
                                this._options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined
                            );
                        }, undefined, e => e instanceof RequestError, abortController.signal);

                        this.logger.debug("create("+lp.url+"): LP response: ", resp)

                        const callerFeeShare = await callerFeeRatePromise;

                        const [
                            pricingInfo,
                            gasPricingInfo,
                            {vault, vaultUtxoValue, utxoSelection}
                        ] = await Promise.all([
                            this.verifyReturnedPrice(
                                lp.services[SwapType.SPV_VAULT_FROM_BTC],
                                false, resp.btcAmountSwap,
                                resp.total * (100_000n + callerFeeShare) / 100_000n,
                                amountData.token, {swapFeeBtc: resp.swapFeeBtc}, pricePrefetchPromise, usdPricePrefetchPromise, abortController.signal
                            ),
                            _options.gasAmount===0n ? Promise.resolve(undefined) : this.verifyReturnedPrice(
                                {...lp.services[SwapType.SPV_VAULT_FROM_BTC], swapBaseFee: 0}, //Base fee should be charged only on the amount, not on gas
                                false, resp.btcAmountGas,
                                resp.totalGas * (100_000n + callerFeeShare) / 100_000n,
                                nativeTokenAddress, {swapFeeBtc: resp.gasSwapFeeBtc}, gasTokenPricePrefetchPromise, usdPricePrefetchPromise, abortController.signal
                            ),
                            this.verifyReturnedData(
                                resp,
                                amountData,
                                lp, _options, callerFeeShare, maxBitcoinFeeRatePromise, bitcoinFeeRatePromise, abortController.signal
                            )
                        ]);

                        let minimumBtcFeeRate: number = resp.btcFeeRate;
                        if(bitcoinFeeRatePromise!=null) minimumBtcFeeRate = Math.max(minimumBtcFeeRate, await throwIfUndefined(bitcoinFeeRatePromise));

                        const swapInit: SpvFromBTCSwapInit = {
                            pricingInfo,
                            url: lp.url,
                            expiry: resp.expiry * 1000,
                            swapFee: resp.swapFee,
                            swapFeeBtc: resp.swapFeeBtc,
                            exactIn: amountData.exactIn ?? true,

                            quoteId: resp.quoteId,

                            recipient,

                            vaultOwner: resp.address,
                            vaultId: resp.vaultId,
                            vaultRequiredConfirmations: vault.getConfirmations(),
                            vaultTokenMultipliers: vault.getTokenData().map(val => val.multiplier),
                            vaultBtcAddress: resp.vaultBtcAddress,
                            vaultUtxo: resp.btcUtxo,
                            vaultUtxoValue: BigInt(vaultUtxoValue),

                            btcDestinationAddress: resp.btcAddress,
                            btcAmount: resp.btcAmount,
                            btcAmountSwap: resp.btcAmountSwap,
                            btcAmountGas: resp.btcAmountGas,
                            minimumBtcFeeRate,

                            outputTotalSwap: resp.total,
                            outputSwapToken: amountData.token,
                            outputTotalGas: resp.totalGas,
                            outputGasToken: nativeTokenAddress,
                            gasSwapFeeBtc: resp.gasSwapFeeBtc,
                            gasSwapFee: resp.gasSwapFee,
                            gasPricingInfo,

                            callerFeeShare: resp.callerFeeShare,
                            frontingFeeShare: resp.frontingFeeShare,
                            executionFeeShare: resp.executionFeeShare,

                            genesisSmartChainBlockHeight: await throwIfUndefined(
                                finalizedBlockHeightPrefetchPromise,
                                "Network finalized blockheight pre-fetch failed!"
                            ),
                            contractVersion: version
                        };
                        const quote = new SpvFromBTCSwap<T>(this, swapInit);
                        return {quote, utxoSelection};
                    } catch (e) {
                        if(e instanceof OutOfBoundsError) {
                            const amountResult = await amountPromise.catch(() => undefined);
                            if(_options.sourceWalletUtxos!=null && amountResult!=null && amountResult<=0n) {
                                e = new UserError("Wallet doesn't have enough BTC balance to cover transaction fees");
                            }
                        }
                        abortController.abort(e);
                        throw e;
                    }
                }, undefined, err => !(err instanceof IntermediaryError && err.recoverable), _abortController.signal)
            }
        });
    }

    public createWithUtxosExactIn(
        recipient: string,
        amountData: { amount?: bigint, token: string, exactIn: true },
        lps: Intermediary[],
        bitcoinWallet: IBitcoinWallet,
        options?: SpvFromBTCOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): {
        quote: Promise<SpvFromBTCSwap<T>>,
        intermediary: Intermediary
    }[] {
        const receiveWalletAddressInfo = bitcoinWallet.getAddressInfo(false);
        const sourceWalletAddressType = toCoinselectAddressType(this._options.bitcoinNetwork, receiveWalletAddressInfo.address);
        assertSupportedSpvFundingType(sourceWalletAddressType);

        let utxos = options?.sourceWalletUtxos;
        if(utxos==null) {
            utxos = bitcoinWallet.getUtxoPool();
        }
        const validatedUtxos = Promise.resolve(utxos).then(resolvedUtxos => {
            resolvedUtxos.forEach(utxo => assertSupportedSpvFundingType(utxo.type));
            return resolvedUtxos;
        });

        const resolvedCpfpAssumption = options?.sourceWalletCpfpAssumption ?? DEFAULT_CPFP_ASSUMPTION;

        const createResult = this._create(recipient, amountData, lps, {
            ...options,
            sourceWalletUtxos: validatedUtxos,
            sourceWalletCpfpAssumption: resolvedCpfpAssumption,
            sourceWalletAddressType
        }, additionalParams, abortSignal);

        return createResult.map(createResult => ({
            intermediary: createResult.intermediary,
            quote: createResult.result.then(async({quote, utxoSelection}) => {
                await quote._setSwapModeIntermediateWallet({
                    walletAddressType: sourceWalletAddressType,
                    selectedExistingUtxos: utxoSelection!.selectedUtxos as BitcoinWalletUtxo[],
                    requiredDeposit: utxoSelection!.additionalInputAmount==null ? undefined : {
                        ...receiveWalletAddressInfo,
                        amount: utxoSelection!.additionalInputAmount,
                        cpfpAssumptions: resolvedCpfpAssumption
                    },
                    changeAmount: utxoSelection!.changeOutputAmount,
                    feeRate: quote.minimumBtcFeeRate,
                    totalNetworkFee: utxoSelection!.totalNetworkFee
                });
                return quote;
            })
        }))
    }

    /**
     * Returns a newly created Bitcoin -> Smart chain swap using the SPV vault (UTXO-controlled vault) swap protocol,
     *  with the passed amount. Also allows specifying additional "gas drop" native token that the receipient receives
     *  on the destination chain in the `options` argument.
     *
     * @param recipient Recipient address on the destination smart chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    public create(
        recipient: string,
        amountData: { amount?: bigint, token: string, exactIn: boolean },
        lps: Intermediary[],
        options?: SpvFromBTCOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): {
        quote: Promise<SpvFromBTCSwap<T>>,
        intermediary: Intermediary
    }[] {
        return this._create(recipient, amountData, lps, options, additionalParams, abortSignal).map(response => ({
            intermediary: response.intermediary,
            quote: response.result.then(result => result.quote),
        }));
    }

    /**
     * Recovers an SPV vault (UTXO-controlled vault) based swap from smart chain on-chain data
     *
     * @param state State of the spv vault withdrawal recovered from on-chain data
     * @param vault SPV vault processing the swap
     * @param lp Intermediary (LP) used as a counterparty for the swap
     */
    public async recoverFromState(state: SpvWithdrawalClaimedState | SpvWithdrawalFrontedState, contractVersion: string, vault?: SpvVaultData | null, lp?: Intermediary): Promise<SpvFromBTCSwap<T> | null> {
        //Get the vault
        vault ??= await this._contract(contractVersion).getVaultData(state.owner, state.vaultId);
        if(vault==null) return null;
        if(state.btcTxId==null) return null;
        const btcTx = await this._btcRpc.getTransaction(state.btcTxId);
        if(btcTx==null) return null;
        const withdrawalData = await this._contract(contractVersion).getWithdrawalData(btcTx)
            .catch(e => {
                this.logger.warn(`Error parsing withdrawal data for tx ${btcTx.txid}: `, e);
                return null;
            });
        if(withdrawalData==null) return null;

        const vaultTokens = vault.getTokenData();
        const withdrawalDataOutputs = withdrawalData.getTotalOutput();

        const txBlock = await state.getTxBlock?.();

        const swapInit: SpvFromBTCSwapInit = {
            pricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100_000_000_000_000n,
                realPriceUSatPerToken: 100_000_000_000_000n,
                differencePPM: 0n,
                feePPM: 0n,
            },
            url: lp?.url,
            expiry: 0,
            swapFee: 0n,
            swapFeeBtc: 0n,
            exactIn: true,

            //Use bitcoin tx id as quote id, even though this is not strictly correct as this
            // is an off-chain identifier presented by the LP that cannot be recovered from on-chain
            // data
            quoteId: btcTx.txid,

            recipient: state.recipient,

            vaultOwner: state.owner,
            vaultId: state.vaultId,
            vaultRequiredConfirmations: vault.getConfirmations(),
            vaultTokenMultipliers: vault.getTokenData().map(val => val.multiplier),
            vaultBtcAddress: fromOutputScript(this._options.bitcoinNetwork, withdrawalData.getNewVaultScript().toString("hex")),
            vaultUtxo: withdrawalData.getSpentVaultUtxo(),
            vaultUtxoValue: BigInt(withdrawalData.getNewVaultBtcAmount()),

            btcDestinationAddress: fromOutputScript(this._options.bitcoinNetwork, btcTx.outs[2].scriptPubKey.hex),
            btcAmount: BigInt(btcTx.outs[2].value),
            btcAmountSwap: BigInt(btcTx.outs[2].value),
            btcAmountGas: 0n,
            minimumBtcFeeRate: 0,

            outputTotalSwap: withdrawalDataOutputs[0] * vaultTokens[0].multiplier,
            outputSwapToken: vaultTokens[0].token,
            outputTotalGas: withdrawalDataOutputs[1] * vaultTokens[1].multiplier,
            outputGasToken: vaultTokens[1].token,
            gasSwapFeeBtc: 0n,
            gasSwapFee: 0n,
            gasPricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100_000_000_000_000n,
                realPriceUSatPerToken: 100_000_000_000_000n,
                differencePPM: 0n,
                feePPM: 0n,
            },

            callerFeeShare: withdrawalData.callerFeeRate,
            frontingFeeShare: withdrawalData.frontingFeeRate,
            executionFeeShare: withdrawalData.executionFeeRate,

            genesisSmartChainBlockHeight: txBlock?.blockHeight ?? 0,

            contractVersion
        };
        const quote = new SpvFromBTCSwap<T>(this, swapInit);
        quote._data = withdrawalData;
        if(txBlock!=null) {
            quote.createdAt = txBlock.blockTime*1000;
        } else if(btcTx.blockhash==null) {
            quote.createdAt = Date.now();
        } else {
            const blockHeader = await this._btcRpc.getBlockHeader(btcTx.blockhash);
            quote.createdAt = blockHeader==null ? Date.now() : blockHeader.getTimestamp()*1000;
        }
        quote._setInitiated();
        if(btcTx.inputAddresses!=null) quote._senderAddress = btcTx.inputAddresses[1];
        if(state.type===SpvWithdrawalStateType.FRONTED) {
            quote._frontTxId = state.txId;
            quote._state = SpvFromBTCSwapState.FRONTED;
        } else {
            quote._claimTxId = state.txId;
            quote._state = SpvFromBTCSwapState.CLAIMED;
        }
        await quote._save();
        return quote;
    }

    /**
     * Returns a random dummy PSBT that can be used for fee estimation, the last output (the LP output) is omitted
     *  to allow for coinselection algorithm to determine maximum sendable amount there
     *
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    public getDummySwapPsbt(includeGasToken = false): Transaction {
        //Construct dummy swap psbt
        const psbt = new Transaction({
            allowUnknownInputs: true,
            allowLegacyWitnessUtxo: true,
            allowUnknownOutputs: true
        });

        const randomVaultOutScript = getDummyOutputScript(REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE);

        psbt.addInput({
            txid: randomBytes(32),
            index: 0,
            witnessUtxo: {
                script: randomVaultOutScript,
                amount: 600n
            }
        });

        psbt.addOutput({
            script: randomVaultOutScript,
            amount: 600n
        });

        let longestOpReturnData: Buffer | undefined = undefined;
        for(let contractVersion in this.versionedContracts) {
            if(this.versionedContracts[contractVersion].spvVaultContract==null) continue;
            const opReturnData = this._contract(contractVersion).toOpReturnData(
                this._chain.randomAddress(),
                includeGasToken ? [0xFFFFFFFFFFFFFFFFn, 0xFFFFFFFFFFFFFFFFn] : [0xFFFFFFFFFFFFFFFFn]
            );
            if(longestOpReturnData==null || longestOpReturnData.length < opReturnData.length) longestOpReturnData = opReturnData;
        }
        if(longestOpReturnData==null) throw new Error(`No contract version supporting the Spv Vault BTC -> ${this.chainIdentifier} swaps found!`);

        psbt.addOutput({
            script: Buffer.concat([
                longestOpReturnData.length <= 75 ? Buffer.from([0x6a, longestOpReturnData.length]) : Buffer.from([0x6a, 0x4c, longestOpReturnData.length]),
                longestOpReturnData
            ]),
            amount: 0n
        });

        return psbt;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected async _checkPastSwaps(pastSwaps: SpvFromBTCSwap<T>[]): Promise<{
        changedSwaps: SpvFromBTCSwap<T>[];
        removeSwaps: SpvFromBTCSwap<T>[]
    }> {
        const changedSwaps: Set<SpvFromBTCSwap<T>> = new Set();
        const removeSwaps: SpvFromBTCSwap<T>[] = [];

        const broadcastedOrConfirmedSwaps: {[version: string]: (SpvFromBTCSwap<T> & {_data: T["SpvVaultWithdrawalData"]})[]} = {};

        for(let pastSwap of pastSwaps) {
            let changed: boolean = false;

            if(
                pastSwap._state===SpvFromBTCSwapState.SIGNED ||
                pastSwap._state===SpvFromBTCSwapState.POSTED ||
                pastSwap._state===SpvFromBTCSwapState.BROADCASTED ||
                pastSwap._state===SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED ||
                pastSwap._state===SpvFromBTCSwapState.DECLINED ||
                pastSwap._state===SpvFromBTCSwapState.BTC_TX_CONFIRMED
            ) {
                //Check BTC transaction
                if(await pastSwap._syncStateFromBitcoin(false)) changed ||= true;
            }

            if(
                pastSwap._state===SpvFromBTCSwapState.CREATED ||
                pastSwap._state===SpvFromBTCSwapState.SIGNED ||
                pastSwap._state===SpvFromBTCSwapState.POSTED
            ) {
                if(await pastSwap._verifyQuoteDefinitelyExpired()) {
                    if(pastSwap._state===SpvFromBTCSwapState.CREATED) {
                        pastSwap._state = SpvFromBTCSwapState.QUOTE_EXPIRED;
                    } else {
                        pastSwap._state = SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED;
                    }
                    changed ||= true;
                }
            }

            if(pastSwap.isQuoteExpired()) {
                removeSwaps.push(pastSwap);
                continue;
            }
            if(changed) changedSwaps.add(pastSwap);

            if(pastSwap._state===SpvFromBTCSwapState.BROADCASTED || pastSwap._state===SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
                if(pastSwap._data!=null) (broadcastedOrConfirmedSwaps[pastSwap._contractVersion ?? "v1"] ??= []).push(pastSwap as (SpvFromBTCSwap<T> & {_data: T["SpvVaultWithdrawalData"]}));
            }
        }

        for(let contractVersion in broadcastedOrConfirmedSwaps) {
            if(this.versionedContracts[contractVersion]==null) {
                this.logger.warn(`_checkPastSwaps(): No contract was found for ${this.chainIdentifier} version ${contractVersion}! Skipping these swaps!`);
                continue;
            }

            const _broadcastedOrConfirmedSwaps = broadcastedOrConfirmedSwaps[contractVersion];

            const checkWithdrawalStateSwaps: (SpvFromBTCSwap<T> & {_data: T["SpvVaultWithdrawalData"]})[] = [];
            const _fronts = await this._contract(contractVersion).getFronterAddresses(_broadcastedOrConfirmedSwaps.map(val => ({
                ...val.getSpvVaultData(),
                withdrawal: val._data!
            })));
            const _vaultUtxos = await this._contract(contractVersion).getVaultLatestUtxos(_broadcastedOrConfirmedSwaps.map(val => val.getSpvVaultData()));
            for(const pastSwap of _broadcastedOrConfirmedSwaps) {
                const fronterAddress = _fronts[pastSwap._data.getTxId()];
                const vault = pastSwap.getSpvVaultData();
                const latestVaultUtxo = _vaultUtxos[vault.owner]?.[vault.vaultId.toString(10)];
                if(fronterAddress===undefined) this.logger.warn(`_checkPastSwaps(): No fronter address returned for ${pastSwap._data.getTxId()}`);
                if(latestVaultUtxo===undefined) this.logger.warn(`_checkPastSwaps(): No last vault utxo returned for ${pastSwap._data.getTxId()}`);
                if(await pastSwap._shouldCheckWithdrawalState(fronterAddress, latestVaultUtxo)) checkWithdrawalStateSwaps.push(pastSwap);
            }

            const withdrawalStates = await this._contract(contractVersion).getWithdrawalStates(
                checkWithdrawalStateSwaps.map(val => ({
                    withdrawal: val._data,
                    scStartBlockheight: val._genesisSmartChainBlockHeight
                }))
            );
            for(const pastSwap of checkWithdrawalStateSwaps) {
                const status = withdrawalStates[pastSwap._data.getTxId()];
                if(status==null) {
                    this.logger.warn(`_checkPastSwaps(): No withdrawal state returned for ${pastSwap._data.getTxId()}`);
                    continue;
                }
                this.logger.debug("syncStateFromChain(): status of "+pastSwap._data.btcTx.txid, status?.type);
                let changed = false;
                switch(status.type) {
                    case SpvWithdrawalStateType.FRONTED:
                        pastSwap._frontTxId = status.txId;
                        pastSwap._state = SpvFromBTCSwapState.FRONTED;
                        changed ||= true;
                        break;
                    case SpvWithdrawalStateType.CLAIMED:
                        pastSwap._claimTxId = status.txId;
                        pastSwap._state = SpvFromBTCSwapState.CLAIMED;
                        changed ||= true;
                        break;
                    case SpvWithdrawalStateType.CLOSED:
                        pastSwap._state = SpvFromBTCSwapState.CLOSED;
                        changed ||= true;
                        break;
                }
                if(changed) changedSwaps.add(pastSwap);
            }
        }

        return {
            changedSwaps: Array.from(changedSwaps),
            removeSwaps
        };
    }

}
