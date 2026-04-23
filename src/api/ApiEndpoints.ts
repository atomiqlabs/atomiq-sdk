import {SwapExecutionStep} from "../types/SwapExecutionStep";
import {SerializedAction} from "./SerializedAction";
import {SwapExecutionAction} from "../types/SwapExecutionAction";
import {ApiAmount, ApiLNURL, ApiToken} from "./ApiTypes";
import {LNURLDecodedSuccessAction} from "../types/lnurl/LNURLPay";

/**
 * Base serialized swap data returned by API endpoints that expose swap details.
 *
 * @category API
 */
export type SwapOutputBase = {
    /** Unique identifier of the swap. */
    swapId: string;
    /** Swap type name, for example `FROM_BTC`, `TO_BTCLN`, or `FROM_BTCLN`. */
    swapType: string;

    /** Current swap state information. This varies for every swap type */
    state: {
        /** Numeric state representation of the state. */
        number: number;
        /** Human-readable state name. */
        name: string;
        /** Human-readable description of the current state. */
        description: string;
    };

    /** Quote data captured when the swap was created. */
    quote: {
        /** Input source amount that will be paid by the user (including fees, but excluding source network fees). */
        inputAmount: ApiAmount;
        /** Output destination amount that will be paid out to the user. */
        outputAmount: ApiAmount;
        /** Fee breakdown included in the quote. */
        fees: {
            /** Swap service fee (charged in source token). */
            swap: ApiAmount;
            /** Swap fee to cover the transaction network fees on the destination side (charged in source token). */
            networkOutput?: ApiAmount;
        };
        /** Quote expiration timestamp in milliseconds since Unix epoch. */
        expiry: number;
        /** Output address of the swap, the destination tokens will be sent here. */
        outputAddress: string;
    };

    /** Swap creation timestamp in milliseconds since Unix epoch. */
    createdAt: number;

    /** Swap execution steps. */
    steps: SwapExecutionStep[];

    /** LNURL metadata attached to Lightning-based swaps when applicable. */
    lnurl?: {
        /** LNURL-withdraw link for Lightning to smart-chain flows. */
        withdraw?: string;
        /** LNURL-pay link for smart-chain to Lightning flows. */
        pay?: string;
        /** LNURL success action returned after a successful payment via LNURL-pay link, if specified in the LNURL. */
        successAction?: LNURLDecodedSuccessAction;
    }
}

/**
 * Input for creating a new swap
 *
 * @category API
 */
export type CreateSwapInput = {
    /** Input source token identifier, always in the format of <network>-<tiker>, e.g. `BITCOIN-BTC`, `LIGHTNING-BTC`, or `STARKNET-STRK`. */
    srcToken: string;
    /** Output destination token identifier, always in the format of <network>-<tiker>, e.g. `BITCOIN-BTC`, `LIGHTNING-BTC`, or `STARKNET-STRK`. */
    dstToken: string;
    /** Swap amount in base units */
    amount: bigint;
    /** Whether the provided amount represents the exact input or exact output side of the quote. */
    amountType: "EXACT_IN" | "EXACT_OUT";
    /** Source address for flows that require it, mainly smart-chain to Bitcoin or Lightning swaps. */
    srcAddress?: string;
    /** Destination address, invoice, or recipient identifier for the swap output. */
    dstAddress: string;
    /**
     * Only for smart chain to Lighting/Bitcoin swaps.
     *
     * Optional gas-drop amount (additional native token) to receive on the destination smart chain, in base units.
     */
    gasAmount?: bigint;
    /**
     * Only for Lightning to smart chain swaps.
     *
     * Optional custom swap payment hash encoded as a hexadecimal string, for when you want to generate the preimage
     *  and payment hash pair outside the API. When used, you need to provide the `secret` argument to the `getSwapStatus`
     *  endpoint when the swap HTLC is ready to be claimed (indicated by the `requiresSecretReveal` param in the
     *  `getSwapStatus` response)
     */
    paymentHash?: string;
    /**
     * Only for Lightning to smart chain swaps.
     *
     * Optional description to add to the generated Lightning network BOLT11 invoice.
     */
    lightningInvoiceDescription?: string;
    /**
     * Only for Lightning to smart chain swaps.
     *
     * Optional description to add to the generated Lightning network BOLT11 invoice.
     */
    lightningInvoiceDescriptionHash?: string;
    /**
     * Only for smart chain to Lightning swaps.
     *
     * Optional override for the HTLC timeout in seconds (default is 5 days), longer timeouts allow more lightning
     *  network hops to be considered when routing the destination lightning network payment, but might lead to longer
     *  funds lockup in case of non-cooperative LP.
     */
    lightningPaymentHTLCTimeout?: number;
}

