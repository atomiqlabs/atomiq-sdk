import { SpvFromBTCExternalDepositInvalidUtxo } from "../swaps/spv_swaps/SpvFromBTCSwap";
/**
 * Thrown when using {@link SpvFromBTCSwap} in the "intermediate_wallet" mode and an invalid UTXO is deposited to the
 *  intermediate wallet.
 *
 * @category Errors
 */
export declare class InvalidBitcoinDepositError extends Error {
    invalidUtxos: SpvFromBTCExternalDepositInvalidUtxo[];
    constructor(invalidUtxos: SpvFromBTCExternalDepositInvalidUtxo[]);
}
