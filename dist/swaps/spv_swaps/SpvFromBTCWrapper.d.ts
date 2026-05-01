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
import { Transaction } from "@scure/btc-signer";
import { ISwap } from "../ISwap";
import { IClaimableSwapWrapper } from "../IClaimableSwapWrapper";
import { AmountData } from "../../types/AmountData";
import { AllOptional } from "../../utils/TypeUtils";
export type SpvFromBTCOptions = {
    /**
     * Optional additional native token to receive as an output of the swap (e.g. STRK on Starknet or cBTC on Citrea).
     *
     * When passed as a `bigint` it is specified in base units of the token and in `string` it is the human readable
     *  decimal format.
     */
    gasAmount?: bigint | string;
    /**
     * The LP enforces a minimum bitcoin fee rate in sats/vB for the swap transaction. With this config you can optionally
     *  limit how high of a minimum fee rate would you accept.
     *
     * By default the maximum allowed fee rate is calculated dynamically based on current bitcoin fee rate as:
     *
     * `maxAllowedBitcoinFeeRate` = 10 + `currentBitcoinFeeRate` * 1.5
     */
    maxAllowedBitcoinFeeRate?: number;
    /**
     * A flag to attach 0 watchtower fee to the swap, this would make the settlement unattractive for the watchtowers
     *  and therefore automatic settlement for such swaps will not be possible, you will have to settle manually
     *  with {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} functions.
     */
    unsafeZeroWatchtowerFee?: boolean;
    /**
     * A safety factor to use when estimating the watchtower fee to attach to the swap (this has to cover the gas fee
     *  of watchtowers settling the swap). A higher multiple here would mean that a swap is more attractive for
     *  watchtowers to settle automatically.
     *
     * Uses a `1.25` multiple by default (i.e. the current network fee is multiplied by 1.25 and then used to estimate
     *  the settlement gas fee cost)
     */
    feeSafetyFactor?: number;
    /**
     * @deprecated Use `maxAllowedBitcoinFeeRate` instead!
     */
    maxAllowedNetworkFeeRate?: number;
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
    protected readonly btcRelay: (version?: string) => BtcRelay<any, T["TX"], any>;
    /**
     * @internal
     */
    protected readonly tickSwapState: Array<SpvFromBTCSwap<T>["_state"]>;
    /**
     * @internal
     */
    readonly _synchronizer: (version?: string) => RelaySynchronizer<any, T["TX"], any>;
    /**
     * @internal
     */
    readonly _contract: (version?: string) => T["SpvVaultContract"];
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpcWithAddressIndex<BtcBlock>;
    /**
     * @internal
     */
    readonly _spvWithdrawalDataDeserializer: (version?: string) => (new (data: any) => T["SpvVaultWithdrawalData"]);
    /**
     * @internal
     */
    readonly _pendingSwapStates: Array<SpvFromBTCSwap<T>["_state"]>;
    private readonly versionedContracts;
    private readonly versionedSynchronizer;
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
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], prices: ISwapPrice, tokens: WrapperCtorTokens, versionedContracts: {
        [version: string]: {
            btcRelay: BtcRelay<any, T["TX"], any>;
            spvVaultContract: T["SpvVaultContract"];
            spvVaultWithdrawalDataConstructor: new (data: any) => T["SpvVaultWithdrawalData"];
        };
    }, versionedSynchronizer: {
        [version: string]: {
            synchronizer: RelaySynchronizer<any, T["TX"], any>;
        };
    }, btcRpc: BitcoinRpcWithAddressIndex<any>, options?: AllOptional<SpvFromBTCWrapperOptions>, events?: EventEmitter<{
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
     * @param pricePrefetch
     * @param nativeTokenPricePrefetch
     * @param abortController
     * @param contractVersion
     * @private
     */
    private preFetchCallerFeeShare;
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
    create(recipient: string, amountData: AmountData, lps: Intermediary[], options?: SpvFromBTCOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): {
        quote: Promise<SpvFromBTCSwap<T>>;
        intermediary: Intermediary;
    }[];
    /**
     * Recovers an SPV vault (UTXO-controlled vault) based swap from smart chain on-chain data
     *
     * @param state State of the spv vault withdrawal recovered from on-chain data
     * @param vault SPV vault processing the swap
     * @param lp Intermediary (LP) used as a counterparty for the swap
     */
    recoverFromState(state: SpvWithdrawalClaimedState | SpvWithdrawalFrontedState, contractVersion: string, vault?: SpvVaultData | null, lp?: Intermediary): Promise<SpvFromBTCSwap<T> | null>;
    /**
     * Returns a random dummy PSBT that can be used for fee estimation, the last output (the LP output) is omitted
     *  to allow for coinselection algorithm to determine maximum sendable amount there
     *
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    getDummySwapPsbt(includeGasToken?: boolean): Transaction;
    /**
     * @inheritDoc
     * @internal
     */
    protected _checkPastSwaps(pastSwaps: SpvFromBTCSwap<T>[]): Promise<{
        changedSwaps: SpvFromBTCSwap<T>[];
        removeSwaps: SpvFromBTCSwap<T>[];
    }>;
}
