export type LNURLWithdrawParams = {
    tag: "withdrawRequest";
    k1: string;
    callback: string;
    domain: string;
    minWithdrawable: number;
    maxWithdrawable: number;
    defaultDescription: string;
    balanceCheck?: string;
    payLink?: string;
};
export type LNURLWithdrawParamsWithUrl = LNURLWithdrawParams & {
    url: string;
};
export type LNURLWithdraw = {
    type: "withdraw";
    min: bigint;
    max: bigint;
    params: LNURLWithdrawParamsWithUrl;
};
export declare function isLNURLWithdraw(value: any): value is LNURLWithdraw;
export declare function isLNURLWithdrawParams(obj: any): obj is LNURLWithdrawParams;
