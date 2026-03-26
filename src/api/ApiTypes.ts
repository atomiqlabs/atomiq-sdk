import {TokenAmount} from "../types/TokenAmount";

/**
 * Unified amount type for all API responses
 *
 * @category API
 */
export type ApiAmount = {
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
export function toApiAmount(tokenAmount: TokenAmount): ApiAmount {
    return {
        amount: tokenAmount.amount,
        rawAmount: tokenAmount.rawAmount != null ? tokenAmount.rawAmount.toString() : "0",
        decimals: tokenAmount.token.decimals,
        symbol: tokenAmount.token.ticker,
        chain: tokenAmount.token.chainId
    };
}

/**
 * Maps a TypeScript type to its schema type string representation
 *
 * @category API
 */
type TypeToSchemaType<T> =
    NonNullable<T> extends string ? "string" :
    NonNullable<T> extends number ? "number" :
    NonNullable<T> extends bigint ? "bigint" :
    NonNullable<T> extends boolean ? "boolean" :
    NonNullable<T> extends any[] ? "array" :
    "object";

export type InputSchemaField<T = unknown> = {
    type: TypeToSchemaType<T>;
    required: boolean;
    description: string;
    properties?: T extends readonly any[] ? never :
        T extends object ? {
            [K in keyof T]-?: InputSchemaField<T[K]>;
        } : never; // Specifies nested object properties
    items?: T extends readonly (infer U)[] ? InputSchemaField<U> : never; // Specifies type of the array items
    allowedValues?: NonNullable<T> extends string | number | bigint ? NonNullable<T>[] : never; // An array of allowed values for a given field
};

export type InputSchema<TInput> = {
    [K in keyof TInput]-?: InputSchemaField<TInput[K]>;
};

/**
 * Typed API endpoint definition for framework-agnostic integration
 *
 * @category API
 */
export type ApiEndpoint<TInput, TOutput, Type extends "GET" | "POST"> = {
    type: Type;
    inputSchema: InputSchema<TInput>;
    callback: (input: TInput) => Promise<TOutput>;
}