/**
 * Output from create swap endpoint
 *
 * @category API
 */
export type CreateSwapOutput = SwapOutputBase;

/**
 * Input for getting swap status
 *
 * @category API
 */
export type GetSwapStatusInput = {
    /** Unique identifier of the swap to query. */
    swapId: string;

    /**
     * Swap secret pre-image revealed after the destination chain HTLC is created for Lightning to smart chain swaps,
     *  encoded as a hexadecimal string.
     */
    secret?: string;

    /**
     * For Bitcoin to smart chain swaps.
     *
     * Bitcoin address used to request a pre-funded PSBT with populated input UTXOs ready for signing and execution
     */
    bitcoinAddress?: string;
    /**
     * For Bitcoin to smart chain swaps.
     *
     * Bitcoin public key used together with `bitcoinAddress` to request a pre-funded PSBT with populated input UTXOs
     *  ready for signing and execution
     */
    bitcoinPublicKey?: string;
    /**
     * For Bitcoin to smart chain swaps.
     *
     * Bitcoin fee rate override used when building a pre-funded PSBT, otherwise the current economical fee rate is used.
     */
    bitcoinFeeRate?: number;

    /** Alternative smart-chain signer to use for claim, refund, or manual settlement transactions. */
    signer?: string;
}

/**
 * Output from swap status getter
 *
 * @category API
 */
export type ListSwapOutput = SwapOutputBase & {
    /** Whether the swap reached a terminal state. */
    isFinished: boolean;
    /** Whether the swap finished successfully. */
    isSuccess: boolean;
    /** Whether the swap finished in a failed state. */
    isFailed: boolean;
    /** Whether the quote expired before completion. */
    isExpired: boolean;
}

/**
 * Output from swap status getter
 *
 * @category API
 */
export type GetSwapStatusOutput = ListSwapOutput & {
    /** Current actionable instruction for the client, or `null` when no action is required. */
    currentAction: SerializedAction<SwapExecutionAction> | null;

    /**
     * For Lightning to smart chain swaps.
     *
     * Whether the client should provide the Lightning secret pre-image to continue execution. Returned when the HTLC
     *  on the destination chain is created and is ready to be claimed by the user.
     */
    requiresSecretReveal?: boolean;

    /**
     * Escrow-specific data for escrow contract based swaps (all except the non-legacy Bitcoin to smart chain swaps)
     */
    escrow?: {
        /** Serialized escrow data. */
        data: any,
        /** A transaction which created the escrow, if the escrow is already created on-chain. */
        initTxId?: string
    }
}

/**
 * Input for listing swaps
 *
 * @category API
 */
export type ListSwapsInput = {
    /** Smart-chain signer address used to filter swaps. */
    signer: string;
    /** Optional smart-chain identifier used to narrow the result set, e.g. SOLANA, STARKNET, CITREA */
    chainId?: string;
}

/**
 * Output from swap list endpoint
 *
 * @category API
 */
export type ListSwapsOutput = ListSwapOutput[];

/**
 * Input for listing pending swaps
 *
 * @category API
 */
export type ListPendingSwapsInput = ListSwapsInput;

/**
 * Output from pending swap list endpoint
 *
 * @category API
 */
export type ListPendingSwapsOutput = ListSwapsOutput;

/**
 * Input for listing supported tokens
 *
 * @category API
 */
export type GetSupportedTokensInput = {
    /** Whether to list source-side (`INPUT`) or destination-side (`OUTPUT`) tokens. */
    side: "INPUT" | "OUTPUT";
}

/**
 * Output from supported token list endpoint
 *
 * @category API
 */
export type GetSupportedTokensOutput = ApiToken[];

/**
 * Input for listing swap counter-tokens for a given token
 *
 * @category API
 */
export type GetSwapCounterTokensInput = {
    /** Token identifier to find compatible counter-tokens for, e.g. BITCOIN-BTC, LIGHTNING-BTC or STARKNET-STRK */
    token: string;
    /** Whether the provided token should be treated as the input or output side of the swap. */
    side: "INPUT" | "OUTPUT";
}

/**
 * Output from swap counter-token list endpoint
 *
 * @category API
 */
