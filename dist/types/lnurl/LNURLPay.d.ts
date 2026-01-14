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
export type LNURLPayParamsWithUrl = LNURLPayParams & {
    url: string;
};
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
export declare function isLNURLPayParams(obj: any): obj is LNURLPayParams;
export declare function isLNURLPay(value: any): value is LNURLPay;
export type LNURLDecodedSuccessAction = {
    description: string;
    text?: string;
    url?: string;
};
