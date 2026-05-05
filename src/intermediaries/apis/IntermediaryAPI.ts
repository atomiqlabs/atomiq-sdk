import {RequestError} from "../../errors/RequestError";
import {
    FieldTypeEnum, RequestSchema,
    RequestSchemaResult, RequestSchemaResultPromise,
    verifySchema
} from "../../http/paramcoders/SchemaVerifier";
import {RequestBody, streamingFetchPromise} from "../../http/paramcoders/client/StreamingFetchPromise";
import {extendAbortController, randomBytes} from "../../utils/Utils";
import {httpGet, httpPost} from "../../http/HttpUtils";
import {tryWithRetries} from "../../utils/RetryUtils";

export type InfoHandlerResponse = {
    envelope: string,
    chains: {
        [chainIdentifier: string]: {
            address: string,
            signature: string,
            contractVersion?: string,
        }
    }
};

export enum RefundAuthorizationResponseCodes {
    EXPIRED=20010,
    REFUND_DATA=20000,
    NOT_FOUND=20007,
    PENDING=20008,
    PAID=20006
}

export enum PaymentAuthorizationResponseCodes {
    AUTH_DATA=10000,
    EXPIRED=10001,
    PAID=10002,
    PENDING=10003,
    ALREADY_COMMITTED=10004
}

export enum InvoiceStatusResponseCodes {
    PAID=10000,
    EXPIRED=10001,
    SETTLED=10002,
    PENDING=10003
}

export type RefundAuthorizationResponse = {
    code: RefundAuthorizationResponseCodes.PAID,
    msg: string,
    data: {
        secret?: string,
        txId?: string
    }
} | {
    code: RefundAuthorizationResponseCodes.REFUND_DATA,
    msg: string,
    data: {
        address: string,
        prefix: string,
        timeout: string,
        signature: string
    }
} | {
    code: Exclude<RefundAuthorizationResponseCodes, RefundAuthorizationResponseCodes.PAID | RefundAuthorizationResponseCodes.REFUND_DATA>,
    msg: string
};

export type PaymentAuthorizationResponse = {
    code: PaymentAuthorizationResponseCodes.AUTH_DATA,
    msg: string,
    data: {
        address: string,
        data: any,
        nonce: number,
        prefix: string,
        timeout: string,
        signature: string
    }
} | {
    code: Exclude<PaymentAuthorizationResponseCodes, PaymentAuthorizationResponseCodes.AUTH_DATA>,
    msg: string
};

export type InvoiceStatusResponse = {
    code: Exclude<InvoiceStatusResponseCodes, InvoiceStatusResponseCodes.PAID>,
    msg: string
} | {
    code: InvoiceStatusResponseCodes.PAID,
    msg: string,
    data: {
        data: any
    }
}

const SwapResponseSchema = {
    data: FieldTypeEnum.Any,

    prefix: FieldTypeEnum.String,
    timeout: FieldTypeEnum.String,
    signature: FieldTypeEnum.String
} as const;

export type SwapInit = {
    token: string,
    additionalParams?: { [name: string]: any }
}

export type BaseFromBTCSwapInit = SwapInit & {
    claimer: string,
    amount: bigint,
    exactOut: boolean,
    feeRate: Promise<string>
};

export type BaseToBTCSwapInit = SwapInit & {
    offerer: string
};

/////////////////////////
///// To BTC

const ToBTCResponseSchema = {
    amount: FieldTypeEnum.BigInt,
    address: FieldTypeEnum.String,
    satsPervByte: FieldTypeEnum.BigInt,
    networkFee: FieldTypeEnum.BigInt,
    swapFee: FieldTypeEnum.BigInt,
    totalFee: FieldTypeEnum.BigInt,
    total: FieldTypeEnum.BigInt,
    minRequiredExpiry: FieldTypeEnum.BigInt,
    ...SwapResponseSchema
} as const;

export type ToBTCResponseType = RequestSchemaResult<typeof ToBTCResponseSchema>;

export type ToBTCInit = BaseToBTCSwapInit & {
    btcAddress: string,
    exactIn: boolean,
    amount: bigint,
    confirmationTarget: number,
    confirmations: number,
    nonce: bigint,
    feeRate: Promise<string>
}

/////////////////////////
///// To BTCLN

