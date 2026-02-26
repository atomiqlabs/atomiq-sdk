/// <reference types="node" />
import { ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens } from "../ISwapWrapper";
import { BitcoinRpcWithAddressIndex, BtcBlock, BtcRelay, ChainEvent, ChainType, RelaySynchronizer, SpvVaultData, SpvWithdrawalClaimedState, SpvWithdrawalFrontedState } from "@atomiqlabs/base";
import { SpvFromBTCSwap, SpvFromBTCSwapState } from "./SpvFromBTCSwap";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { SwapType } from "../../enums/SwapType";
import { UnifiedSwapStorage } from "../../storage/UnifiedSwapStorage";
import { UnifiedSwapEventListener } from "../../events/UnifiedSwapEventListener";
import { ISwapPrice } from "../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { Intermediary } from "../../intermediaries/Intermediary";
import { CoinselectAddressTypes } from "../../bitcoin/coinselect2";
import { Transaction } from "@scure/btc-signer";
import { ISwap } from "../ISwap";
import { IClaimableSwapWrapper } from "../IClaimableSwapWrapper";
import { AmountData } from "../../types/AmountData";
import { AllOptional } from "../../utils/TypeUtils";
export type SpvFromBTCOptions = {
    gasAmount?: bigint;
    unsafeZeroWatchtowerFee?: boolean;
    feeSafetyFactor?: number;
    maxAllowedNetworkFeeRate?: number;
    walletMnemonic?: string;
};
export type SpvFromBTCCreateAmountData = Omit<AmountData, "amount"> & {
    amount?: bigint;
};
export type SpvFromBTCWrapperOptions = ISwapWrapperOptions & {
    maxConfirmations: number;
    bitcoinNetwork: BTC_NETWORK;
    bitcoinBlocktime: number;
    maxTransactionsDelta: number;
    maxRawAmountAdjustmentDifferencePPM: number;
    maxBtcFeeMultiplier: number;
    maxBtcFeeOffset: number;
};
export type SpvFromBTCTypeDefinition<T extends ChainType> = SwapTypeDefinition<T, SpvFromBTCWrapper<T>, SpvFromBTCSwap<T>>;
export declare const REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE: CoinselectAddressTypes;
export declare const REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE: CoinselectAddressTypes;
/**
 * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring
 *  any initiation on the destination chain, and with the added possibility for the user to receive
 *  a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
export declare class SpvFromBTCWrapper<T extends ChainType> extends ISwapWrapper<T, SpvFromBTCTypeDefinition<T>, SpvFromBTCWrapperOptions> implements IClaimableSwapWrapper<SpvFromBTCSwap<T>> {
    readonly TYPE: SwapType.SPV_VAULT_FROM_BTC;
    /**
     * @internal
     */
    readonly _claimableSwapStates: SpvFromBTCSwapState[];
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof SpvFromBTCSwap;
    /**
     * @internal
     */
    protected readonly btcRelay: T["BtcRelay"];
    /**
     * @internal
     */
    protected readonly tickSwapState: Array<SpvFromBTCSwap<T>["_state"]>;
    /**
     * @internal
     */
    readonly _synchronizer: RelaySynchronizer<any, T["TX"], any>;
    /**
     * @internal
     */
    readonly _contract: T["SpvVaultContract"];
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpcWithAddressIndex<BtcBlock>;
    /**
     * @internal
     */
    readonly _spvWithdrawalDataDeserializer: new (data: any) => T["SpvVaultWithdrawalData"];
    /**
     * @internal
     */
    readonly _pendingSwapStates: Array<SpvFromBTCSwap<T>["_state"]>;
    private swapWalletsLastCheckedAt?;
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Pricing to use
     * @param tokens
     * @param spvWithdrawalDataDeserializer Deserializer for SpvVaultWithdrawalData
     * @param btcRelay
     * @param synchronizer Btc relay synchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], contract: T["SpvVaultContract"], prices: ISwapPrice, tokens: WrapperCtorTokens, spvWithdrawalDataDeserializer: new (data: any) => T["SpvVaultWithdrawalData"], btcRelay: BtcRelay<any, T["TX"], any>, synchronizer: RelaySynchronizer<any, T["TX"], any>, btcRpc: BitcoinRpcWithAddressIndex<any>, options?: AllOptional<SpvFromBTCWrapperOptions>, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    private processEventFront;
    private processEventClaim;
    private processEventClose;
    /**
     * @inheritDoc
     * @internal
     */
    protected processEvent(event: ChainEvent<T["Data"]>, swap: SpvFromBTCSwap<T>): Promise<void>;
    /**
     * Pre-fetches latest finalized block height of the smart chain
     *
     * @param abortController
     * @private
     */
    private preFetchFinalizedBlockHeight;
    /**
     * Pre-fetches caller (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     * @private
     */
    private preFetchCallerFeeInNativeToken;
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
    private computeCallerFeeShare;
    /**
     * Verifies response returned from intermediary
     *
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param callerFeeShare
     * @param bitcoinFeeRatePromise Maximum accepted fee rate from the LPs
     * @param abortSignal
     * @private
     * @throws {IntermediaryError} in case the response is invalid
     */
    private verifyReturnedData;
    private amountPrefetch;
    private mnemonicToWalletAndWIF;
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
    create(recipient: string, amountData: {
        token: string;
        exactIn: boolean;
        amount?: bigint;
    }, lps: Intermediary[], options?: SpvFromBTCOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): Promise<{
        quote: Promise<SpvFromBTCSwap<T>>;
        intermediary: Intermediary;
    }[]>;
    /**
     * Recovers an SPV vault (UTXO-controlled vault) based swap from smart chain on-chain data
     *
     * @param state State of the spv vault withdrawal recovered from on-chain data
     * @param vault SPV vault processing the swap
     * @param lp Intermediary (LP) used as a counterparty for the swap
     */
    recoverFromState(state: SpvWithdrawalClaimedState | SpvWithdrawalFrontedState, vault?: SpvVaultData | null, lp?: Intermediary): Promise<SpvFromBTCSwap<T> | null>;
    /**
     * Returns a random dummy PSBT that can be used for fee estimation, the last output (the LP output) is omitted
     *  to allow for coinselection algorithm to determine maximum sendable amount there
     *
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    getDummySwapPsbt(includeGasToken?: boolean): Transaction;
    /**
     * Returns the expected bitcoin transaction fee considering a single wallet input is used
     *
     * @param bitcoinAddress A wallet address for which to estimate the fee
     * @param bitcoinFeeRate Bitcoin fee rate in sats/vB
     * @param includeGasToken Whether to also include a gas drop in the calculation
     */
    getExpectedNetworkFee(bitcoinAddress: string, bitcoinFeeRate: number, includeGasToken?: boolean): bigint;
    private checkSwapWalletSwaps;
    /**
     * @inheritDoc
     * @internal
     */
    protected _tick(swaps: SpvFromBTCSwap<T>[]): Promise<void>;
    /**
     * @inheritDoc
     * @internal
     */
    protected _checkPastSwaps(pastSwaps: SpvFromBTCSwap<T>[]): Promise<{
        changedSwaps: SpvFromBTCSwap<T>[];
        removeSwaps: SpvFromBTCSwap<T>[];
    }>;
}
