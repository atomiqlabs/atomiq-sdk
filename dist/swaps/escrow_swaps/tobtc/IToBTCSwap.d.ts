import { IToBTCDefinition, IToBTCWrapper } from "./IToBTCWrapper";
import { ChainType, SignatureData, SwapCommitState, SwapData } from "@atomiqlabs/base";
import { RefundAuthorizationResponse } from "../../../intermediaries/apis/IntermediaryAPI";
import { Fee } from "../../../types/fees/Fee";
import { IEscrowSelfInitSwap, IEscrowSelfInitSwapInit } from "../IEscrowSelfInitSwap";
import { IRefundableSwap } from "../../IRefundableSwap";
import { FeeType } from "../../../enums/FeeType";
import { TokenAmount } from "../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../types/Token";
import { SwapExecutionAction, SwapExecutionActionCommit } from "../../../types/SwapExecutionAction";
export type IToBTCSwapInit<T extends SwapData> = IEscrowSelfInitSwapInit<T> & {
    signatureData?: SignatureData;
    data: T;
    networkFee: bigint;
    networkFeeBtc: bigint;
};
export declare function isIToBTCSwapInit<T extends SwapData>(obj: any): obj is IToBTCSwapInit<T>;
/**
 * State enum for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare enum ToBTCSwapState {
    /**
     * Intermediary (LP) was unable to process the swap and the funds were refunded on the
     *  source chain
     */
    REFUNDED = -3,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -2,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -1,
    /**
     * Swap was created, use the {@link IToBTCSwap.commit} or {@link IToBTCSwap.txsCommit} to
     *  initiate it by creating the swap escrow on the source chain
     */
    CREATED = 0,
    /**
     * Swap escrow was initiated (committed) on the source chain, the intermediary (LP) will
     *  now process the swap. You can wait till that happens with the {@link IToBTCSwap.waitForPayment}
     *  function.
     */
    COMMITED = 1,
    /**
     * The intermediary (LP) has processed the transaction and sent out the funds on the destination chain,
     *  but hasn't yet settled the escrow on the source chain.
     */
    SOFT_CLAIMED = 2,
    /**
     * Swap was successfully settled by the intermediary (LP) on the source chain
     */
    CLAIMED = 3,
    /**
     * Intermediary (LP) was unable to process the swap and the swap escrow on the source chain
     *  is refundable, call {@link IToBTCSwap.refund} or {@link IToBTCSwap.txsRefund} to refund
     */
    REFUNDABLE = 4
}
/**
 * Base class for escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare abstract class IToBTCSwap<T extends ChainType = ChainType, D extends IToBTCDefinition<T, IToBTCWrapper<T, D>, IToBTCSwap<T, D>> = IToBTCDefinition<T, IToBTCWrapper<T, any>, IToBTCSwap<T, any>>> extends IEscrowSelfInitSwap<T, D, ToBTCSwapState> implements IRefundableSwap<T, D, ToBTCSwapState> {
    /**
     * @internal
     */
    protected readonly swapStateDescription: {
        [-3]: string;
        [-2]: string;
        [-1]: string;
        0: string;
        1: string;
        2: string;
        3: string;
        4: string;
    };
    /**
     * @internal
     */
    protected readonly swapStateName: (state: number) => string;
    /**
     * @internal
     */
    protected readonly abstract outputToken: BtcToken;
    /**
     * @internal
     */
    protected readonly networkFee: bigint;
    /**
     * @internal
     */
    protected networkFeeBtc: bigint;
    /**
     * @internal
     */
    readonly _data: T["Data"];
    protected constructor(wrapper: D["Wrapper"], serializedObject: any);
    protected constructor(wrapper: D["Wrapper"], init: IToBTCSwapInit<T["Data"]>);
    /**
     * @inheritDoc
     * @internal
     */
    protected getSwapData(): T["Data"];
    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion(): void;
    /**
     * @inheritDoc
     * @internal
     */
    protected tryRecomputeSwapPrice(): void;
    /**
     * Returns the payment hash identifier to be sent to the LP for getStatus and getRefund
     * @internal
     */
    protected getLpIdentifier(): string;
    /**
     * Sets the payment result for the swap, optionally also checking it (checking that tx exist or swap secret is valid)
     *
     * @param result Result returned by the LP
     * @param check Whether to check the passed result
     * @returns true if check passed, false if check failed with a soft error (e.g. tx not yet found in the mempool)
     * @throws {IntermediaryError} When the data returned by the intermediary isn't valid
     *
     * @internal
     */
    abstract _setPaymentResult(result: {
        secret?: string;
        txId?: string;
    }, check?: boolean): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getInputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getInputTxId(): string | null;
    /**
     * @inheritDoc
     */
    requiresAction(): boolean;
    /**
     * @inheritDoc
     */
    isFinished(): boolean;
    /**
     * @inheritDoc
     */
    isRefundable(): boolean;
    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean;
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean;
    /**
     * @inheritDoc
     */
    isSuccessful(): boolean;
    /**
     * @inheritDoc
     */
    isFailed(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string;
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>;
    /**
     * Returns network fee for on the destination chain for the swap
     *
     * @internal
     */
    protected getNetworkFee(): Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>;
    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>;
    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [
        {
            type: FeeType.SWAP;
            fee: Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>;
        },
        {
            type: FeeType.NETWORK_OUTPUT;
            fee: Fee<T["ChainId"], SCToken<T["ChainId"]>, BtcToken>;
        }
    ];
    /**
     * @inheritDoc
     */
    getInputToken(): SCToken<T["ChainId"]>;
    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<SCToken<T["ChainId"]>, true>;
    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<SCToken<T["ChainId"]>, true>;
    /**
     * Checks if the initiator/sender on the source chain has enough balance to go through with the swap
     */
    hasEnoughBalance(): Promise<{
        enoughBalance: boolean;
        balance: TokenAmount<SCToken<T["ChainId"]>, true>;
        required: TokenAmount<SCToken<T["ChainId"]>, true>;
    }>;
    /**
     * Checks if the initiator/sender on the source chain has enough native token balance
     *  to cover the transaction fee of initiating the swap
     */
    hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean;
        balance: TokenAmount<SCToken<T["ChainId"]>, true>;
        required: TokenAmount<SCToken<T["ChainId"]>, true>;
    }>;
    /**
     * Executes the swap with the provided smart chain wallet/signer
     *
     * @param signer Smart chain wallet/signer to use to sign the transaction on the source chain
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether the swap was successfully processed by the LP, in case `false` is returned
     *  the user can refund their funds back on the source chain by calling {@link refund}
     */
    execute(signer: T["Signer"] | T["NativeSigner"], callbacks?: {
        onSourceTransactionSent?: (sourceTxId: string) => void;
        onSourceTransactionConfirmed?: (sourceTxId: string) => void;
        onSwapSettled?: (destinationTxId: string) => void;
    }, options?: {
        abortSignal?: AbortSignal;
        paymentCheckIntervalSeconds?: number;
        maxWaitTillSwapProcessedSeconds?: number;
    }): Promise<boolean>;
    /**
     * @inheritDoc
     *
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     */
    txsExecute(options?: {
        skipChecks?: boolean;
    }): Promise<[
        SwapExecutionActionCommit<T>
    ]>;
    /**
     * @inheritDoc
     *
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     * @param options.refundSmartChainSigner Optional smart chain signer to use when creating refunds transactions
     */
    getCurrentActions(options?: {
        skipChecks?: boolean;
        refundSmartChainSigner?: string | T["Signer"] | T["NativeSigner"];
    }): Promise<SwapExecutionAction<T>[]>;
    /**
     * @inheritDoc
     *
     * @throws {Error} When in invalid state (not {@link ToBTCSwapState.CREATED})
     */
    txsCommit(skipChecks?: boolean): Promise<T["TX"][]>;
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    commit(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean, onBeforeTxSent?: (txId: string) => void): Promise<string>;
    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is not in the correct state (must be {@link ToBTCSwapState.CREATED})
     */
    waitTillCommited(abortSignal?: AbortSignal): Promise<void>;
    /**
     * Waits till the swap is processed by the intermediary (LP)
     *
     * @param checkIntervalSeconds How often to poll the intermediary for status (5 seconds default)
     * @param abortSignal Abort signal
     * @internal
     */
    protected waitTillIntermediarySwapProcessed(checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<RefundAuthorizationResponse>;
    /**
     * Checks whether the swap was already processed by the LP and is either successful (requires proof which is
     *  either a HTLC pre-image for LN swaps or valid txId for on-chain swap) or failed and we can cooperatively
     *  refund.
     *
     * @param save whether to save the data
     * @returns `true` if swap is processed, `false` if the swap is still ongoing
     *
     * @internal
     */
    protected checkIntermediarySwapProcessed(save?: boolean): Promise<boolean>;
    /**
     * A blocking promise resolving when swap was concluded by the intermediary (LP),
     *  rejecting in case of failure
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled, an error is thrown if the
     *  swap is taking too long to claim
     * @param checkIntervalSeconds How often to poll the intermediary for answer
     * @param abortSignal Abort signal
     * @returns `true` if swap was successful, `false` if swap failed and we can refund
     *
     * @throws {IntermediaryError} If a swap is determined expired by the intermediary, but it is actually still valid
     * @throws {SignatureVerificationError} If the swap should be cooperatively refundable but the intermediary returned
     *  invalid refund signature
     * @throws {Error} When swap expires or if the swap has invalid state (must be {@link ToBTCSwapState.COMMITED})
     */
    waitForPayment(maxWaitTimeSeconds?: number, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * Get the estimated smart chain transaction fee of the refund transaction
     */
    getRefundNetworkFee(): Promise<TokenAmount<SCToken<T["ChainId"]>, true>>;
    /**
     * @inheritDoc
     *
     * @throws {IntermediaryError} If intermediary returns invalid response in case cooperative refund should be used
     * @throws {SignatureVerificationError} If intermediary returned invalid cooperative refund signature
     * @throws {Error} When state is not refundable
     */
    txsRefund(_signer?: string | T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    refund(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
    /**
     * @inheritDoc
     *
     * @throws {Error} When swap is not in a valid state (must be {@link ToBTCSwapState.COMMITED} or
     *  {@link ToBTCSwapState.REFUNDABLE})
     * @throws {Error} If we tried to refund but claimer was able to claim first
     */
    waitTillRefunded(abortSignal?: AbortSignal): Promise<void>;
    /**
     * @inheritDoc
     */
    serialize(): any;
    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     *
     * @private
     */
    private syncStateFromChain;
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _forciblySetOnchainState(commitStatus: SwapCommitState): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _tick(save?: boolean): Promise<boolean>;
}