const ToBTCLNResponseSchema = {
    maxFee: FieldTypeEnum.BigInt,
    swapFee: FieldTypeEnum.BigInt,
    total: FieldTypeEnum.BigInt,
    confidence: FieldTypeEnum.Number,
    address: FieldTypeEnum.String,

    routingFeeSats: FieldTypeEnum.BigInt,
    ...SwapResponseSchema
} as const;

export type ToBTCLNResponseType = RequestSchemaResult<typeof ToBTCLNResponseSchema>;

export type ToBTCLNInit = BaseToBTCSwapInit & {
    pr: string,
    maxFee: bigint,
    expiryTimestamp: bigint,
    feeRate: Promise<string>
};

const ToBTCLNPrepareExactInSchema = {
    amount: FieldTypeEnum.BigInt,
    reqId: FieldTypeEnum.String
} as const;

export type ToBTCLNPrepareExactInResponseType = RequestSchemaResult<typeof ToBTCLNPrepareExactInSchema>;

export type ToBTCLNPrepareExactIn = BaseToBTCSwapInit & {
    pr: string,
    amount: bigint,
    maxFee: bigint,
    expiryTimestamp: bigint
}

export type ToBTCLNInitExactIn = {
    pr: string,
    reqId: string,
    feeRate: Promise<string>,
    additionalParams?: { [name: string]: any }
}

/////////////////////////
///// From BTC

const FromBTCResponseSchema = {
    amount: FieldTypeEnum.BigInt,
    btcAddress: FieldTypeEnum.String,
    address: FieldTypeEnum.String,
    swapFee: FieldTypeEnum.BigInt,
    total: FieldTypeEnum.BigInt,
    confirmations: FieldTypeEnum.Number,
    ...SwapResponseSchema
} as const;

export type FromBTCResponseType = RequestSchemaResult<typeof FromBTCResponseSchema>;

export type FromBTCInit = BaseFromBTCSwapInit & {
    sequence: bigint,
    claimerBounty: Promise<{
        feePerBlock: bigint,
        safetyFactor: bigint,
        startTimestamp: bigint,
        addBlock: bigint,
        addFee: bigint
    }>
}

/////////////////////////
///// From BTCLN

const FromBTCLNResponseSchema = {
    pr: FieldTypeEnum.String,
    swapFee: FieldTypeEnum.BigInt,
    total: FieldTypeEnum.BigInt,
    intermediaryKey: FieldTypeEnum.String,
    securityDeposit: FieldTypeEnum.BigInt
} as const;

export type FromBTCLNResponseType = RequestSchemaResult<typeof FromBTCLNResponseSchema>;

export type FromBTCLNInit = BaseFromBTCSwapInit & {
    paymentHash: Buffer,
    description?: string,
    descriptionHash?: Buffer
}

/////////////////////////
///// From BTCLN Auto

const FromBTCLNAutoResponseSchema = {
    intermediaryKey: FieldTypeEnum.String,
    pr: FieldTypeEnum.String,

    btcAmountSwap: FieldTypeEnum.BigInt,
    btcAmountGas: FieldTypeEnum.BigInt,

    total: FieldTypeEnum.BigInt,
    totalGas: FieldTypeEnum.BigInt,

    totalFeeBtc: FieldTypeEnum.BigInt,

    swapFeeBtc: FieldTypeEnum.BigInt,
    swapFee: FieldTypeEnum.BigInt,

    gasSwapFeeBtc: FieldTypeEnum.BigInt,
    gasSwapFee: FieldTypeEnum.BigInt,

    claimerBounty: FieldTypeEnum.BigInt
} as const;

export type FromBTCLNAutoResponseType = RequestSchemaResult<typeof FromBTCLNAutoResponseSchema>;

export type FromBTCLNAutoInit = Omit<BaseFromBTCSwapInit, "feeRate"> & {
    paymentHash: Buffer,
    gasToken: string,
    description?: string,
    descriptionHash?: Buffer,
    gasAmount?: bigint,
    claimerBounty?: Promise<bigint>
}

/////////////////////////
///// Spv vault from BTC

