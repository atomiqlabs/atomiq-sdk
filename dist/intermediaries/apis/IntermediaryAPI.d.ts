/// <reference types="node" />
/// <reference types="node" />
import { FieldTypeEnum, RequestSchema, RequestSchemaResult, RequestSchemaResultPromise } from "../../http/paramcoders/SchemaVerifier";
import { RequestBody } from "../../http/paramcoders/client/StreamingFetchPromise";
export type InfoHandlerResponse = {
    envelope: string;
    chains: {
        [chainIdentifier: string]: {
            address: string;
            signature: string;
            contractVersion?: string;
        };
    };
};
export declare enum RefundAuthorizationResponseCodes {
    EXPIRED = 20010,
    REFUND_DATA = 20000,
    NOT_FOUND = 20007,
    PENDING = 20008,
    PAID = 20006
}
export declare enum PaymentAuthorizationResponseCodes {
    AUTH_DATA = 10000,
    EXPIRED = 10001,
    PAID = 10002,
    PENDING = 10003,
    ALREADY_COMMITTED = 10004
}
export declare enum InvoiceStatusResponseCodes {
    PAID = 10000,
    EXPIRED = 10001,
    SETTLED = 10002,
    PENDING = 10003
}
export type RefundAuthorizationResponse = {
    code: RefundAuthorizationResponseCodes.PAID;
    msg: string;
    data: {
        secret?: string;
        txId?: string;
    };
} | {
    code: RefundAuthorizationResponseCodes.REFUND_DATA;
    msg: string;
    data: {
        address: string;
        prefix: string;
        timeout: string;
        signature: string;
    };
} | {
    code: Exclude<RefundAuthorizationResponseCodes, RefundAuthorizationResponseCodes.PAID | RefundAuthorizationResponseCodes.REFUND_DATA>;
    msg: string;
};
export type PaymentAuthorizationResponse = {
    code: PaymentAuthorizationResponseCodes.AUTH_DATA;
    msg: string;
    data: {
        address: string;
        data: any;
        nonce: number;
        prefix: string;
        timeout: string;
        signature: string;
    };
} | {
    code: Exclude<PaymentAuthorizationResponseCodes, PaymentAuthorizationResponseCodes.AUTH_DATA>;
    msg: string;
};
export type InvoiceStatusResponse = {
    code: Exclude<InvoiceStatusResponseCodes, InvoiceStatusResponseCodes.PAID>;
    msg: string;
} | {
    code: InvoiceStatusResponseCodes.PAID;
    msg: string;
    data: {
        data: any;
    };
};
export type SwapInit = {
    token: string;
    additionalParams?: {
        [name: string]: any;
    };
};
export type BaseFromBTCSwapInit = SwapInit & {
    claimer: string;
    amount: bigint;
    exactOut: boolean;
    feeRate: Promise<string>;
};
export type BaseToBTCSwapInit = SwapInit & {
    offerer: string;
};
declare const ToBTCResponseSchema: {
    readonly data: FieldTypeEnum.Any;
    readonly prefix: FieldTypeEnum.String;
    readonly timeout: FieldTypeEnum.String;
    readonly signature: FieldTypeEnum.String;
    readonly amount: FieldTypeEnum.BigInt;
    readonly address: FieldTypeEnum.String;
    readonly satsPervByte: FieldTypeEnum.BigInt;
    readonly networkFee: FieldTypeEnum.BigInt;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly totalFee: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly minRequiredExpiry: FieldTypeEnum.BigInt;
};
export type ToBTCResponseType = RequestSchemaResult<typeof ToBTCResponseSchema>;
export type ToBTCInit = BaseToBTCSwapInit & {
    btcAddress: string;
    exactIn: boolean;
    amount: bigint;
    confirmationTarget: number;
    confirmations: number;
    nonce: bigint;
    feeRate: Promise<string>;
};
declare const ToBTCLNResponseSchema: {
    readonly data: FieldTypeEnum.Any;
    readonly prefix: FieldTypeEnum.String;
    readonly timeout: FieldTypeEnum.String;
    readonly signature: FieldTypeEnum.String;
    readonly maxFee: FieldTypeEnum.BigInt;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly confidence: FieldTypeEnum.Number;
    readonly address: FieldTypeEnum.String;
    readonly routingFeeSats: FieldTypeEnum.BigInt;
};
export type ToBTCLNResponseType = RequestSchemaResult<typeof ToBTCLNResponseSchema>;
export type ToBTCLNInit = BaseToBTCSwapInit & {
    pr: string;
    maxFee: bigint;
    expiryTimestamp: bigint;
    feeRate: Promise<string>;
};
declare const ToBTCLNPrepareExactInSchema: {
    readonly amount: FieldTypeEnum.BigInt;
    readonly reqId: FieldTypeEnum.String;
};
export type ToBTCLNPrepareExactInResponseType = RequestSchemaResult<typeof ToBTCLNPrepareExactInSchema>;
export type ToBTCLNPrepareExactIn = BaseToBTCSwapInit & {
    pr: string;
    amount: bigint;
    maxFee: bigint;
    expiryTimestamp: bigint;
};
export type ToBTCLNInitExactIn = {
    pr: string;
    reqId: string;
    feeRate: Promise<string>;
    additionalParams?: {
        [name: string]: any;
    };
};
declare const FromBTCResponseSchema: {
    readonly data: FieldTypeEnum.Any;
    readonly prefix: FieldTypeEnum.String;
    readonly timeout: FieldTypeEnum.String;
    readonly signature: FieldTypeEnum.String;
    readonly amount: FieldTypeEnum.BigInt;
    readonly btcAddress: FieldTypeEnum.String;
    readonly address: FieldTypeEnum.String;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly confirmations: FieldTypeEnum.Number;
};
export type FromBTCResponseType = RequestSchemaResult<typeof FromBTCResponseSchema>;
export type FromBTCInit = BaseFromBTCSwapInit & {
    sequence: bigint;
    claimerBounty: Promise<{
        feePerBlock: bigint;
        safetyFactor: bigint;
        startTimestamp: bigint;
        addBlock: bigint;
        addFee: bigint;
    }>;
};
declare const FromBTCLNResponseSchema: {
    readonly pr: FieldTypeEnum.String;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly intermediaryKey: FieldTypeEnum.String;
    readonly securityDeposit: FieldTypeEnum.BigInt;
};
export type FromBTCLNResponseType = RequestSchemaResult<typeof FromBTCLNResponseSchema>;
export type FromBTCLNInit = BaseFromBTCSwapInit & {
    paymentHash: Buffer;
    description?: string;
    descriptionHash?: Buffer;
};
declare const FromBTCLNAutoResponseSchema: {
    readonly intermediaryKey: FieldTypeEnum.String;
    readonly pr: FieldTypeEnum.String;
    readonly btcAmountSwap: FieldTypeEnum.BigInt;
    readonly btcAmountGas: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly totalGas: FieldTypeEnum.BigInt;
    readonly totalFeeBtc: FieldTypeEnum.BigInt;
    readonly swapFeeBtc: FieldTypeEnum.BigInt;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly gasSwapFeeBtc: FieldTypeEnum.BigInt;
    readonly gasSwapFee: FieldTypeEnum.BigInt;
    readonly claimerBounty: FieldTypeEnum.BigInt;
};
export type FromBTCLNAutoResponseType = RequestSchemaResult<typeof FromBTCLNAutoResponseSchema>;
export type FromBTCLNAutoInit = Omit<BaseFromBTCSwapInit, "feeRate"> & {
    paymentHash: Buffer;
    gasToken: string;
    description?: string;
    descriptionHash?: Buffer;
    gasAmount?: bigint;
    claimerBounty?: Promise<bigint>;
};
declare const SpvFromBTCPrepareResponseSchema: {
    readonly quoteId: FieldTypeEnum.String;
    readonly expiry: FieldTypeEnum.Number;
    readonly address: FieldTypeEnum.String;
    readonly vaultId: FieldTypeEnum.BigInt;
    readonly vaultBtcAddress: FieldTypeEnum.String;
    readonly btcAddress: FieldTypeEnum.String;
    readonly btcUtxo: FieldTypeEnum.String;
    readonly btcFeeRate: FieldTypeEnum.Number;
    readonly btcAmount: FieldTypeEnum.BigInt;
    readonly btcAmountSwap: FieldTypeEnum.BigInt;
    readonly btcAmountGas: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly totalGas: FieldTypeEnum.BigInt;
    readonly totalFeeBtc: FieldTypeEnum.BigInt;
    readonly swapFeeBtc: FieldTypeEnum.BigInt;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly gasSwapFeeBtc: FieldTypeEnum.BigInt;
    readonly gasSwapFee: FieldTypeEnum.BigInt;
    readonly callerFeeShare: FieldTypeEnum.BigInt;
    readonly frontingFeeShare: FieldTypeEnum.BigInt;
    readonly executionFeeShare: FieldTypeEnum.BigInt;
    readonly usedUtxoInputCalculation: FieldTypeEnum.BooleanOptional;
};
export type SpvFromBTCPrepareResponseType = RequestSchemaResult<typeof SpvFromBTCPrepareResponseSchema>;
export type SpvFromBTCPrepare = SwapInit & {
    address: string;
    amount: Promise<bigint>;
    gasAmount: bigint;
    gasToken: string;
    exactOut: boolean;
    callerFeeRate: Promise<bigint>;
    frontingFeeRate: bigint;
    stickyAddress?: boolean;
    amountUtxos?: Promise<{
        value: number;
        vSize: number;
        cpfp?: {
            effectiveVSize: number;
            effectiveFeeRate: number;
        };
    }[] | undefined>;
    amountFeeRate?: Promise<number | undefined>;
};
declare const SpvFromBTCInitResponseSchema: {
    readonly txId: FieldTypeEnum.String;
};
export type SpvFromBTCInitResponseType = RequestSchemaResult<typeof SpvFromBTCInitResponseSchema>;
export type SpvFromBTCInit = {
    quoteId: string;
    psbtHex: string;
};
export declare enum TrustedInvoiceStatusResponseCodes {
    EXPIRED = 10001,
    PAID = 10000,
    AWAIT_PAYMENT = 10010,
    PENDING = 10011,
    TX_SENT = 10012
}
export type TrustedInvoiceStatusResponse = {
    code: TrustedInvoiceStatusResponseCodes.TX_SENT | TrustedInvoiceStatusResponseCodes.PAID;
    msg: string;
    data: {
        txId: string;
    };
} | {
    code: Exclude<TrustedInvoiceStatusResponseCodes, TrustedInvoiceStatusResponseCodes.TX_SENT | TrustedInvoiceStatusResponseCodes.PAID>;
    msg: string;
};
export type TrustedFromBTCLNInit = {
    address: string;
    amount: bigint;
    token: string;
};
declare const TrustedFromBTCLNResponseSchema: {
    readonly pr: FieldTypeEnum.String;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly swapFeeSats: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
};
export type TrustedFromBTCLNResponseType = RequestSchemaResult<typeof TrustedFromBTCLNResponseSchema>;
export declare enum TrustedAddressStatusResponseCodes {
    EXPIRED = 10001,
    PAID = 10000,
    AWAIT_PAYMENT = 10010,
    AWAIT_CONFIRMATION = 10011,
    PENDING = 10013,
    TX_SENT = 10012,
    REFUNDED = 10014,
    DOUBLE_SPENT = 10015,
    REFUNDABLE = 10016
}
export type TrustedAddressStatusResponse = {
    code: TrustedAddressStatusResponseCodes.TX_SENT | TrustedAddressStatusResponseCodes.PAID;
    msg: string;
    data: {
        adjustedAmount: string;
        adjustedTotal: string;
        adjustedFee?: string;
        adjustedFeeSats?: string;
        txId: string;
        scTxId: string;
    };
} | {
    code: TrustedAddressStatusResponseCodes.AWAIT_CONFIRMATION | TrustedAddressStatusResponseCodes.PENDING;
    msg: string;
    data: {
        adjustedAmount: string;
        adjustedTotal: string;
        adjustedFee?: string;
        adjustedFeeSats?: string;
        txId: string;
    };
} | {
    code: TrustedAddressStatusResponseCodes.REFUNDABLE;
    msg: string;
    data: {
        adjustedAmount: string;
    };
} | {
    code: TrustedAddressStatusResponseCodes.REFUNDED | TrustedAddressStatusResponseCodes.DOUBLE_SPENT;
    msg: string;
    data: {
        txId: string;
    };
} | {
    code: TrustedAddressStatusResponseCodes.AWAIT_PAYMENT | TrustedAddressStatusResponseCodes.EXPIRED;
    msg: string;
};
export type TrustedFromBTCInit = {
    address: string;
    amount: bigint;
    token: string;
    refundAddress?: string;
};
declare const TrustedFromBTCResponseSchema: {
    readonly paymentHash: FieldTypeEnum.String;
    readonly sequence: FieldTypeEnum.BigInt;
    readonly btcAddress: FieldTypeEnum.String;
    readonly amountSats: FieldTypeEnum.BigInt;
    readonly swapFeeSats: FieldTypeEnum.BigInt;
    readonly swapFee: FieldTypeEnum.BigInt;
    readonly total: FieldTypeEnum.BigInt;
    readonly intermediaryKey: FieldTypeEnum.String;
    readonly recommendedFee: FieldTypeEnum.Number;
    readonly expiresAt: FieldTypeEnum.Number;
};
export type TrustedFromBTCResponseType = RequestSchemaResult<typeof TrustedFromBTCResponseSchema>;
export declare class IntermediaryAPI {
    requestHeaders?: (type: "GET" | "POST", url: string, body?: any) => Record<string, string>;
    constructor(requestHeaders?: (type: "GET" | "POST", url: string, body?: any) => Record<string, string>);
    httpGet<T>(url: string, timeout?: number, abortSignal?: AbortSignal, allowNon200?: boolean): Promise<T>;
    httpPost<T>(url: string, body: any, timeout?: number, abortSignal?: AbortSignal): Promise<T>;
    streamingFetchPromise<T extends RequestSchema>(url: string, body: RequestBody, schema: T, timeout?: number, signal?: AbortSignal, streamRequest?: boolean): Promise<RequestSchemaResultPromise<T>>;
    /**
     * Returns the information about a specific intermediary
     *
     * @param baseUrl Base URL of the intermediary
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     *
     * @throws {RequestError} If non-200 http response code is returned
     * @throws {Error} If the supplied nonce doesn't match the response
     */
    getIntermediaryInfo(baseUrl: string, timeout?: number, abortSignal?: AbortSignal): Promise<InfoHandlerResponse>;
    /**
     * Returns the information about an outcome of the To BTC swap
     *
     * @param url URL of the intermediary
     * @param paymentHash Payment hash of the swap
     * @param sequence Swap's sequence number
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    getRefundAuthorization(url: string, paymentHash: string, sequence: bigint, timeout?: number, abortSignal?: AbortSignal): Promise<RefundAuthorizationResponse>;
    /**
     * Returns the information about the payment of the From BTCLN swaps
     *
     * @param url URL of the intermediary
     * @param paymentHash Payment hash of the swap
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    getPaymentAuthorization(url: string, paymentHash: string, timeout?: number, abortSignal?: AbortSignal): Promise<PaymentAuthorizationResponse>;
    /**
     * Returns the status of the payment of the From BTCLN swaps
     *
     * @param url URL of the intermediary
     * @param paymentHash Payment hash of the swap
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    getInvoiceStatus(url: string, paymentHash: string, timeout?: number, abortSignal?: AbortSignal): Promise<InvoiceStatusResponse>;
    /**
     * Initiate To BTC swap with an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initToBTC(chainIdentifier: string, baseUrl: string, init: ToBTCInit, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): {
        signDataPrefetch: Promise<any>;
        response: Promise<ToBTCResponseType>;
    };
    /**
     * Initiate From BTC swap with an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param depositToken
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initFromBTC(chainIdentifier: string, baseUrl: string, depositToken: string, init: FromBTCInit, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): {
        signDataPrefetch: Promise<any>;
        response: Promise<FromBTCResponseType>;
    };
    /**
     * Initiate From BTCLN swap with an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param depositToken
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initFromBTCLN(chainIdentifier: string, baseUrl: string, depositToken: string, init: FromBTCLNInit, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): {
        lnPublicKey: Promise<string | null>;
        response: Promise<FromBTCLNResponseType>;
    };
    /**
     * Initiate From BTCLN swap with auto-initilization by an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initFromBTCLNAuto(chainIdentifier: string, baseUrl: string, init: FromBTCLNAutoInit, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): {
        lnPublicKey: Promise<string | null>;
        response: Promise<FromBTCLNAutoResponseType>;
    };
    /**
     * Initiate To BTCLN swap with an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initToBTCLN(chainIdentifier: string, baseUrl: string, init: ToBTCLNInit, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): {
        signDataPrefetch: Promise<any>;
        response: Promise<ToBTCLNResponseType>;
    };
    /**
     * Initiate To BTCLN exact in swap with an intermediary
     *
     * @param baseUrl Base URL of the intermediary
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initToBTCLNExactIn(baseUrl: string, init: ToBTCLNInitExactIn, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): Promise<ToBTCLNResponseType>;
    /**
     * Prepare To BTCLN exact in swap with an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    prepareToBTCLNExactIn(chainIdentifier: string, baseUrl: string, init: ToBTCLNPrepareExactIn, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): {
        signDataPrefetch: Promise<any>;
        response: Promise<ToBTCLNPrepareExactInResponseType>;
    };
    /**
     * Prepare From BTC swap via new spv vault swaps with an intermediary
     *
     * @param chainIdentifier
     * @param baseUrl Base URL of the intermediary
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    prepareSpvFromBTC(chainIdentifier: string, baseUrl: string, init: SpvFromBTCPrepare, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): Promise<SpvFromBTCPrepareResponseType>;
    /**
     * Prepare From BTC swap via new spv vault swaps with an intermediary
     *
     * @param chainIdentifier
     * @param url
     * @param init Swap initialization parameters
     * @param timeout Timeout in milliseconds for the HTTP request
     * @param abortSignal
     * @param streamRequest Whether to force streaming (or not streaming) the request, default is autodetect
     *
     * @throws {RequestError} If non-200 http response code is returned
     */
    initSpvFromBTC(chainIdentifier: string, url: string, init: SpvFromBTCInit, timeout?: number, abortSignal?: AbortSignal, streamRequest?: boolean): Promise<SpvFromBTCInitResponseType>;
    /**
     * Fetches the invoice status from the intermediary node
     *
     * @param url Url of the trusted intermediary
     * @param paymentHash Payment hash of the lightning invoice
     * @param timeout Timeout in milliseconds
     * @param abortSignal
     * @throws {RequestError} if non-200 http response is returned
     */
    getTrustedInvoiceStatus(url: string, paymentHash: string, timeout?: number, abortSignal?: AbortSignal): Promise<TrustedInvoiceStatusResponse>;
    /**
     * Initiate a trusted swap from BTCLN to SC native currency, retries!
     *
     * @param chainIdentifier
     * @param baseUrl Base url of the trusted swap intermediary
     * @param init Initialization parameters
     * @param timeout Timeout in milliseconds for the request
     * @param abortSignal
     * @throws {RequestError} If the response is non-200
     */
    initTrustedFromBTCLN(chainIdentifier: string, baseUrl: string, init: TrustedFromBTCLNInit, timeout?: number, abortSignal?: AbortSignal): Promise<TrustedFromBTCLNResponseType>;
    /**
     * Fetches the address status from the intermediary node
     *
     * @param url Url of the trusted intermediary
     * @param paymentHash Payment hash of the swap
     * @param sequence Sequence number of the swap
     * @param timeout Timeout in milliseconds
     * @param abortSignal
     * @throws {RequestError} if non-200 http response is returned
     */
    getTrustedAddressStatus(url: string, paymentHash: string, sequence: bigint, timeout?: number, abortSignal?: AbortSignal): Promise<TrustedAddressStatusResponse>;
    /**
     * Sets the refund address for an on-chain gas swap
     *
     * @param url Url of the trusted intermediary
     * @param paymentHash Payment hash of the swap
     * @param sequence Sequence number of the swap
     * @param refundAddress Refund address to set for the swap
     * @param timeout Timeout in milliseconds
     * @param abortSignal
     * @throws {RequestError} if non-200 http response is returned
     */
    setTrustedRefundAddress(url: string, paymentHash: string, sequence: bigint, refundAddress: string, timeout?: number, abortSignal?: AbortSignal): Promise<void>;
    /**
     * Initiate a trusted swap from BTC to SC native currency, retries!
     *
     * @param chainIdentifier
     * @param baseUrl Base url of the trusted swap intermediary
     * @param init Initialization parameters
     * @param timeout Timeout in milliseconds for the request
     * @param abortSignal
     * @throws {RequestError} If the response is non-200
     */
    initTrustedFromBTC(chainIdentifier: string, baseUrl: string, init: TrustedFromBTCInit, timeout?: number, abortSignal?: AbortSignal): Promise<TrustedFromBTCResponseType>;
}
export {};
