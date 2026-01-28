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
};
/**
 * LNURL-pay parameters with URL
 * @category Bitcoin
 */
export type LNURLPayParamsWithUrl = LNURLPayParams & {
    url: string;
};
/**
 * LNURL-pay specification
 * @category Bitcoin
 */
export type LNURLPay = {
    type: "pay";
    min: bigint;
    max: bigint;
    commentMaxLength: number;
    shortDescription?: string;
    longDescription?: string;
    icon?: string;
    params: LNURLPayParamsWithUrl;
};
/**
 * Type guard for LNURL-pay parameters
 * @category Bitcoin
 */
export declare function isLNURLPayParams(obj: any): obj is LNURLPayParams;
/**
 * Type guard for LNURL-pay
 * @category Bitcoin
 */
export declare function isLNURLPay(value: any): value is LNURLPay;
/**
 * Decoded LNURL-pay success action
 * @category Bitcoin
 */
export type LNURLDecodedSuccessAction = {
    description: string;
    text?: string;
    url?: string;
};