const SpvFromBTCPrepareResponseSchema = {
    quoteId: FieldTypeEnum.String,
    expiry: FieldTypeEnum.Number,

    address: FieldTypeEnum.String,
    vaultId: FieldTypeEnum.BigInt,

    vaultBtcAddress: FieldTypeEnum.String,
    btcAddress: FieldTypeEnum.String,
    btcUtxo: FieldTypeEnum.String,
    btcFeeRate: FieldTypeEnum.Number,

    btcAmount: FieldTypeEnum.BigInt,
    btcAmountSwap: FieldTypeEnum.BigInt,
    btcAmountGas: FieldTypeEnum.BigInt,

    total: FieldTypeEnum.BigInt,
    totalGas: FieldTypeEnum.BigInt,

    totalFeeBtc: FieldTypeEnum.BigInt,

    swapFeeBtc: FieldTypeEnum.BigInt,
    swapFee: FieldTypeEnum.BigInt,

    gasSwapFeeBtc: FieldTypeEnum.BigInt,
    gasSwapFee: FieldTypeEnum.BigInt,

    callerFeeShare: FieldTypeEnum.BigInt,
    frontingFeeShare: FieldTypeEnum.BigInt,
    executionFeeShare: FieldTypeEnum.BigInt,

    usedUtxoInputCalculation: FieldTypeEnum.BooleanOptional
} as const;

export type SpvFromBTCPrepareResponseType = RequestSchemaResult<typeof SpvFromBTCPrepareResponseSchema>;

export type SpvFromBTCPrepare = SwapInit & {
    address: string,
    amount: Promise<bigint>,
    gasAmount: bigint,
    gasToken: string,
    exactOut: boolean,
    callerFeeRate: Promise<bigint>,
    frontingFeeRate: bigint,
    stickyAddress?: boolean,
    amountUtxos?: Promise<{ value: number, vSize: number, cpfp?: { effectiveVSize: number, effectiveFeeRate: number }}[] | undefined>,
    amountFeeRate?: Promise<number | undefined>
}

const SpvFromBTCInitResponseSchema = {
    txId: FieldTypeEnum.String
} as const;

export type SpvFromBTCInitResponseType = RequestSchemaResult<typeof SpvFromBTCInitResponseSchema>;

export type SpvFromBTCInit = {
    quoteId: string,
    psbtHex: string
}

/////////////////////////
///// Trusted from BTCLN

export enum TrustedInvoiceStatusResponseCodes {
    EXPIRED=10001,
    PAID=10000,
    AWAIT_PAYMENT=10010,
    PENDING=10011,
    TX_SENT=10012
}

export type TrustedInvoiceStatusResponse = {
    code: TrustedInvoiceStatusResponseCodes.TX_SENT | TrustedInvoiceStatusResponseCodes.PAID,
    msg: string,
    data: {
        txId: string
    }
} | {
    code: Exclude<TrustedInvoiceStatusResponseCodes, TrustedInvoiceStatusResponseCodes.TX_SENT | TrustedInvoiceStatusResponseCodes.PAID>,
    msg: string
};

export type TrustedFromBTCLNInit = {
    address: string,
    amount: bigint,
    token: string
};

const TrustedFromBTCLNResponseSchema = {
    pr: FieldTypeEnum.String,
    swapFee: FieldTypeEnum.BigInt,
    swapFeeSats: FieldTypeEnum.BigInt,
    total: FieldTypeEnum.BigInt
} as const;

export type TrustedFromBTCLNResponseType = RequestSchemaResult<typeof TrustedFromBTCLNResponseSchema>;

/////////////////////////
///// Trusted from BTC

export enum TrustedAddressStatusResponseCodes {
    EXPIRED=10001,
    PAID=10000,
    AWAIT_PAYMENT=10010,
    AWAIT_CONFIRMATION=10011,
    PENDING=10013,
    TX_SENT=10012,
    REFUNDED=10014,
    DOUBLE_SPENT=10015,
    REFUNDABLE=10016
}

export type TrustedAddressStatusResponse = {
    code: TrustedAddressStatusResponseCodes.TX_SENT | TrustedAddressStatusResponseCodes.PAID,
    msg: string,
    data: {
        adjustedAmount: string,
        adjustedTotal: string,
        adjustedFee?: string,
        adjustedFeeSats?: string,
        txId: string,
        scTxId: string
    }
} | {
    code: TrustedAddressStatusResponseCodes.AWAIT_CONFIRMATION | TrustedAddressStatusResponseCodes.PENDING,
    msg: string,
    data: {
        adjustedAmount: string,
        adjustedTotal: string,
        adjustedFee?: string,
        adjustedFeeSats?: string,
        txId: string
    }
} | {
    code: TrustedAddressStatusResponseCodes.REFUNDABLE,
    msg: string,
    data: {
        adjustedAmount: string
    }
} | {
    code: TrustedAddressStatusResponseCodes.REFUNDED | TrustedAddressStatusResponseCodes.DOUBLE_SPENT,
    msg: string,
    data: {
        txId: string
    }
} | {
    code: TrustedAddressStatusResponseCodes.AWAIT_PAYMENT | TrustedAddressStatusResponseCodes.EXPIRED,
    msg: string
};

