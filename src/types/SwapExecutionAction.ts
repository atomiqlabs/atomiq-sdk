import {ChainType} from "@atomiqlabs/base";
import {Transaction} from "@scure/btc-signer";
import {isTokenAmount, TokenAmount} from "./TokenAmount";
import {BitcoinTokens, BtcToken, isBtcToken} from "./Token";

const swapExecutionActionWaitNames = {
    LP: "Awaiting LP payout",
    SETTLEMENT: "Automatic settlement",
    BITCOIN_CONFS: "Bitcoin confirmations"
} as const;

function isSwapExecutionActionPsbtTx(
    obj: any,
    type?: "FUNDED_PSBT" | "RAW_PSBT"
): obj is SwapExecutionActionSignPSBT["txs"][number] {
    const resolvedType = type ?? obj?.type;
    if(obj == null || typeof(obj) !== "object") return false;
    if(resolvedType !== "FUNDED_PSBT" && resolvedType !== "RAW_PSBT") return false;
    return obj.type === resolvedType &&
        obj.psbt instanceof Transaction &&
        typeof(obj.psbtHex) === "string" &&
        typeof(obj.psbtBase64) === "string" &&
        (
            resolvedType === "FUNDED_PSBT"
                ? Array.isArray(obj.signInputs) && obj.signInputs.every((input: any) => typeof(input) === "number")
                : typeof(obj.in1sequence) === "number"
        );
}

/**
 * Swap execution action requiring the user to send assets to a specific LIGHTNING invoice or BITCOIN
 *  on-chain address
 *
 * @category Swap Actions
 */
export type SwapExecutionActionSendToAddress<Lightning extends boolean = boolean> = {
    type: "SendToAddress",
    /**
     * Human-readable name of the action
     */
    name: Lightning extends true ? "Deposit on Lightning" : "Deposit on Bitcoin",
    /**
     * Human-readable description of the action
     */
    description: string,
    /**
     * Chain on which the payment is expected, either `LIGHTNING` or `BITCOIN` for on-chain
     */
    chain: Lightning extends true ? "LIGHTNING" : "BITCOIN",
    /**
     * An array of payments that should be made to different addresses, usually only a single address is returned
     */
    txs: {
        type: Lightning extends true ? "BOLT11_PAYMENT_REQUEST" : "BITCOIN_ADDRESS",
        address: string,
        hyperlink: string,
        amount: TokenAmount<BtcToken<Lightning>, true>
    }[],
    /**
     * Waits till the transaction is received, doesn't wait for the actual confirmation!
     *
     * @returns A transaction ID of the received transaction
     */
    waitForTransactions: (maxWaitTimeSeconds?: number, pollIntervalSeconds?: number, abortSignal?: AbortSignal) => Promise<string>
}

/**
 * Type guard for {@link SwapExecutionActionSendToAddress}
 *
 * @category Swap Actions
 */
export function isSwapExecutionActionSendToAddress<Lightning extends boolean = boolean>(
    obj: any,
    lightning?: Lightning
): obj is SwapExecutionActionSendToAddress<Lightning> {
    const resolvedLightning = lightning ?? (obj?.chain === "LIGHTNING");
    return obj != null &&
        typeof(obj) === "object" &&
        obj.type === "SendToAddress" &&
        obj.name === (resolvedLightning ? "Deposit on Lightning" : "Deposit on Bitcoin") &&
        typeof(obj.description) === "string" &&
        obj.chain === (resolvedLightning ? "LIGHTNING" : "BITCOIN") &&
        Array.isArray(obj.txs) &&
        obj.txs.every((tx: any) =>
            tx != null &&
            typeof(tx) === "object" &&
            tx.type === (resolvedLightning ? "BOLT11_PAYMENT_REQUEST" : "BITCOIN_ADDRESS") &&
            typeof(tx.address) === "string" &&
            typeof(tx.hyperlink) === "string" &&
            isTokenAmount(
                tx.amount,
                resolvedLightning ? BitcoinTokens.BTCLN : BitcoinTokens.BTC,
                true
            )
        ) &&
        typeof(obj.waitForTransactions) === "function";
}

