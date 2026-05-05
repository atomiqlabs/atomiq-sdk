import {ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens} from "../ISwapWrapper";
import {
    BitcoinRpcWithAddressIndex, BtcBlock,
    BtcRelay,
    ChainEvent,
    ChainType,
    RelaySynchronizer,
    SpvVaultClaimEvent,
    SpvVaultCloseEvent, SpvVaultData,
    SpvVaultFrontEvent,
    SpvVaultTokenBalance,
    SpvWithdrawalClaimedState,
    SpvWithdrawalFrontedState,
    SpvWithdrawalStateType
} from "@atomiqlabs/base";
import {SpvFromBTCSwap, SpvFromBTCSwapInit, SpvFromBTCSwapState} from "./SpvFromBTCSwap";
import {BTC_NETWORK, TEST_NETWORK} from "@scure/btc-signer/utils";
import {SwapType} from "../../enums/SwapType";
import {UnifiedSwapStorage} from "../../storage/UnifiedSwapStorage";
import {UnifiedSwapEventListener} from "../../events/UnifiedSwapEventListener";
import {ISwapPrice} from "../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {Intermediary} from "../../intermediaries/Intermediary";
import {extendAbortController, mapArrayToObject, randomBytes, throwIfUndefined} from "../../utils/Utils";
import {
    fromOutputScript,
    getDummyOutputScript,
    toCoinselectAddressType,
    toOutputScript
} from "../../utils/BitcoinUtils";
import {IntermediaryAPI, SpvFromBTCPrepareResponseType} from "../../intermediaries/apis/IntermediaryAPI";
import {OutOfBoundsError, RequestError} from "../../errors/RequestError";
import {IntermediaryError} from "../../errors/IntermediaryError";
import {CoinselectAddressTypes} from "../../bitcoin/coinselect2";
import {OutScript, Transaction} from "@scure/btc-signer";
import {ISwap} from "../ISwap";
import {IClaimableSwapWrapper} from "../IClaimableSwapWrapper";
import {AmountData} from "../../types/AmountData";
import {tryWithRetries} from "../../utils/RetryUtils";
import {AllOptional} from "../../utils/TypeUtils";
import {UserError} from "../../errors/UserError";
import {BitcoinWalletUtxo, BitcoinWalletUtxoBase, IBitcoinWallet} from "../../bitcoin/wallet/IBitcoinWallet";
import {utils} from "../../bitcoin/coinselect2/utils";
import {BitcoinWallet} from "../../bitcoin/wallet/BitcoinWallet";

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
     * A bitcoin wallet UTXOs to fully use as an input for this swap, use this option along with passing `amount` as
     *  `undefined` when you want to swap the full BTC balance of the wallet in a single swap
     */
    sourceWalletUtxos?: BitcoinWalletUtxoBase[] | Promise<BitcoinWalletUtxoBase[]>,
    /**
     * Bitcoin fee rate to use when deriving `maxAllowedBitcoinFeeRate` and when calculating the input amount based
     *  on the `sourceWalletUtxos`
     */
    bitcoinFeeRate?: Promise<number> | number,

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
        if(event instanceof SpvVaultFrontEvent) {
            swapChanged = await this.processEventFront(event, swap);
            if(event.meta?.txId!=null && swap._frontTxId!==event.meta.txId) {
                swap._frontTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(event instanceof SpvVaultClaimEvent) {
            swapChanged = await this.processEventClaim(event, swap);
            if(event.meta?.txId!=null && swap._claimTxId!==event.meta.txId) {
                swap._claimTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(event instanceof SpvVaultCloseEvent) {
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
        amountData: AmountData,
        lp: Intermediary,
        options: {
            gasAmount: bigint,
            sourceWalletUtxos?: Promise<BitcoinWalletUtxoBase[]>
        },
        callerFeeShare: bigint,
        maxBitcoinFeeRatePromise: Promise<number | undefined>,
        bitcoinFeeRatePromise: Promise<number | undefined> | undefined,
        abortSignal: AbortSignal
    ): Promise<{
        vault: T["SpvVaultData"],
        vaultUtxoValue: number
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
        let [vault, {vaultUtxoValue, btcTx}] = await Promise.all([
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
                if(amountData.exactIn) {
                    if(!resp.usedUtxoInputCalculation) {
                        //Legacy calculation
                        if(resp.btcAmount !== amountData.amount) throw new IntermediaryError("Invalid amount returned");
                    } else {
                        //Implies the raw UTXOs were passed for amount derivation
                        //Verify the derivation was done correctly
                        if(options.sourceWalletUtxos==null) throw new IntermediaryError("Invalid usedUtxoInputCalcuation return value");
                        if(bitcoinFeeRatePromise==null) throw new Error("bitcoinFeeRatePromise must be passed for UTXO-based input amount calculation checks");
                        const walletUtxos = await options.sourceWalletUtxos;
                        const bitcoinFeeRate = await throwIfUndefined(bitcoinFeeRatePromise, "Failed to fetch bitcoin fee rate!");
                        const {balance} = BitcoinWallet.getSpendableBalance(
                            walletUtxos, Math.max(resp.btcFeeRate, bitcoinFeeRate),
                            this.getDummySwapPsbt(options.gasAmount!==0n), REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE
                        );
                        if(resp.btcAmount !== balance) throw new IntermediaryError(`Invalid amount returned, expected: ${balance.toString(10)}, got: ${resp.btcAmount.toString(10)}`);
                    }
                } else {
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

                return vault;
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
            vaultUtxoValue
        };
    }

    private async amountPrefetch(
        amountData: {token: string, exactIn: boolean, amount?: bigint},
        bitcoinFeeRatePromise: Promise<number | undefined>,
        walletUtxosPromise: Promise<BitcoinWalletUtxoBase[]> | undefined,
        includeGas: boolean,
        abortController: AbortController
    ): Promise<bigint | undefined> {
        if(amountData.amount!=null) return amountData.amount;
        try {
            const bitcoinFeeRate = await throwIfUndefined(bitcoinFeeRatePromise, "Cannot fetch Bitcoin fee rate!");
            if(walletUtxosPromise==null) throw new UserError("Cannot use empty amount without passing UTXOs!");
            const walletUtxos = await walletUtxosPromise;
            if(walletUtxos.length===0)
                throw new UserError("Wallet doesn't have any BTC balance");
            const spendableBalance = await BitcoinWallet.getSpendableBalance(
                walletUtxos, bitcoinFeeRate,
                this.getDummySwapPsbt(includeGas), REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE
            );
            return spendableBalance.balance;
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
        };

        if(
            _options.gasAmount!==0n &&
            (
                this._chain.shouldGetNativeTokenDrop!=null
                    ? !this._chain.shouldGetNativeTokenDrop(amountData.token)
                    : amountData.token===this._chain.getNativeCurrencyAddress()
            )
        ) throw new UserError("Cannot specify `gasAmount` for swaps to a native token!");

        if(amountData.amount==null && options?.sourceWalletUtxos==null)
            throw new UserError("Source wallet UTXOs need to be passed when amount is null!");
        if(amountData.amount==null && !amountData.exactIn)
            throw new UserError("Amount can be null only for exactIn swaps!");
        if(amountData.amount!=null && options?.sourceWalletUtxos!=null)
            throw new UserError("Source wallet UTXOs cannot be passed while specifying an input amount!");

        const lpVersions = Intermediary.getContractVersionsForLps(this.chainIdentifier, lps);

        const _abortController = extendAbortController(abortSignal);
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
            amountData, maxBitcoinFeeRatePromise, _options.sourceWalletUtxos, _options.gasAmount!==0n, _abortController
        );

        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: tryWithRetries(async () => {
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
                                        ? _options.sourceWalletUtxos.then(utxos => {
                                            if(utxos.length===0) return undefined;
                                            return utxos.map(utxo => ({
                                                value: utxo.value,
                                                vSize: utils.inputBytes({type: utxo.type}),
                                                cpfp: utxo.cpfp==null ? undefined : {effectiveVSize: utxo.cpfp?.txVsize, effectiveFeeRate: utxo.cpfp?.txEffectiveFeeRate}
                                            }));
                                        })
                                        : undefined,
                                    amountFeeRate: bitcoinFeeRatePromise,
                                    additionalParams
                                },
                                this._options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined
                            );
                        }, undefined, e => e instanceof RequestError, abortController.signal);

                        this.logger.debug("create("+lp.url+"): LP response: ", resp)

                        const callerFeeShare = await callerFeeRatePromise;
                        const amount = await throwIfUndefined(amountPromise);

                        const [
                            pricingInfo,
                            gasPricingInfo,
                            {vault, vaultUtxoValue}
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
                                {...amountData, amount},
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
                        return quote;
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