export type TrustedFromBTCInit = {
    address: string,
    amount: bigint,
    token: string,
    refundAddress?: string
};

const TrustedFromBTCResponseSchema = {
    paymentHash: FieldTypeEnum.String,
    sequence: FieldTypeEnum.BigInt,
    btcAddress: FieldTypeEnum.String,
    amountSats: FieldTypeEnum.BigInt,
    swapFeeSats: FieldTypeEnum.BigInt,
    swapFee: FieldTypeEnum.BigInt,
    total: FieldTypeEnum.BigInt,
    intermediaryKey: FieldTypeEnum.String,
    recommendedFee: FieldTypeEnum.Number,
    expiresAt: FieldTypeEnum.Number
} as const;

export type TrustedFromBTCResponseType = RequestSchemaResult<typeof TrustedFromBTCResponseSchema>;

export class IntermediaryAPI {

    requestHeaders?: (type: "GET" | "POST", url: string, body?: any) => Record<string, string>;

    constructor(requestHeaders?: (type: "GET" | "POST", url: string, body?: any) => Record<string, string>) {
        this.requestHeaders = requestHeaders;
    }

    httpGet<T>(url: string, timeout?: number, abortSignal?: AbortSignal, allowNon200: boolean = false): Promise<T> {
        const headers = this.requestHeaders==null ? {} : this.requestHeaders("GET", url);
        return httpGet(url, timeout, abortSignal, allowNon200, headers);
    }

    httpPost<T>(url: string, body: any, timeout?: number, abortSignal?: AbortSignal): Promise<T> {
        const headers = this.requestHeaders==null ? {} : this.requestHeaders("POST", url, body);
        return httpPost(url, body, timeout, abortSignal, headers);
    }

