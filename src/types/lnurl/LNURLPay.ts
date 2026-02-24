/**
 * Response of the LNURL-pay link
 *
 * @category Lightning
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
 * Response of the LNURL-pay link with the added original url
 *
 * @category Lightning
 */
export type LNURLPayParamsWithUrl = LNURLPayParams & { url: string };

/**
 * Parsed LNURL-pay specification
 *
 * @category Lightning
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
 * Type guard for {@link LNURLPayParams}
 *
 * @category Lightning
 * @internal
 */
export function isLNURLPayParams(obj: any): obj is LNURLPayParams {
    return obj.tag === "payRequest";
}

/**
 * Type guard for {@link LNURLPay}
 *
 * @category Lightning
 * @internal
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
 * Decoded LNURL-pay success action, revealed after a lightning payment is finished
 *
 * @category Lightning
 */
export type LNURLDecodedSuccessAction = {
    description: string,
    text?: string,
    url?: string
};