/**
 * Swap execution action requiring the user to sign the provided PSBT and then submit it back via the provided
 *  `submitPsbt()` function, has two variations:
 * - `"FUNDED_PSBT"` - A ready to sign PSBT with the inputs populated from the provided bitcoin wallet address
 * - `"RAW_PSBT"` - Raw PSBT without the inputs, the implementor needs to add the input UTXOs before signing
 *  the transaction (also make sure to set the `nSequence` field of the 2nd input, index 1, to the provided
 *  `in1sequence` value)
 *
 * @category Swap Actions
 */
export type SwapExecutionActionSignPSBT<
  T extends "FUNDED_PSBT" | "RAW_PSBT" = "FUNDED_PSBT" | "RAW_PSBT"
> = {
    type: "SignPSBT",
    /**
     * Human-readable name of the action
     */
    name: "Deposit on Bitcoin",
    /**
     * Human-readable description of the action
     */
    description: string,
    /**
     * Chain is always bitcoin
     */
    chain: "BITCOIN",
    /**
     * An array of PSBTs that need to be signed, usually contains only a single PSBT
     */
    txs: T extends "FUNDED_PSBT" ? {
        type: "FUNDED_PSBT",
        psbt: Transaction,
        psbtHex: string,
        psbtBase64: string,
        signInputs: number[],
        feeRate: number
    }[] : {
        type: "RAW_PSBT",
        psbt: Transaction,
        psbtHex: string,
        psbtBase64: string,
        in1sequence: number,
        feeRate: number
    }[],
    /**
     * Submit a signed PSBT, accepts hexadecimal, base64 and `@scure/btc-signer` {@link Transaction} object.
     *
     * @returns An array of transaction IDs of the submitted Bitcoin transactions
     */
    submitPsbt: (signedPsbt: string | Transaction | (string | Transaction)[], idempotent?: boolean) => Promise<string[]>
}

/**
 * Type guard for {@link SwapExecutionActionSignPSBT}
 *
 * @category Swap Actions
 */
export function isSwapExecutionActionSignPSBT<
    T extends "FUNDED_PSBT" | "RAW_PSBT" = "FUNDED_PSBT" | "RAW_PSBT"
>(
    obj: any,
    psbtType?: T
): obj is SwapExecutionActionSignPSBT<T> {
    const resolvedPsbtType = psbtType ?? obj?.txs?.[0]?.type;
    return obj != null &&
        typeof(obj) === "object" &&
        obj.type === "SignPSBT" &&
        obj.name === "Deposit on Bitcoin" &&
        typeof(obj.description) === "string" &&
        obj.chain === "BITCOIN" &&
        Array.isArray(obj.txs) &&
        obj.txs.every((tx: any) => isSwapExecutionActionPsbtTx(tx, resolvedPsbtType)) &&
        typeof(obj.submitPsbt) === "function";
}

/**
 * Swap execution action requiring the user to sign the provided smart chain transactions, these can then
 *  be either broadcasted manually, or sent via the provided `submitTransactions()` function
 *
 * @category Swap Actions
 */
export type SwapExecutionActionSignSmartChainTx<T extends ChainType = ChainType> = {
    type: "SignSmartChainTransaction",
    /**
     * Human-readable name of the action
     */
    name: "Initiate swap" | "Settle manually" | "Refund",
    /**
     * Human-readable description of the action
     */
    description: string,
    /**
     * Chain identifier of the smart chain on which the corresponding transactions should be signed
     */
    chain: T["ChainId"],
    /**
     * Smart chain transactions that should be signed and either broadcasted manually or submitted back
     *  to the provided `submitTransactions()` function
     */
    txs: T["TX"][],
    /**
     * Submits the signed transactions and waits for their confirmation
     *
     * @remarks This might not do any validation on the submitted transactions, so returned txids are informational
     *  only and may not be persisted immediately. The swap may wait for an authoritative state transition before
     *  considering the submitted transactions accepted.
     *
     *  Make sure to only submit valid signed transactions obtained from this action object, and pass an AbortSignal
     *  if you need a timeout, otherwise this call can wait indefinitely when invalid transactions are submitted.
     */
    submitTransactions: (txs: (T["SignedTXType"] | string)[], abortSignal?: AbortSignal, idempotent?: boolean) => Promise<string[]>,
    /**
     * The address of the signer that has to sign the transactions
     */
    requiredSigner: string
}

