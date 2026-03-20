import {
    SwapExecutionAction,
    SwapExecutionActionSendToAddress,
    SwapExecutionActionSignPSBT,
    SwapExecutionActionSignSmartChainTx,
    SwapExecutionActionWait
} from "../types/SwapExecutionAction";

/**
 * Strips non-serializable fields (functions, complex objects) from SwapExecutionAction types.
 * Uses key-remapping to truly omit function keys from the resulting type.
 *
 * - SignSmartChainTransaction: functions removed, txs → string[]
 * - SignPSBT: functions removed, txs[].psbt (Transaction object) omitted
 * - SendToAddress: functions removed, txs[].amount (TokenAmount) → string
 * - Wait: functions removed, data fields kept as-is
 *
 * @category API
 */
export type SerializedAction<T extends SwapExecutionAction> =
    T["type"] extends "SignSmartChainTransaction" ? {
        [K in keyof T as T[K] extends Function ? never : K]:
            K extends "txs" ? string[] : T[K]
    } :
    T["type"] extends "SignPSBT" ? {
        [K in keyof T as T[K] extends Function ? never : K]:
            K extends "txs" ? (T extends { txs: (infer U)[] }
                ? Omit<U, "psbt">[] : never) : T[K]
    } :
    T["type"] extends "SendToAddress" ? {
        [K in keyof T as T[K] extends Function ? never : K]:
            K extends "txs" ? (T extends { txs: (infer U)[] }
                ? (Omit<U, "amount"> & { amount: string })[] : never) : T[K]
    } : {
        [K in keyof T as T[K] extends Function ? never : K]: T[K]
    };

/**
 * Runtime serializer that strips non-serializable fields from a SwapExecutionAction.
 * Matches the compile-time SerializedAction<T> type.
 *
 * @category API
 */
export function serializeAction(action: SwapExecutionAction): SerializedAction<SwapExecutionAction> {
    switch (action.type) {
        case "SendToAddress": {
            const {waitForTransactions, ...rest} = action as SwapExecutionActionSendToAddress<boolean>;
            return {
                ...rest,
                txs: rest.txs.map(tx => ({
                    type: tx.type,
                    address: tx.address,
                    hyperlink: tx.hyperlink,
                    amount: tx.amount.rawAmount != null
                        ? tx.amount.rawAmount.toString()
                        : tx.amount.amount
                }))
            } as unknown as SerializedAction<SwapExecutionAction>;
        }
        case "SignPSBT": {
            const {submitPsbt, txs, ...rest} = action as SwapExecutionActionSignPSBT<"FUNDED_PSBT" | "RAW_PSBT">;
            return {
                ...rest,
                txs: txs.map(tx => {
                    const {psbt, ...txRest} = tx;
                    return txRest;
                })
            } as unknown as SerializedAction<SwapExecutionAction>;
        }
        case "SignSmartChainTransaction": {
            const {submitTransactions, ...rest} = action as SwapExecutionActionSignSmartChainTx;
            return {
                ...rest,
                txs: rest.txs.map(tx => JSON.stringify(tx))
            } as unknown as SerializedAction<SwapExecutionAction>;
        }
        case "Wait": {
            const {wait, ...rest} = action as SwapExecutionActionWait;
            return rest as unknown as SerializedAction<SwapExecutionAction>;
        }
    }
}
