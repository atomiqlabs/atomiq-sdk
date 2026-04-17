import { Token } from "../types/Token";
import { TokenAmount } from "../types/TokenAmount";
import { LNURLPay, LNURLPayParamsWithUrl } from "../types/lnurl/LNURLPay";
import { LNURLWithdraw, LNURLWithdrawParamsWithUrl } from "../types/lnurl/LNURLWithdraw";
import { Swapper } from "../swapper/Swapper";
/**
 * Unified amount type for all API responses
 *
 * @category API
 */
export type ApiAmount = {
    /** Decimal format of the amount, e.g. "1.5" */
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
    /** Canonical token identifier accepted by the API, e.g. "BITCOIN-BTC", "LIGHTNING-BTC", "STARKNET-STRK" */
    id: string;
    /** Chain identifier, e.g. "STARKNET", "BITCOIN", "LIGHTNING" */
    chainId: string;
    /** Token ticker, e.g. "STRK" */
    ticker: string;
    /** Full token name */
    name: string;
    /** Decimal places of the token */
    decimals: number;
    /** Token contract address, or empty string for BTC on Bitcoin/Lightning */
    address: string;
};
/**
 * Serializable LNURL-pay representation for API responses
 *
 * @category API
 */
export type ApiLNURLPay = {
    /** Marks the LNURL payload as an LNURL-pay response. */
    type: "pay";
    /** Minimum payable amount supported by the LNURL-pay endpoint. */
    min: ApiAmount;
    /** Maximum payable amount supported by the LNURL-pay endpoint. */
    max: ApiAmount;
    /** Maximum comment length accepted by the LNURL-pay endpoint. */
    commentMaxLength: number;
    /** Short human-readable description of the payee, when provided by the LNURL service. */
    shortDescription?: string;
    /** Longer human-readable description of the payee, when provided by the LNURL service. */
    longDescription?: string;
    /** Optional icon for the payee, usually encoded as a data URL. */
    icon?: string;
    /** Raw LNURL-pay metadata and callback parameters. */
    params: LNURLPayParamsWithUrl;
};
/**
 * Serializable LNURL-withdraw representation for API responses
 *
 * @category API
 */
export type ApiLNURLWithdraw = {
    /** Marks the LNURL payload as an LNURL-withdraw response. */
    type: "withdraw";
    /** Minimum withdrawable amount supported by the LNURL-withdraw endpoint. */
    min: ApiAmount;
    /** Maximum withdrawable amount supported by the LNURL-withdraw endpoint. */
    max: ApiAmount;
    /** Raw LNURL-withdraw metadata and callback parameters. */
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
export declare function toApiLNURL(lnurl: LNURLPay | LNURLWithdraw, swapper: Swapper<any>): ApiLNURL;
/**
 * Maps a TypeScript type to its schema type string representation
 *
 * @category API
 */
type TypeToSchemaType<T> = NonNullable<T> extends string ? "string" : NonNullable<T> extends number ? "number" : NonNullable<T> extends bigint ? "bigint" : NonNullable<T> extends boolean ? "boolean" : NonNullable<T> extends any[] ? "array" : "object";
/**
 * Schema definition for a single API input field.
 *
 * @category API
 */
export type InputSchemaField<T = unknown> = {
    /** Primitive schema type inferred from the TypeScript field type. */
    type: TypeToSchemaType<T>;
    /** Whether the field is required by the endpoint input parser. */
    required: boolean;
    /** Human-readable description of the field exposed by the API schema. */
    description: string;
    /** Nested schema properties for object-like fields. */
    properties?: T extends readonly any[] ? never : T extends object ? {
        [K in keyof T]-?: InputSchemaField<T[K]>;
    } : never;
    /** Schema definition for array items when the field is an array. */
    items?: T extends readonly (infer U)[] ? InputSchemaField<U> : never;
    /** Enumerated allowed values for string, number, or bigint fields when constrained. */
    allowedValues?: NonNullable<T> extends string | number | bigint ? NonNullable<T>[] : never;
};
/**
 * Schema definition describing the accepted input shape for an API endpoint.
 *
 * @category API
 */
export type InputSchema<TInput> = {
    [K in keyof TInput]-?: InputSchemaField<TInput[K]>;
};
/**
 * Typed API endpoint definition for framework-agnostic integration
 *
 * @category API
 */
export type ApiEndpoint<TInput, TOutput, Type extends "GET" | "POST"> = {
    /** HTTP method used by the endpoint. */
    type: Type;
    /** Structured schema describing the accepted input payload. */
    inputSchema: InputSchema<TInput>;
    /** Typed endpoint implementation that receives already-validated input. */
    callback: (input: TInput) => Promise<TOutput>;
    /** Raw endpoint implementation that parses unknown input into the typed callback. */
    callbackRaw: (input: unknown) => Promise<TOutput>;
};
export declare function createApiEndpoint<TInput, TOutput, Type extends "GET" | "POST">(type: Type, callback: (input: TInput) => Promise<TOutput>, inputSchema: InputSchema<TInput>): ApiEndpoint<TInput, TOutput, Type>;
export {};
