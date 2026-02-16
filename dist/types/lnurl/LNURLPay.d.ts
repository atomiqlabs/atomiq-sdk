/**
 * Response of the LNURL-pay link
 *
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
 * Response of the LNURL-pay link with the added original url
 *
 * @category Bitcoin
 */
export type LNURLPayParamsWithUrl = LNURLPayParams & {
    url: string;
};
/**
 * Parsed LNURL-pay specification
 *
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
 * Type guard for {@link LNURLPayParams}
 *
 * @category Bitcoin
 * @internal
 */
export declare function isLNURLPayParams(obj: any): obj is LNURLPayParams;
/**
 * Type guard for {@link LNURLPay}
 *
 * @category Bitcoin
 * @internal
 */
export declare function isLNURLPay(value: any): value is LNURLPay;
/**
 * Decoded LNURL-pay success action, revealed after a lightning payment is finished
 *
 * @category Bitcoin
 */
export type LNURLDecodedSuccessAction = {
    description: string;
    text?: string;
    url?: string;
};
