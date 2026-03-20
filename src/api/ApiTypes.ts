import {SwapExecutionStep} from "../types/SwapExecutionStep";
import {SwapExecutionAction} from "../types/SwapExecutionAction";
import {SerializedAction} from "./SerializedAction";

/**
 * Unified amount type for all API responses
 *
 * @category API
 */
export interface ApiAmount {
    /** Decimal format, e.g. "1.5" */
    amount: string;
    /** Raw base units as string, e.g. "1500000000000000000" */
    rawAmount: string;
    /** Token decimals, e.g. 18 */
    decimals: number;
    /** Token ticker, e.g. "STRK" */
    symbol: string;
    /** Chain identifier, e.g. "STARKNET", "BITCOIN", "LIGHTNING" */
    chain: string;
}

/**
 * Typed API endpoint definition for framework-agnostic integration
 *
 * @category API
 */
export interface ApiEndpoint<TInput, TOutput> {
    type: "GET" | "POST";
    inputSchema: Record<keyof TInput, {
        type: string;
        required: boolean;
        description: string;
    }>;
    callback: (input: TInput) => Promise<TOutput>;
}

/**
 * Input for creating a new swap
 *
 * @category API
 */
export interface CreateSwapInput {
    srcToken: string;
    dstToken: string;
    amount: string;
    amountType: "EXACT_IN" | "EXACT_OUT";
    srcAddress: string;
    dstAddress: string;
    gasAmount?: string;
    paymentHash?: string;
    options?: {
        description?: string;
        descriptionHash?: string;
        expirySeconds?: number;
    };
}

/**
 * Input for getting swap status
 *
 * @category API
 */
export interface GetSwapStatusInput {
    swapId: string;
}

/**
 * Input for submitting signed transactions
 *
 * @category API
 */
export interface SubmitTransactionInput {
    swapId: string;
    signedTxs: string[];
}

/**
 * Output from submitting transactions
 *
 * @category API
 */
export interface SubmitTransactionOutput {
    txHashes: string[];
}

/**
 * Shared response type for createSwap and getSwapStatus
 *
 * @category API
 */
export interface SwapStatusResponse {
    swapId: string;
    swapType: string;

    state: {
        number: number;
        name: string;
        description: string;
    };
    isFinished: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    isExpired: boolean;

    quote: {
        inputAmount: ApiAmount;
        outputAmount: ApiAmount;
        fees: {
            swap: ApiAmount;
            networkOutput?: ApiAmount;
        };
        expiry: number;
    };

    createdAt: number;
    expiresAt: number | null;

    steps: SwapExecutionStep[];
    currentAction: SerializedAction<SwapExecutionAction> | null;

    transactions: {
        source: {
            init: string | null;
            settlement: string | null;
            refund: string | null;
        };
        destination: {
            init: string | null;
            settlement: string | null;
        };
    };
}
