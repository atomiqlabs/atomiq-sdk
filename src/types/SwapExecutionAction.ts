import {ChainType} from "@atomiqlabs/base";
import {Transaction} from "@scure/btc-signer";

/**
 * Swap execution action requiring a payment of the provided bolt11 lightning network invoice
 *
 * @category Swaps
 */
export type SwapExecutionActionLightning = {
    name: "Payment",
    description: string,
    chain: "LIGHTNING",
    txs: {
        type: "BOLT11_PAYMENT_REQUEST",
        address: string,
        hyperlink: string
    }[]
}

/**
 * Swap execution action on on-chain Bitcoin, has following types:
 * - `"ADDRESS"` - Destination bitcoin address and BTC amount to be sent
 * - `"FUNDED_PSBT"` - A ready to sign PSBT with the inputs populated from the provided bitcoin wallet address
 * - `"RAW_PSBT"` - Raw PSBT without the inputs, the implementor needs to add the input UTXOs before signing
 *  the transaction
 *
 * @category Swaps
 */
export type SwapExecutionActionBitcoin<
    T extends "ADDRESS" | "FUNDED_PSBT" | "RAW_PSBT" = "ADDRESS" | "FUNDED_PSBT" | "RAW_PSBT"
> = {
    name: "Payment",
    description: string,
    chain: "BITCOIN",
    txs: (T extends "ADDRESS" ? {
        type: "ADDRESS",
        amount: number,
        address: string,
        hyperlink: string
    } : T extends "FUNDED_PSBT" ? {
        type: "FUNDED_PSBT",
        psbt: Transaction,
        psbtHex: string,
        psbtBase64: string,
        signInputs: number[]
    } : {
        type: "RAW_PSBT",
        psbt: Transaction,
        psbtHex: string,
        psbtBase64: string,
        in1sequence: number
    })[]
}

/**
 * Swap execution action for committing (initiating) the escrow on the smart chain side
 *
 * @category Swaps
 */
export type SwapExecutionActionCommit<T extends ChainType> = {
    name: "Commit",
    description: string,
    chain: T["ChainId"],
    txs: T["TX"][]
}

/**
 * Swap execution action for claiming (settling) the swap on the smart chain side
 *
 * @category Swaps
 */
export type SwapExecutionActionClaim<T extends ChainType> = {
    name: "Claim",
    description: string,
    chain: T["ChainId"],
    txs: T["TX"][]
}

/**
 * Swap execution action, a single step in the swapping process
 *
 * @category Swaps
 */
export type SwapExecutionAction<T extends ChainType> = SwapExecutionActionLightning |
    SwapExecutionActionBitcoin |
    SwapExecutionActionCommit<T> |
    SwapExecutionActionClaim<T>;