/// <reference types="node" />
import { IFromBTCWrapper } from "../IFromBTCWrapper";
import { FromBTCSwap, FromBTCSwapState } from "./FromBTCSwap";
import { ChainType, ClaimEvent, InitializeEvent, RefundEvent, RelaySynchronizer, SwapData, BtcRelay, BitcoinRpcWithAddressIndex, SwapCommitState } from "@atomiqlabs/base";
import { EventEmitter } from "events";
import { Intermediary } from "../../../../intermediaries/Intermediary";
import { ISwapPrice } from "../../../../prices/abstract/ISwapPrice";
import { ISwapWrapperOptions, WrapperCtorTokens } from "../../../ISwapWrapper";
import { SwapType } from "../../../../enums/SwapType";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { UnifiedSwapEventListener } from "../../../../events/UnifiedSwapEventListener";
import { UnifiedSwapStorage } from "../../../../storage/UnifiedSwapStorage";
import { ISwap } from "../../../ISwap";
import { IClaimableSwapWrapper } from "../../../IClaimableSwapWrapper";
import { IFromBTCSelfInitDefinition } from "../IFromBTCSelfInitSwap";
import { AmountData } from "../../../../types/AmountData";
import { AllOptional } from "../../../../utils/TypeUtils";
export type FromBTCOptions = {
    feeSafetyFactor?: bigint;
    blockSafetyFactor?: number;
    unsafeZeroWatchtowerFee?: boolean;
};
export type FromBTCWrapperOptions = ISwapWrapperOptions & {
    safetyFactor: number;
    blocksTillTxConfirms: number;
    maxConfirmations: number;
    minSendWindow: number;
    bitcoinNetwork: BTC_NETWORK;
    bitcoinBlocktime: number;
};
export type FromBTCDefinition<T extends ChainType> = IFromBTCSelfInitDefinition<T, FromBTCWrapper<T>, FromBTCSwap<T>>;
/**
 * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation
 *  of the swap escrow on the destination chain.
 *
 * @category Swaps
 */
export declare class FromBTCWrapper<T extends ChainType> extends IFromBTCWrapper<T, FromBTCDefinition<T>, FromBTCWrapperOptions> implements IClaimableSwapWrapper<FromBTCSwap<T>> {
    readonly TYPE: SwapType.FROM_BTC;
    /**
     * @internal
     */
    protected readonly tickSwapState: FromBTCSwapState[];
    /**
     * @internal
     */
    readonly _pendingSwapStates: FromBTCSwapState[];
    /**
     * @internal
     */
    readonly _claimableSwapStates: FromBTCSwapState[];
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof FromBTCSwap;
    /**
     * @internal
     */
    readonly _synchronizer: RelaySynchronizer<any, T["TX"], any>;
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpcWithAddressIndex<any>;
    private readonly btcRelay;
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Pricing to use
     * @param tokens
     * @param swapDataDeserializer Deserializer for SwapData
     * @param btcRelay
     * @param synchronizer Btc relay synchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], contract: T["Contract"], prices: ISwapPrice, tokens: WrapperCtorTokens, swapDataDeserializer: new (data: any) => T["Data"], btcRelay: BtcRelay<any, T["TX"], any>, synchronizer: RelaySynchronizer<any, T["TX"], any>, btcRpc: BitcoinRpcWithAddressIndex<any>, options?: AllOptional<FromBTCWrapperOptions>, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * @inheritDoc
     * @internal
     */
    protected processEventInitialize(swap: FromBTCSwap<T>, event: InitializeEvent<T["Data"]>): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    protected processEventClaim(swap: FromBTCSwap<T>, event: ClaimEvent<T["Data"]>): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    protected processEventRefund(swap: FromBTCSwap<T>, event: RefundEvent<T["Data"]>): Promise<boolean>;
    /**
     * Returns the swap expiry, leaving enough time for the user to send a transaction and for it to confirm
     *
     * @param data Swap data
     * @param requiredConfirmations Confirmations required on the bitcoin side to settle the swap
     *
     * @internal
     */
    _getOnchainSendTimeout(data: SwapData, requiredConfirmations: number): bigint;
    /**
     * Pre-fetches claimer (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param signer Smartchain signer address initiating the swap
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     *
     * @private
     */
    private preFetchClaimerBounty;
    /**
     * Returns calculated claimer bounty calculated from the claimer bounty data as fetched from preFetchClaimerBounty()
     *
     * @param data Parsed swap data returned from the intermediary
     * @param options Options as passed to the swap creation function
     * @param claimerBounty Claimer bounty data as fetched from {@link preFetchClaimerBounty} function
     *
     * @private
     */
    private getClaimerBounty;
    /**
     * Verifies response returned from intermediary
     *
     * @param signer
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param data Parsed swap data returned by the intermediary
     * @param sequence Required swap sequence
     * @param claimerBounty Claimer bount data as returned from the preFetchClaimerBounty() pre-fetch promise
     * @param depositToken
     *
     * @throws {IntermediaryError} in case the response is invalid
     *
     * @private
     */
    private verifyReturnedData;
    /**
     * Returns a newly created legacy Bitcoin -> Smart chain swap using the PrTLC based escrow swap protocol,
     *  with the passed amount.
     *
     * @param recipient Smart chain signer's address on the destination chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    create(recipient: string, amountData: AmountData, lps: Intermediary[], options?: FromBTCOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): {
        quote: Promise<FromBTCSwap<T>>;
        intermediary: Intermediary;
    }[];
    /**
     * @inheritDoc
     */
    recoverFromSwapDataAndState(init: {
        data: T["Data"];
        getInitTxId: () => Promise<string>;
        getTxBlock: () => Promise<{
            blockTime: number;
            blockHeight: number;
        }>;
    }, state: SwapCommitState, lp?: Intermediary): Promise<FromBTCSwap<T> | null>;
}
