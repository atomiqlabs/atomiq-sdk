import { ChainType } from "@atomiqlabs/base";
import { ISwap } from "./ISwap";
import { ISwapWrapper, SwapTypeDefinition } from "./ISwapWrapper";
export declare function isIClaimableSwap(obj: any): obj is IClaimableSwap;
export interface IClaimableSwap<T extends ChainType = ChainType, D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, IClaimableSwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, IClaimableSwap<T, any, any>>, S extends number = number> extends ISwap<T, D, S> {
    isClaimable(): boolean;
    txsClaim(_signer?: T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    claim(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
}
