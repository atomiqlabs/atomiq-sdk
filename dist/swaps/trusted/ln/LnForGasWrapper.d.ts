import { LnForGasSwap, LnForGasSwapState } from "./LnForGasSwap";
import { ISwapWrapper, SwapTypeDefinition } from "../../ISwapWrapper";
import { ChainType } from "@atomiqlabs/base";
import { Intermediary } from "../../../intermediaries/Intermediary";
import { SwapType } from "../../../enums/SwapType";
export type LnForGasSwapTypeDefinition<T extends ChainType> = SwapTypeDefinition<T, LnForGasWrapper<T>, LnForGasSwap<T>>;
/**
 * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on
 *  the destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare class LnForGasWrapper<T extends ChainType> extends ISwapWrapper<T, LnForGasSwapTypeDefinition<T>> {
    TYPE: SwapType.TRUSTED_FROM_BTCLN;
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof LnForGasSwap;
    /**
     * @internal
     */
    readonly _pendingSwapStates: LnForGasSwapState[];
    /**
     * @internal
     */
    protected readonly tickSwapState: undefined;
    /**
     * @internal
     */
    protected processEvent: undefined;
    /**
     * Returns a newly created trusted Lightning network -> Smart chain swap, receiving
     *  the specified amount of native token on the destination chain.
     *
     * @param recipient Address of the recipient on the smart chain destination chain
     * @param amount Amount of native token to receive in base units
     * @param lpOrUrl Intermediary (LP) to use for the swap
     */
    create(recipient: string, amount: bigint, lpOrUrl: Intermediary | string): Promise<LnForGasSwap<T>>;
}
