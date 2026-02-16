import { ISwapWrapperOptions } from "../../ISwapWrapper";
import { Intermediary } from "../../../intermediaries/Intermediary";
import { ChainType } from "@atomiqlabs/base";
import { IEscrowSwapDefinition, IEscrowSwapWrapper } from "../IEscrowSwapWrapper";
import { IEscrowSwap } from "../IEscrowSwap";
import { AmountData } from "../../../types/AmountData";
export type IFromBTCDefinition<T extends ChainType, W extends IFromBTCWrapper<T, any>, S extends IEscrowSwap<T>> = IEscrowSwapDefinition<T, W, S>;
/**
 * Base class for wrappers of escrow-based Bitcoin (on-chain & lightning) -> Smart chain swaps
 *
 * @category Swaps
 */
export declare abstract class IFromBTCWrapper<T extends ChainType, D extends IFromBTCDefinition<T, IFromBTCWrapper<T, D>, IEscrowSwap<T, D>>, O extends ISwapWrapperOptions = ISwapWrapperOptions> extends IEscrowSwapWrapper<T, D, O> {
    /**
     * Returns a random sequence to be used for swaps
     *
     * @returns Random 64-bit sequence number
     *
     * @internal
     */
    protected getRandomSequence(): bigint;
    /**
     * Pre-fetches smart chain fee rate for initiating a swap escrow on the smart chain side
     *
     * @param signer Address initiating the swap
     * @param amountData
     * @param claimHash optional claim hash of the swap or null
     * @param abortController
     *
     * @returns Fee rate
     *
     * @internal
     */
    protected preFetchFeeRate(signer: string, amountData: AmountData, claimHash: string | undefined, abortController: AbortController): Promise<string | undefined>;
    /**
     * Pre-fetches intermediary (LP) available smart chain liquidity
     *
     * @param amountData
     * @param lp Intermediary
     * @param abortController
     *
     * @returns Intermediary's liquidity balance
     *
     * @internal
     */
    protected preFetchIntermediaryLiquidity(amountData: AmountData, lp: Intermediary, abortController: AbortController): Promise<bigint | undefined>;
    /**
     * Verifies whether the intermediary (LP) has enough available liquidity such that we can initiate the swap
     *
     * @param amount Swap amount that the recipient should receive
     * @param liquidityPromise pre-fetched liquidity promise as obtained from {@link preFetchIntermediaryLiquidity}
     *
     * @throws {IntermediaryError} if intermediary's liquidity is lower than what's required for the swap
     *
     * @internal
     */
    protected verifyIntermediaryLiquidity(amount: bigint, liquidityPromise: Promise<bigint>): Promise<void>;
}