    streamingFetchPromise<T extends RequestSchema>(
        url: string,
        body: RequestBody,
        schema: T,
        timeout?: number,
        signal?: AbortSignal,
        streamRequest?: boolean
    ): Promise<RequestSchemaResultPromise<T>> {
        const headers = this.requestHeaders==null ? {} : this.requestHeaders("POST", url);
        return streamingFetchPromise(url, body, schema, timeout, signal, streamRequest, headers);
    }

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
    async getIntermediaryInfo(
        baseUrl: string,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<InfoHandlerResponse> {
        const nonce = randomBytes(32).toString("hex");

        const abortController = extendAbortController(abortSignal);

        //We don't know whether the node supports only POST or also has GET info support enabled
        // here we try both, and abort when the first one returns (which should be GET)
        const response = await Promise.any([
            this.httpGet<InfoHandlerResponse>(baseUrl+"/info?nonce="+nonce, timeout, abortController.signal),
            this.httpPost<InfoHandlerResponse>(baseUrl+"/info", {
                nonce,
            }, timeout, abortController.signal)
        ]);
        abortController.abort();

        const info = JSON.parse(response.envelope);
        if(nonce!==info.nonce) throw new Error("Invalid response - nonce");

        return response;
    }

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
    async getRefundAuthorization(
        url: string,
        paymentHash: string,
        sequence: bigint,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<RefundAuthorizationResponse> {
        return tryWithRetries(() => this.httpGet<RefundAuthorizationResponse>(
            url + "/getRefundAuthorization"+
                "?paymentHash=" + encodeURIComponent(paymentHash) +
                "&sequence=" + encodeURIComponent(sequence.toString(10)),
            timeout,
            abortSignal
        ), undefined, RequestError, abortSignal);
    }

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
    async getPaymentAuthorization(
        url: string,
        paymentHash: string,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<PaymentAuthorizationResponse> {
        return tryWithRetries(() => this.httpGet<PaymentAuthorizationResponse>(
            url+"/getInvoicePaymentAuth"+
                "?paymentHash="+encodeURIComponent(paymentHash),
            timeout,
            abortSignal
        ), undefined, RequestError, abortSignal);
    }

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
    async getInvoiceStatus(
        url: string,
        paymentHash: string,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<InvoiceStatusResponse> {
        return tryWithRetries(() => this.httpGet<InvoiceStatusResponse>(
            url+"/getInvoiceStatus"+
            "?paymentHash="+encodeURIComponent(paymentHash),
            timeout,
            abortSignal
        ), undefined, RequestError, abortSignal);
    }

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
    initToBTC(
        chainIdentifier: string,
        baseUrl: string,
        init: ToBTCInit,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): {
        signDataPrefetch: Promise<any>,
        response: Promise<ToBTCResponseType>
    } {
        const responseBodyPromise = this.streamingFetchPromise(baseUrl+"/tobtc/payInvoice?chain="+encodeURIComponent(chainIdentifier), {
            ...init.additionalParams,
            address: init.btcAddress,
            amount: init.amount.toString(10),
            exactIn: init.exactIn,
            confirmationTarget: init.confirmationTarget,
            confirmations: init.confirmations,
            nonce: init.nonce.toString(10),
            token: init.token,
            offerer: init.offerer,
            feeRate: init.feeRate
        }, {
            code: FieldTypeEnum.Number,
            msg: FieldTypeEnum.String,
            data: FieldTypeEnum.AnyOptional,
            signDataPrefetch: FieldTypeEnum.AnyOptional
        }, timeout, abortSignal, streamRequest);

        return {
            signDataPrefetch: responseBodyPromise.then(responseBody => responseBody.signDataPrefetch),
            response: responseBodyPromise.then((responseBody) => Promise.all([
                responseBody.code,
                responseBody.msg,
                responseBody.data,
            ])).then(([code, msg, data]) => {
                if(code!==20000) {
                    throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
                }
                const result = verifySchema(data, ToBTCResponseSchema);
                if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
                return result;
            })
        };
    }

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
    initFromBTC(
        chainIdentifier: string,
        baseUrl: string,
        depositToken: string,
        init: FromBTCInit,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): {
        signDataPrefetch: Promise<any>,
        response: Promise<FromBTCResponseType>
    } {
        const responseBodyPromise = this.streamingFetchPromise(
            baseUrl+"/frombtc/getAddress?chain="+encodeURIComponent(chainIdentifier)+"&depositToken="+encodeURIComponent(depositToken),
            {
                ...init.additionalParams,
                address: init.claimer,
                amount: init.amount.toString(10),
                token: init.token,

                exactOut: init.exactOut,
                sequence: init.sequence.toString(10),

                claimerBounty: init.claimerBounty.then(claimerBounty => {
                    return {
                        feePerBlock: claimerBounty.feePerBlock.toString(10),
                        safetyFactor: claimerBounty.safetyFactor.toString(10),
                        startTimestamp: claimerBounty.startTimestamp.toString(10),
                        addBlock: claimerBounty.addBlock.toString(10),
                        addFee: claimerBounty.addFee.toString(10)
                    }
                }),
                feeRate: init.feeRate
            },
            {
                code: FieldTypeEnum.Number,
                msg: FieldTypeEnum.String,
                data: FieldTypeEnum.AnyOptional,
                signDataPrefetch: FieldTypeEnum.AnyOptional
            },
            timeout, abortSignal, streamRequest
        );

        return {
            signDataPrefetch: responseBodyPromise.then(responseBody => responseBody.signDataPrefetch),
            response: responseBodyPromise.then((responseBody) => Promise.all([
                responseBody.code,
                responseBody.msg,
                responseBody.data,
            ])).then(([code, msg, data]) => {
                if(code!==20000) {
                    throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
                }
                const result = verifySchema(data, FromBTCResponseSchema);
                if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
                return result;
            })
        };
    }

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
    initFromBTCLN(
        chainIdentifier: string,
        baseUrl: string,
        depositToken: string,
        init: FromBTCLNInit,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): {
        lnPublicKey: Promise<string | null>,
        response: Promise<FromBTCLNResponseType>
    } {
        const responseBodyPromise = this.streamingFetchPromise(
            baseUrl+"/frombtcln/createInvoice?chain="+encodeURIComponent(chainIdentifier)+"&depositToken="+encodeURIComponent(depositToken),
            {
                ...init.additionalParams,
                paymentHash: init.paymentHash.toString("hex"),
                amount: init.amount.toString(),
                address: init.claimer,
                token: init.token,
                description: init.description ?? null,
                descriptionHash: init.descriptionHash==null ? null : init.descriptionHash.toString("hex"),
                exactOut: init.exactOut,
                feeRate: init.feeRate
            },
            {
                code: FieldTypeEnum.Number,
                msg: FieldTypeEnum.String,
                data: FieldTypeEnum.AnyOptional,
                lnPublicKey: FieldTypeEnum.StringOptional
            },
            timeout, abortSignal, streamRequest
        );

        return {
            lnPublicKey: responseBodyPromise.then(responseBody => responseBody.lnPublicKey),
            response: responseBodyPromise.then((responseBody) => Promise.all([
                responseBody.code,
                responseBody.msg,
                responseBody.data,
            ])).then(([code, msg, data]) => {
                if(code!==20000) {
                    throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
                }
                const result = verifySchema(data, FromBTCLNResponseSchema);
                if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
                return result;
            })
        };
    }

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
    initFromBTCLNAuto(
        chainIdentifier: string,
        baseUrl: string,
        init: FromBTCLNAutoInit,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): {
        lnPublicKey: Promise<string | null>,
        response: Promise<FromBTCLNAutoResponseType>
    } {
        const responseBodyPromise = this.streamingFetchPromise(
            baseUrl+"/frombtcln_auto/createInvoice?chain="+encodeURIComponent(chainIdentifier),
            {
                ...init.additionalParams,
                paymentHash: init.paymentHash.toString("hex"),
                amount: init.amount.toString(),
                address: init.claimer,
                token: init.token,
                description: init.description ?? null,
                descriptionHash: init.descriptionHash==null ? null : init.descriptionHash.toString("hex"),
                exactOut: init.exactOut,
                gasToken: init.gasToken,
                gasAmount: init.gasAmount?.toString(10) ?? "0",
                claimerBounty: init.claimerBounty?.then(val => val.toString(10)) ?? "0"
            },
            {
                code: FieldTypeEnum.Number,
                msg: FieldTypeEnum.String,
                data: FieldTypeEnum.AnyOptional,
                lnPublicKey: FieldTypeEnum.StringOptional
            },
            timeout, abortSignal, streamRequest
        );

        return {
            lnPublicKey: responseBodyPromise.then(responseBody => responseBody.lnPublicKey),
            response: responseBodyPromise.then((responseBody) => Promise.all([
                responseBody.code,
                responseBody.msg,
                responseBody.data,
            ])).then(([code, msg, data]) => {
                if(code!==20000) {
                    throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
                }
                const result = verifySchema(data, FromBTCLNAutoResponseSchema);
                if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
                return result;
            })
        };
    }

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
    initToBTCLN(
        chainIdentifier: string,
        baseUrl: string,
        init: ToBTCLNInit,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): {
        signDataPrefetch: Promise<any>,
        response: Promise<ToBTCLNResponseType>
    } {
        const responseBodyPromise = this.streamingFetchPromise(baseUrl+"/tobtcln/payInvoice?chain="+encodeURIComponent(chainIdentifier), {
            exactIn: false,
            ...init.additionalParams,
            pr: init.pr,
            maxFee: init.maxFee.toString(10),
            expiryTimestamp: init.expiryTimestamp.toString(10),
            token: init.token,
            offerer: init.offerer,
            feeRate: init.feeRate,
            amount: null
        }, {
            code: FieldTypeEnum.Number,
            msg: FieldTypeEnum.String,
            data: FieldTypeEnum.AnyOptional,
            signDataPrefetch: FieldTypeEnum.AnyOptional
        }, timeout, abortSignal, streamRequest);

        return {
            signDataPrefetch: responseBodyPromise.then(responseBody => responseBody.signDataPrefetch),
            response: responseBodyPromise.then((responseBody) => Promise.all([
                responseBody.code,
                responseBody.msg,
                responseBody.data,
            ])).then(([code, msg, data]) => {
                if(code!==20000) {
                    throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
                }
                const result = verifySchema(data, ToBTCLNResponseSchema);
                if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
                return result;
            })
        };
    }

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
    async initToBTCLNExactIn(
        baseUrl: string,
        init: ToBTCLNInitExactIn,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): Promise<ToBTCLNResponseType> {
        const responseBody = await this.streamingFetchPromise(baseUrl+"/tobtcln/payInvoiceExactIn", {
            ...init.additionalParams,
            pr: init.pr,
            reqId: init.reqId,
            feeRate: init.feeRate
        }, {
            code: FieldTypeEnum.Number,
            msg: FieldTypeEnum.String,
            data: FieldTypeEnum.AnyOptional
        }, timeout, abortSignal, streamRequest);

        const [code, msg, data] = await Promise.all([
            responseBody.code,
            responseBody.msg,
            responseBody.data,
        ])

        if(code!==20000) throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
        const result = verifySchema(data, ToBTCLNResponseSchema);
        if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
        return result;
    }

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
    prepareToBTCLNExactIn(
        chainIdentifier: string,
        baseUrl: string,
        init: ToBTCLNPrepareExactIn,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): {
        signDataPrefetch: Promise<any>,
        response: Promise<ToBTCLNPrepareExactInResponseType>
    } {
        const responseBodyPromise = this.streamingFetchPromise(baseUrl+"/tobtcln/payInvoice?chain="+encodeURIComponent(chainIdentifier), {
            exactIn: true,
            ...init.additionalParams,
            pr: init.pr,
            maxFee: init.maxFee.toString(10),
            expiryTimestamp: init.expiryTimestamp.toString(10),
            token: init.token,
            offerer: init.offerer,
            amount: init.amount.toString(10)
        }, {
            code: FieldTypeEnum.Number,
            msg: FieldTypeEnum.String,
            data: FieldTypeEnum.AnyOptional,
            signDataPrefetch: FieldTypeEnum.AnyOptional
        }, timeout, abortSignal, streamRequest);

        return {
            signDataPrefetch: responseBodyPromise.then(responseBody => responseBody.signDataPrefetch),
            response: responseBodyPromise.then((responseBody) => Promise.all([
                responseBody.code,
                responseBody.msg,
                responseBody.data,
            ])).then(([code, msg, data]) => {
                if(code!==20000) {
                    throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
                }
                const result = verifySchema(data, ToBTCLNPrepareExactInSchema);
                if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
                return result;
            })
        };
    }

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
    prepareSpvFromBTC(
        chainIdentifier: string,
        baseUrl: string,
        init: SpvFromBTCPrepare,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): Promise<SpvFromBTCPrepareResponseType> {
        //We need to make sure we only send the amount parameter after the amountUtxos and amountFeeRate resolve
        // this is needed, because in the LP code to maintain backwards compatibility the amountUtxos and amountFeeRate
        // params are checked immediately after the amount param (and other params) are received, if amount were sent
        // first without the amountUtxos or amountFeeRate populated these fields would've been skipped altogether
        const amountPromise = (async () => {
            if(init.amountUtxos!=null) await init.amountUtxos;
            if(init.amountFeeRate!=null) await init.amountFeeRate;
            const amount = await init.amount;
            return amount.toString(10);
        })();
        const responseBodyPromise = this.streamingFetchPromise(baseUrl+"/frombtc_spv/getQuote?chain="+encodeURIComponent(chainIdentifier), {
            exactOut: init.exactOut,
            ...init.additionalParams,
            address: init.address,
            amount: amountPromise,
            token: init.token,
            gasAmount: init.gasAmount.toString(10),
            gasToken: init.gasToken,
            frontingFeeRate: init.frontingFeeRate.toString(10),
            callerFeeRate: init.callerFeeRate.then(val => val.toString(10)),
            stickyAddress: init.stickyAddress,
            amountUtxos: init.amountUtxos,
            amountFeeRate: init.amountFeeRate
        }, {
            code: FieldTypeEnum.Number,
            msg: FieldTypeEnum.String,
            data: FieldTypeEnum.AnyOptional
        }, timeout, abortSignal, streamRequest);

        return responseBodyPromise.then((responseBody) => Promise.all([
            responseBody.code,
            responseBody.msg,
            responseBody.data,
        ])).then(([code, msg, data]) => {
            if(code!==20000) {
                throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
            }
            const result = verifySchema(data, SpvFromBTCPrepareResponseSchema);
            if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
            return result;
        });
    }

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
    initSpvFromBTC(
        chainIdentifier: string,
        url: string,
        init: SpvFromBTCInit,
        timeout?: number,
        abortSignal?: AbortSignal,
        streamRequest?: boolean
    ): Promise<SpvFromBTCInitResponseType> {
        const responseBodyPromise = this.streamingFetchPromise(url+"/postQuote?chain="+encodeURIComponent(chainIdentifier), {
            quoteId: init.quoteId,
            psbtHex: init.psbtHex
        }, {
            code: FieldTypeEnum.Number,
            msg: FieldTypeEnum.String,
            data: FieldTypeEnum.AnyOptional
        }, timeout, abortSignal, streamRequest);

        return responseBodyPromise.then((responseBody) => Promise.all([
            responseBody.code,
            responseBody.msg,
            responseBody.data,
        ])).then(([code, msg, data]) => {
            if(code!==20000) {
                throw RequestError.parse(JSON.stringify({code, msg, data}), 400);
            }
            const result = verifySchema(data, SpvFromBTCInitResponseSchema);
            if(result==null) throw new RequestError("Cannot parse the response with the expected schema", 200);
            return result;
        });
    }


    /**
     * Fetches the invoice status from the intermediary node
     *
     * @param url Url of the trusted intermediary
     * @param paymentHash Payment hash of the lightning invoice
     * @param timeout Timeout in milliseconds
     * @param abortSignal
     * @throws {RequestError} if non-200 http response is returned
     */
    async getTrustedInvoiceStatus(
        url: string,
        paymentHash: string,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<TrustedInvoiceStatusResponse> {
        return tryWithRetries(() => this.httpGet<TrustedInvoiceStatusResponse>(
            url+"/getInvoiceStatus?paymentHash="+encodeURIComponent(paymentHash),
            timeout, abortSignal
        ), undefined, RequestError, abortSignal);
    }

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
    async initTrustedFromBTCLN(
        chainIdentifier: string,
        baseUrl: string,
        init: TrustedFromBTCLNInit,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<TrustedFromBTCLNResponseType> {
        const resp = await tryWithRetries(
            () => this.httpGet<{code: number, msg: string, data?: any}>(
                baseUrl+"/lnforgas/createInvoice" +
                "?address="+encodeURIComponent(init.address) +
                "&amount="+encodeURIComponent(init.amount.toString(10))+
                "&chain="+encodeURIComponent(chainIdentifier)+
                "&token="+encodeURIComponent(init.token),
                timeout,
                abortSignal
            ), undefined, RequestError, abortSignal
        );

        if(resp.code!==10000) throw RequestError.parse(JSON.stringify(resp), 400);
        const res = verifySchema(resp.data, TrustedFromBTCLNResponseSchema);
        if(res==null) throw new Error("Invalid response returned from LP");
        return res;
    }

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
    async getTrustedAddressStatus(
        url: string,
        paymentHash: string,
        sequence: bigint,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<TrustedAddressStatusResponse> {
        return tryWithRetries(() => this.httpGet<TrustedAddressStatusResponse>(
            url+"/getAddressStatus?paymentHash="+encodeURIComponent(paymentHash)+"&sequence="+encodeURIComponent(sequence.toString(10)),
            timeout, abortSignal
        ), undefined, RequestError, abortSignal);
    }

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
    async setTrustedRefundAddress(
        url: string,
        paymentHash: string,
        sequence: bigint,
        refundAddress: string,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<void> {
        return tryWithRetries(() => this.httpGet<void>(
            url+"/setRefundAddress" +
            "?paymentHash="+encodeURIComponent(paymentHash)+
            "&sequence="+encodeURIComponent(sequence.toString(10))+
            "&refundAddress="+encodeURIComponent(refundAddress),
            timeout, abortSignal
        ), undefined, RequestError, abortSignal);
    }

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
    async initTrustedFromBTC(
        chainIdentifier: string,
        baseUrl: string,
        init: TrustedFromBTCInit,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<TrustedFromBTCResponseType> {
        const resp = await tryWithRetries(
            () => this.httpGet<{code: number, msg: string, data?: any}>(
                baseUrl+"/frombtc_trusted/getAddress?chain="+encodeURIComponent(chainIdentifier)+
                "&address="+encodeURIComponent(init.address)+
                "&amount="+encodeURIComponent(init.amount.toString(10))+
                (init.refundAddress==null ? "" : "&refundAddress="+encodeURIComponent(init.refundAddress))+
                "&exactIn=true"+
                "&token="+encodeURIComponent(init.token),
                timeout,
                abortSignal
            ), undefined, RequestError, abortSignal
        );

        if(resp.code!==10000) throw RequestError.parse(JSON.stringify(resp), 400);
        const res = verifySchema(resp.data, TrustedFromBTCResponseSchema);
        if(res==null) throw new Error("Invalid response returned from LP");
        return res;
    }

}
