/**
 * LNURL-pay request parameters
 * @category Bitcoin
 */
export type LNURLPayParams = {
    tag: "payRequest";
    callback: string;
    domain: string;
    minSendable: number;
    maxSendable: number;
    metadata: string;
    decodedMetadata: string[][];
    commentAllowed: number;
}

/**
 * LNURL-pay parameters with URL
 * @category Bitcoin
 */
export type LNURLPayParamsWithUrl = LNURLPayParams & { url: string };

/**
 * LNURL-pay specification
 * @category Bitcoin
 */
export type LNURLPay = {
    type: "pay",
    min: bigint,
    max: bigint,
    commentMaxLength: number,
    shortDescription?: string,
    longDescription?: string,
    icon?: string,
    params: LNURLPayParamsWithUrl
}

/**
 * Type guard for LNURL-pay parameters
 * @category Bitcoin
 */
export function isLNURLPayParams(obj: any): obj is LNURLPayParams {
    return obj.tag === "payRequest";
}

/**
 * Type guard for LNURL-pay
 * @category Bitcoin
 */
export function isLNURLPay(value: any): value is LNURLPay {
    return (
        typeof value === "object" &&
        value != null &&
        value.type === "pay" &&
        typeof (value.min) === "bigint" &&
        typeof (value.max) === "bigint" &&
        typeof value.commentMaxLength === "number" &&
        (value.shortDescription === undefined || typeof value.shortDescription === "string") &&
        (value.longDescription === undefined || typeof value.longDescription === "string") &&
        (value.icon === undefined || typeof value.icon === "string") &&
        isLNURLPayParams(value.params)
    );
}

/**
 * Decoded LNURL-pay success action
 * @category Bitcoin
 */
export type LNURLDecodedSuccessAction = {
    description: string,
    text?: string,
    url?: string
};