/**
 * Type guard for {@link SwapExecutionActionSignSmartChainTx}
 *
 * @category Swap Actions
 */
export function isSwapExecutionActionSignSmartChainTx<T extends ChainType = ChainType>(
    obj: any,
    chainIdentifier?: T["ChainId"] | T["ChainId"][]
): obj is SwapExecutionActionSignSmartChainTx<T> {
    const allowedChains = chainIdentifier == null ? null : Array.isArray(chainIdentifier) ? chainIdentifier : [chainIdentifier];
    return obj != null &&
        typeof(obj) === "object" &&
        obj.type === "SignSmartChainTransaction" &&
        (
            obj.name === "Initiate swap" ||
            obj.name === "Settle manually" ||
            obj.name === "Refund"
        ) &&
        typeof(obj.description) === "string" &&
        typeof(obj.chain) === "string" &&
        (allowedChains == null || allowedChains.includes(obj.chain)) &&
        Array.isArray(obj.txs) &&
        typeof(obj.submitTransactions) === "function" &&
        typeof(obj.requiredSigner) === "string";
}

/**
 * Swap action indicating that the user should wait for either LP to process the swap, automatic settlement to happen or
 *  until the Bitcoin transaction gets enough confirmations
 *
 * @category Swap Actions
 */
export type SwapExecutionActionWait<
    T extends "LP" | "SETTLEMENT" | "BITCOIN_CONFS" = "LP" | "SETTLEMENT" | "BITCOIN_CONFS"
> = {
    type: "Wait",
    /**
     * Human-readable name of the action
     */
    name: T extends "LP"
        ? "Awaiting LP payout"
        : T extends "SETTLEMENT"
            ? "Automatic settlement"
            : "Bitcoin confirmations",
    /**
     * Human-readable description of the action
     */
    description: string,
    /**
     * Allows you to await till this action resolves
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for
     * @param pollIntervalSeconds How often to poll for the state change (default 5 seconds)
     * @param abortSignal AbortSignal to abort the wait
     * @param btcConfirmationsCallback Optional callback when awaiting bitcoin confirmations, gets called when
     *  number of bitcoin confirmations change
     */
    wait: T extends "BITCOIN_CONFS"
        ? (
            maxWaitTimeSeconds?: number, pollIntervalSeconds?: number, abortSignal?: AbortSignal,
            btcConfirmationsCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void
        ) => Promise<void>
        : (maxWaitTimeSeconds?: number, pollIntervalSeconds?: number, abortSignal?: AbortSignal) => Promise<void>,
    /**
     * Expected time in seconds for this action to take
     */
    expectedTimeSeconds: number,
    /**
     * Recommended time interval in seconds after which you should re-check the current action
     */
    pollTimeSeconds: number
}

/**
 * Type guard for {@link SwapExecutionActionWait}
 *
 * @category Swap Actions
 */
export function isSwapExecutionActionWait<
    T extends "LP" | "SETTLEMENT" | "BITCOIN_CONFS" = "LP" | "SETTLEMENT" | "BITCOIN_CONFS"
>(
    obj: any,
    waitType?: T
): obj is SwapExecutionActionWait<T> {
    const resolvedWaitType = waitType ??
        (Object.keys(swapExecutionActionWaitNames).find(key =>
            swapExecutionActionWaitNames[key as keyof typeof swapExecutionActionWaitNames] === obj?.name
        ) as keyof typeof swapExecutionActionWaitNames | undefined);
    return obj != null &&
        typeof(obj) === "object" &&
        obj.type === "Wait" &&
        resolvedWaitType != null &&
        obj.name === swapExecutionActionWaitNames[resolvedWaitType] &&
        typeof(obj.description) === "string" &&
        typeof(obj.wait) === "function" &&
        typeof(obj.expectedTimeSeconds) === "number" &&
        typeof(obj.pollTimeSeconds) === "number";
}

/**
 * Swap execution action, a single step in the swapping process
 *
 * @category Swap Actions
 */
export type SwapExecutionAction = SwapExecutionActionSendToAddress |
    SwapExecutionActionSignPSBT |
    SwapExecutionActionSignSmartChainTx |
    SwapExecutionActionWait;