export type GetSwapCounterTokensOutput = ApiToken[];

/**
 * Input for querying swap limits between two tokens
 *
 * @category API
 */
export type GetSwapLimitsInput = {
    /** Source token identifier, e.g. BITCOIN-BTC, LIGHTNING-BTC or STARKNET-STRK */
    srcToken: string;
    /** Destination token identifier, e.g. BITCOIN-BTC, LIGHTNING-BTC or STARKNET-STRK */
    dstToken: string;
}

/**
 * Output from swap limits endpoint
 *
 * @category API
 */
export type GetSwapLimitsOutput = {
    /** Limits expressed on the input side of the swap. */
    input: {
        /** Minimum supported input amount. */
        min: ApiAmount;
        /** Maximum supported input amount when bounded. */
        max?: ApiAmount;
    };
    /** Limits expressed on the output side of the swap. */
    output: {
        /** Minimum supported output amount. */
        min: ApiAmount;
        /** Maximum supported output amount when bounded. */
        max?: ApiAmount;
    };
}

/**
 * Input for parsing an address-like string supported by the SDK
 *
 * @category API
 */
export type ParseAddressInput = {
    /** Address-like string to parse, such as a wallet address, lightning invoice, LNURL, or URI. */
    address: string;
}

/**
 * Output from address parser endpoint
 *
 * @category API
 */
export type ParseAddressOutput = {
    /** Canonical parsed address or recipient identifier. */
    address: string;
    /** Parsed address type, e.g. BITCOIN, LIGHTNING, SOLANA, STARKNET or CITREA */
    type: string;
    /** Parsed LNURL metadata when the input resolves to LNURL content. */
    lnurl?: ApiLNURL;
    /** Minimum supported amount advertised by the parsed target, when available. */
    min?: ApiAmount;
    /** Maximum supported amount advertised by the parsed target, when available. */
    max?: ApiAmount;
    /** Amount embedded directly in the parsed target, when present. */
    amount?: ApiAmount;
};

/**
 * Input for querying spendable wallet balance
 *
 * @category API
 */
export type GetSpendableBalanceInput = {
    /** Wallet address to inspect. */
    wallet: string;
    /** Token identifier to get the balance for, e.g. BITCOIN-BTC, SOLANA-SOL or STARKNET-STRK */
    token: string;
    /**
     * Target smart chain identifier when estimating spendable bitcoin balance. Automatically adjusts based on
     *  available swaps between Bitcoin and the provided chain
     */
    targetChain?: string;
    /**
     * Whether gas-drop transaction size overhead should be included for Bitcoin to smart chain swaps.
     */
    gasDrop?: boolean;
    /**
     * Manual fee-rate override used for spendable balance estimation.
     */
    feeRate?: string;
    /** Minimum Bitcoin fee rate to enforce during estimation. */
    minBitcoinFeeRate?: number;
    /**
     * Multiplier applied to fetched economical network fee.
     */
    feeMultiplier?: number;
}

/**
 * Output from spendable balance endpoint
 *
 * @category API
 */
export type GetSpendableBalanceOutput = {
    /** Spendable balance after deducting estimated swap execution costs. */
    balance: ApiAmount;
    /** Fee rate used during estimation. Only when estimating BTC balances on Bitcoin */
    feeRate?: number;
}

/**
 * Input for submitting signed transactions
 *
 * @category API
 */
export type SubmitTransactionInput = {
    /** Unique identifier of the swap the transactions belong to. */
    swapId: string;
    /** Serialized signed transactions to submit in execution order. */
    signedTxs: string[];
}

/**
 * Output from submitting transactions
 *
 * @category API
 */
export type SubmitTransactionOutput = {
    /** Transaction hashes returned after successful submission. */
    txHashes: string[];
}

/**
 * Input for triggering an LNURL-withdraw based settlement for Lightning -> Smart chain swaps
 *
 * @category API
 */
export type SettleWithLnurlInput = {
    /** Unique identifier of the Lightning to smart-chain swap to settle. */
    swapId: string;
    /** LNURL-withdraw link to use when the swap was not already created with one. */
    lnurlWithdraw?: string;
}

/**
 * Output for triggering an LNURL-withdraw based settlement for Lightning -> Smart chain swaps
 *
 * @category API
 */
export type SettleWithLnurlOutput = {
    /** Payment hash of the Lightning payment paid by the LNURL-withdraw link, encoded as a hexadecimal string. */
    paymentHash: string;
}
