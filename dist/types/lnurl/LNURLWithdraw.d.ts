/**
 * Response of the LNURL-withdraw link
 *
 * @category Lightning
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
 * Response of the LNURL-withdraw link with the added original url
 *
 * @category Lightning
 */
export type LNURLWithdrawParamsWithUrl = LNURLWithdrawParams & {
    url: string;
};
/**
 * Parsed LNURL-withdraw specification
 *
 * @category Lightning
 */
export type LNURLWithdraw = {
    type: "withdraw";
    min: bigint;
    max: bigint;
    params: LNURLWithdrawParamsWithUrl;
};
/**
 * Type guard for {@link LNURLWithdraw}
 *
 * @category Lightning
 * @internal
 */
export declare function isLNURLWithdraw(value: any): value is LNURLWithdraw;
/**
 * Type guard for {@link LNURLWithdrawParams}
 *
 * @category Lightning
 * @internal
 */
export declare function isLNURLWithdrawParams(obj: any): obj is LNURLWithdrawParams;
