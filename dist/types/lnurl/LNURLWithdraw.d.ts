/**
 * LNURL-withdraw request parameters
 * @category Bitcoin
 */
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
/**
 * LNURL-withdraw parameters with URL
 * @category Bitcoin
 */
export type LNURLWithdrawParamsWithUrl = LNURLWithdrawParams & {
    url: string;
};
/**
 * LNURL-withdraw specification
 * @category Bitcoin
 */
export type LNURLWithdraw = {
    type: "withdraw";
    min: bigint;
    max: bigint;
    params: LNURLWithdrawParamsWithUrl;
};
/**
 * Type guard for LNURL-withdraw
 * @category Bitcoin
 */
export declare function isLNURLWithdraw(value: any): value is LNURLWithdraw;
/**
 * Type guard for LNURL-withdraw parameters
 * @category Bitcoin
 */
export declare function isLNURLWithdrawParams(obj: any): obj is LNURLWithdrawParams;
