import {Token} from "../types/Token";
import {TokenAmount} from "../types/TokenAmount";
import {LNURLPay, LNURLPayParamsWithUrl} from "../types/lnurl/LNURLPay";
import {LNURLWithdraw, LNURLWithdrawParamsWithUrl} from "../types/lnurl/LNURLWithdraw";

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
}

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
}

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
}

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
 * Converts a Token to the serializable ApiToken format
 *
 * @category API
 */
export function toApiToken(token: Token): ApiToken {
    return {
        id: token.chain === "BTC" ? (token.lightning ? "BTCLN" : "BTC") : `${token.chainId}-${token.ticker}`,
        chainId: token.chainId,
        ticker: token.ticker,
        name: token.name,
        decimals: token.decimals,
        address: token.address
    };
}

/**
 * Converts LNURL data to the serializable API format
 *
 * @category API
 */
export function toApiLNURL(lnurl: LNURLPay | LNURLWithdraw): ApiLNURL {
    if(lnurl.type === "pay") {
        return {
            type: "pay",
            min: lnurl.min.toString(),
            max: lnurl.max.toString(),
            commentMaxLength: lnurl.commentMaxLength,
            ...(lnurl.shortDescription != null ? {shortDescription: lnurl.shortDescription} : {}),
            ...(lnurl.longDescription != null ? {longDescription: lnurl.longDescription} : {}),
            ...(lnurl.icon != null ? {icon: lnurl.icon} : {}),
            params: lnurl.params
        };
    }

    return {
        type: "withdraw",
        min: lnurl.min.toString(),
        max: lnurl.max.toString(),
        params: lnurl.params
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
