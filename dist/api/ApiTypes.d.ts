import { Token } from "../types/Token";
import { TokenAmount } from "../types/TokenAmount";
import { LNURLPay, LNURLPayParamsWithUrl } from "../types/lnurl/LNURLPay";
import { LNURLWithdraw, LNURLWithdrawParamsWithUrl } from "../types/lnurl/LNURLWithdraw";
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
};
/**
 * Serializable token representation for API responses
 *
 * @category API
 */
export type ApiToken = {
    /** Canonical token identifier accepted by the API, e.g. "BTC", "BTCLN", "STARKNET-STRK" */
    id: string;
    /** Chain identifier, e.g. "STARKNET", "BITCOIN", "LIGHTNING" */
    chainId: string;
    /** Token ticker, e.g. "STRK" */
    ticker: string;
    /** Full token name */
    name: string;
    /** Actual decimal places of the token */
    decimals: number;
    /** Token contract address, or empty string for Bitcoin */
    address: string;
};
/**
 * Serializable LNURL-pay representation for API responses
 *
 * @category API
 */
export type ApiLNURLPay = {
    type: "pay";
    min: string;
    max: string;
    commentMaxLength: number;
    shortDescription?: string;
    longDescription?: string;
    icon?: string;
    params: LNURLPayParamsWithUrl;
};
/**
 * Serializable LNURL-withdraw representation for API responses
 *
 * @category API
 */
export type ApiLNURLWithdraw = {
    type: "withdraw";
    min: string;
    max: string;
    params: LNURLWithdrawParamsWithUrl;
};
/**
 * Serializable LNURL representation for API responses
 *
 * @category API
 */
export type ApiLNURL = ApiLNURLPay | ApiLNURLWithdraw;
/**
 * Converts a TokenAmount to the serializable ApiAmount format
 *
 * @category API
 */
export declare function toApiAmount(tokenAmount: TokenAmount): ApiAmount;
/**
 * Converts a Token to the serializable ApiToken format
 *
 * @category API
 */
export declare function toApiToken(token: Token): ApiToken;
/**
 * Converts LNURL data to the serializable API format
 *
 * @category API
 */
export declare function toApiLNURL(lnurl: LNURLPay | LNURLWithdraw): ApiLNURL;
/**
 * Maps a TypeScript type to its schema type string representation
 *
 * @category API
 */
type TypeToSchemaType<T> = NonNullable<T> extends string ? "string" : NonNullable<T> extends number ? "number" : NonNullable<T> extends bigint ? "bigint" : NonNullable<T> extends boolean ? "boolean" : NonNullable<T> extends any[] ? "array" : "object";
export type InputSchemaField<T = unknown> = {
    type: TypeToSchemaType<T>;
    required: boolean;
    description: string;
    properties?: T extends readonly any[] ? never : T extends object ? {
        [K in keyof T]-?: InputSchemaField<T[K]>;
    } : never;
    items?: T extends readonly (infer U)[] ? InputSchemaField<U> : never;
    allowedValues?: NonNullable<T> extends string | number | bigint ? NonNullable<T>[] : never;
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
    callbackRaw: (input: unknown) => Promise<TOutput>;
};
export declare function createApiEndpoint<TInput, TOutput, Type extends "GET" | "POST">(type: Type, callback: (input: TInput) => Promise<TOutput>, inputSchema: InputSchema<TInput>): ApiEndpoint<TInput, TOutput, Type>;
export {};
