import { ToBTCDefinition, ToBTCWrapper } from "./ToBTCWrapper";
import { IToBTCSwap, IToBTCSwapInit } from "../IToBTCSwap";
import { SwapType } from "../../../../enums/SwapType";
import { ChainType, SwapData } from "@atomiqlabs/base";
import { TokenAmount } from "../../../../types/TokenAmount";
import { BtcToken } from "../../../../types/Token";
import { LoggerType } from "../../../../utils/Logger";
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
 * Smart Chain to on-chain BTC swap
 * @category Swaps
 */
export declare class ToBTCSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCDefinition<T>> {
    protected readonly outputToken: BtcToken<false>;
    protected readonly TYPE = SwapType.TO_BTC;
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
    _setPaymentResult(result: {
        secret?: string;
        txId?: string;
    }, check?: boolean): Promise<boolean>;
    getOutputToken(): BtcToken<false>;
    getOutput(): TokenAmount<T["ChainId"], BtcToken<false>>;
    /**
     * Returns the bitcoin address where the BTC will be sent to
     */
    getOutputAddress(): string | null;
    getOutputTxId(): string | null;
    /**
     * Returns fee rate of the bitcoin transaction in sats/vB
     */
    getBitcoinFeeRate(): number;
    serialize(): any;
}
