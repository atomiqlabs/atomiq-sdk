import {ChainType} from "@atomiqlabs/base";
import { ISwap } from "./ISwap";
import {ISwapWrapper, SwapTypeDefinition} from "./ISwapWrapper";

export function isIRefundableSwap(obj: any): obj is IRefundableSwap {
    return typeof(obj.isRefundable) === "function" &&
        typeof(obj.txsRefund) === "function" &&
        typeof(obj.refund) === "function";
}

export interface IRefundableSwap<
    T extends ChainType = ChainType,
    D extends SwapTypeDefinition<T, ISwapWrapper<T, D>, IRefundableSwap<T, D, S>> = SwapTypeDefinition<T, ISwapWrapper<T, any>, IRefundableSwap<T, any, any>>,
    S extends number = number
> extends ISwap<T, D, S> {

    isRefundable(): boolean;
    txsRefund(_signer?: T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    refund(_signer?: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;

}
