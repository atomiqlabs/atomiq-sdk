import { SwapExecutionStep } from "../types/SwapExecutionStep";
import { SwapExecutionAction } from "../types/SwapExecutionAction";
import { SerializedAction } from "./SerializedAction";
import { TokenAmount } from "../types/TokenAmount";
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
 * Converts a TokenAmount to the serializable ApiAmount format
 *
 * @category API
 */
export declare function toApiAmount(tokenAmount: TokenAmount): ApiAmount;
/**
 * Maps a TypeScript type to its schema type string representation
 *
 * @category API
 */
type TypeToSchemaType<T> = [
    NonNullable<T>
] extends [string] ? "string" : [
    NonNullable<T>
] extends [number] ? "number" : [
    NonNullable<T>
] extends [boolean] ? "boolean" : [
    NonNullable<T>
] extends [any[]] ? "array" : "object";
export type InputSchemaField<T = unknown> = {
    type: TypeToSchemaType<T>;
    required: boolean;
    description: string;
    properties?: T extends readonly any[] ? never : T extends object ? {
        [K in keyof T]-?: InputSchemaField<T[K]>;
    } : never;
    items?: T extends readonly (infer U)[] ? InputSchemaField<U> : never;
};
/**
 * Typed API endpoint definition for framework-agnostic integration
 *
 * @category API
 */
export interface ApiEndpoint<TInput, TOutput, Type extends "GET" | "POST"> {
    type: Type;
    inputSchema: {
        [K in keyof TInput]-?: InputSchemaField<TInput[K]>;
    };
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
    secret?: string;
    bitcoinAddress?: string;
    bitcoinPublicKey?: string;
    bitcoinFeeRate?: number;
    signer?: string;
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
    steps: SwapExecutionStep[];
    currentAction: SerializedAction<SwapExecutionAction> | null;
    requiresSecretReveal?: boolean;
}
export {};
