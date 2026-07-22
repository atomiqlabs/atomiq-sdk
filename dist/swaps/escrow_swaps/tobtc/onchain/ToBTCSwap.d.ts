import { ToBTCDefinition, ToBTCWrapper } from "./ToBTCWrapper.js";
import { IToBTCSwap, IToBTCSwapInit } from "../IToBTCSwap.js";
import { SwapType } from "../../../../enums/SwapType.js";
import { ISwap } from "../../../ISwap.js";
import { ChainType, SwapData } from "@atomiqlabs/base";
import { TokenAmount } from "../../../../types/TokenAmount.js";
import { BtcToken } from "../../../../types/Token.js";
import { LoggerType } from "../../../../utils/Logger.js";
export type ToBTCSwapInit<T extends SwapData> = IToBTCSwapInit<T> & {
    address?: string;
    amount?: bigint;
    confirmationTarget: number;
    satsPerVByte: number;
    requiredConfirmations?: number;
    nonce?: bigint;
};
export declare function isToBTCSwapInit<T extends SwapData>(obj: any): obj is ToBTCSwapInit<T>;
/**
 * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare class ToBTCSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCDefinition<T>> {
    protected readonly TYPE: SwapType.TO_BTC;
    /**
     * @internal
     */
    protected readonly outputToken: BtcToken<false>;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    private address?;
    private amount?;
    private readonly confirmationTarget;
    private readonly satsPerVByte;
    private requiredConfirmations?;
    private nonce?;
    private txId?;
    constructor(wrapper: ToBTCWrapper<T>, serializedObject: any);
    constructor(wrapper: ToBTCWrapper<T>, init: ToBTCSwapInit<T["Data"]>);
    /**
     * @inheritDoc
     * @internal
     */
    _setPaymentResult(result: {
        secret?: string;
        txId?: string;
    }, check?: boolean): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getOutputToken(): BtcToken<false>;
    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<BtcToken<false>>;
    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null;
    /**
     * Returns fee rate of the output bitcoin transaction in sats/vB as reported by the intermediary (LP)
     */
    getBitcoinFeeRate(): number;
    /**
     * @inheritDoc
     */
    serialize(): any;
}
/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCSwap} (an on-chain
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTC}).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare function isToBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is ToBTCSwap<T>;
