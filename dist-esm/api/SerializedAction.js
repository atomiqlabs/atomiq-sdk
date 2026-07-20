import { toApiAmount } from "./ApiTypes";
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
export async function serializeAction(action, txSerializer) {
    switch (action.type) {
        case "SendToAddress": {
            const { waitForTransactions, ...rest } = action;
            return {
                ...rest,
                txs: rest.txs.map(tx => ({
                    type: tx.type,
                    address: tx.address,
                    hyperlink: tx.hyperlink,
                    amount: toApiAmount(tx.amount)
                }))
            };
        }
        case "SignPSBT": {
            const { submitPsbt, txs, ...rest } = action;
            return {
                ...rest,
                txs: txs.map(tx => {
                    const { psbt, ...txRest } = tx;
                    return txRest;
                })
            };
        }
        case "SignSmartChainTransaction": {
            const { submitTransactions, ...rest } = action;
            return {
                ...rest,
                txs: await Promise.all(rest.txs.map(tx => txSerializer != null
                    ? txSerializer(rest.chain, tx)
                    : Promise.resolve(JSON.stringify(tx))))
            };
        }
        case "Wait": {
            const { wait, ...rest } = action;
            return rest;
        }
        default: {
            const _exhaustive = action;
            throw new Error(`Unknown action type: ${_exhaustive.type}`);
        }
    }
}
