import { SwapExecutionAction } from "../types/SwapExecutionAction";
import { ApiAmount } from "./ApiTypes";
/**
 * Strips non-serializable fields (functions, complex objects) from SwapExecutionAction types.
 * Uses key-remapping to truly omit function keys from the resulting type.
 *
 * - SignSmartChainTransaction: functions removed, txs → string[]
 * - SignPSBT: functions removed, txs[].psbt (Transaction object) omitted
 * - SendToAddress: functions removed, txs[].amount (TokenAmount) → ApiAmount
 * - Wait: functions removed, data fields kept as-is
 *
 * @category API
 */
export type SerializedAction<T extends SwapExecutionAction> = T["type"] extends "SignSmartChainTransaction" ? {
    [K in keyof T as T[K] extends Function ? never : K]: K extends "txs" ? string[] : T[K];
} : T["type"] extends "SignPSBT" ? {
    [K in keyof T as T[K] extends Function ? never : K]: K extends "txs" ? (T extends {
        txs: (infer U)[];
    } ? Omit<U, "psbt">[] : never) : T[K];
} : T["type"] extends "SendToAddress" ? {
    [K in keyof T as T[K] extends Function ? never : K]: K extends "txs" ? (T extends {
        txs: (infer U)[];
    } ? (Omit<U, "amount"> & {
        amount: ApiAmount;
    })[] : never) : T[K];
} : {
    [K in keyof T as T[K] extends Function ? never : K]: T[K];
};
/**
 * Runtime serializer that strips non-serializable fields from a SwapExecutionAction.
 * Matches the compile-time SerializedAction<T> type.
 *
 * @param action The swap execution action to serialize
 * @param txSerializer Optional chain-specific transaction serializer for SignSmartChainTransaction actions.
 *   Accepts the chain identifier and raw transaction, returns the serialized string.
 *   Falls back to JSON.stringify if not provided.
 *
 * @category API
 */
export declare function serializeAction(action: SwapExecutionAction, txSerializer?: (chainId: string, tx: any) => Promise<string>): Promise<SerializedAction<SwapExecutionAction>>;
