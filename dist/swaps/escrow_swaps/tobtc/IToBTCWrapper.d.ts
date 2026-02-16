import { IToBTCSwap, ToBTCSwapState } from "./IToBTCSwap";
import { ChainType, ClaimEvent, InitializeEvent, RefundEvent } from "@atomiqlabs/base";
import { ISwapWrapperOptions, SwapTypeDefinition } from "../../ISwapWrapper";
import { Intermediary, SingleChainReputationType } from "../../../intermediaries/Intermediary";
import { IEscrowSwapWrapper } from "../IEscrowSwapWrapper";
import { AmountData } from "../../../types/AmountData";
export type IToBTCDefinition<T extends ChainType, W extends IToBTCWrapper<T, any>, S extends IToBTCSwap<T>> = SwapTypeDefinition<T, W, S>;
/**
 * Base class for wrappers of escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare abstract class IToBTCWrapper<T extends ChainType, D extends IToBTCDefinition<T, IToBTCWrapper<T, D>, IToBTCSwap<T, D>>, O extends ISwapWrapperOptions = ISwapWrapperOptions> extends IEscrowSwapWrapper<T, D, O> {
    /**
     * @internal
     */
    protected readonly tickSwapState: ToBTCSwapState[];
    /**
     * @internal
     */
    readonly _pendingSwapStates: ToBTCSwapState[];
    /**
     * @internal
     */
    readonly _refundableSwapStates: ToBTCSwapState[];
    /**
     * Pre-fetches intermediary's reputation, doesn't throw, instead aborts via abortController and returns null
     *
     * @param amountData
     * @param lp Intermediary
     * @param abortController
     * @returns Intermediary's reputation or null if failed
     * @throws {IntermediaryError} If the intermediary vault doesn't exist
     *
     * @internal
     */
    protected preFetchIntermediaryReputation(amountData: Omit<AmountData, "amount">, lp: Intermediary, abortController: AbortController): Promise<SingleChainReputationType | undefined>;
    /**
     * Pre-fetches feeRate for a given swap
     *
     * @param signer Address of the swap initiator
     * @param amountData
     * @param claimHash optional hash of the swap or null
     * @param abortController
     * @returns Fee rate
     *
     * @internal
     */
    protected preFetchFeeRate(signer: string, amountData: Omit<AmountData, "amount">, claimHash: string | undefined, abortController: AbortController): Promise<string | undefined>;
    /**
     * @internal
     */
    protected processEventInitialize(swap: D["Swap"], event: InitializeEvent<T["Data"]>): Promise<boolean>;
    /**
     * @internal
     */
    protected processEventClaim(swap: D["Swap"], event: ClaimEvent<T["Data"]>): Promise<boolean>;
    /**
     * @internal
     */
    protected processEventRefund(swap: D["Swap"], event: RefundEvent<T["Data"]>): Promise<boolean>;
}
