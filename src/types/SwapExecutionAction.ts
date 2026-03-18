import {ChainType} from "@atomiqlabs/base";
import {Transaction} from "@scure/btc-signer";



export type SwapExecutionActionSendToAddress = {
    type: "SendToAddress",
    name: string,
    description: string,
    chain: "LIGHTNING" | "BITCOIN",
    txs: {
        type: "BOLT11_PAYMENT_REQUEST" | "ADDRESS",
        address: string,
        hyperlink: string,
        amount: number
    }[]
}

/**
 * Swap execution action on on-chain Bitcoin, has following types:
 * - `"ADDRESS"` - Destination bitcoin address and BTC amount to be sent
 * - `"FUNDED_PSBT"` - A ready to sign PSBT with the inputs populated from the provided bitcoin wallet address
 * - `"RAW_PSBT"` - Raw PSBT without the inputs, the implementor needs to add the input UTXOs before signing
 *  the transaction
 *
 * @category Swap Actions
 */
export type SwapExecutionActionSignPSBT<
  T extends "FUNDED_PSBT" | "RAW_PSBT" = "FUNDED_PSBT" | "RAW_PSBT"
> = {
    type: "SignPSBT",
    name: string,
    description: string,
    chain: "BITCOIN",
    txs: (T extends "FUNDED_PSBT" ? {
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

export type SwapExecutionActionSignSmartChainTx<T extends ChainType> = {
    type: "SignSCTX",
    name: string,
    description: string,
    chain: T["ChainId"],
    txs: T["TX"][],
    sendTxs: () => Promise<string[]>,
    waitTillTxsConfirmed: () => Promise<void>
}


export type SwapExecutionActionWait<T extends ChainType> = {
    type: "Wait",
    name: string,
    description: string,
    wait: () => Promise<void>
    expectedTime: number,
    pollTime: number
}

/**
 * Swap execution action requiring a payment of the provided bolt11 lightning network invoice
 *
 * @category Swap Actions
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
 * Swap execution action for committing (initiating) the escrow on the smart chain side
 *
 * @category Swap Actions
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
 * @category Swap Actions
 */
export type SwapExecutionActionClaim<T extends ChainType> = {
    name: "Claim",
    description: string,
    chain: T["ChainId"],
    txs: T["TX"][]
}

/**
 * Swap execution action for refunding the swap on the smart chain side after it fails
 *
 * @category Swap Actions
 */
export type SwapExecutionActionRefund<T extends ChainType> = {
    name: "Refund",
    description: string,
    chain: T["ChainId"],
    txs: T["TX"][]
}

/**
 * Swap execution action, a single step in the swapping process
 *
 * @category Swap Actions
 */
export type SwapExecutionAction<T extends ChainType> = SwapExecutionActionLightning |
    SwapExecutionActionBitcoin |
    SwapExecutionActionCommit<T> |
    SwapExecutionActionClaim<T> |
    SwapExecutionActionRefund<T>;