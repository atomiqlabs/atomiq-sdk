import { LnForGasSwap, LnForGasSwapState } from "./LnForGasSwap";
import { ISwapWrapper, SwapTypeDefinition } from "../../ISwapWrapper";
import { ChainType } from "@atomiqlabs/base";
import { Intermediary } from "../../../intermediaries/Intermediary";
import { SwapType } from "../../../enums/SwapType";
export type LnForGasSwapTypeDefinition<T extends ChainType> = SwapTypeDefinition<T, LnForGasWrapper<T>, LnForGasSwap<T>>;
export declare class LnForGasWrapper<T extends ChainType> extends ISwapWrapper<T, LnForGasSwapTypeDefinition<T>> {
    TYPE: SwapType;
    readonly swapDeserializer: typeof LnForGasSwap;
    /**
     * Returns a newly created swap, receiving 'amount' on lightning network
     *
     * @param signer
     * @param amount            Amount you wish to receive in base units (satoshis)
     * @param lpOrUrl           Intermediary/Counterparty swap service Intermediary object or raw url
     */
    create(signer: string, amount: bigint, lpOrUrl: Intermediary | string): Promise<LnForGasSwap<T>>;
    readonly pendingSwapStates: LnForGasSwapState[];
    readonly tickSwapState: undefined;
    protected processEvent: undefined;
}
