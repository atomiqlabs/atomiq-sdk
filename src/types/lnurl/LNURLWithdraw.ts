/**
 * Response of the LNURL-withdraw link
 *
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
}

/**
 * Response of the LNURL-withdraw link with the added original url
 *
 * @category Bitcoin
 */
export type LNURLWithdrawParamsWithUrl = LNURLWithdrawParams & { url: string };

/**
 * Parsed LNURL-withdraw specification
 *
 * @category Bitcoin
 */
export type LNURLWithdraw = {
    type: "withdraw",
    min: bigint,
    max: bigint,
    params: LNURLWithdrawParamsWithUrl
}

/**
 * Type guard for {@link LNURLWithdraw}
 *
 * @category Bitcoin
 * @internal
 */
export function isLNURLWithdraw(value: any): value is LNURLWithdraw {
    return (
        typeof value === "object" &&
        value != null &&
        value.type === "withdraw" &&
        typeof (value.min) === "bigint" &&
        typeof (value.max) === "bigint" &&
        isLNURLWithdrawParams(value.params)
    );
}

/**
 * Type guard for {@link LNURLWithdrawParams}
 *
 * @category Bitcoin
 * @internal
 */
export function isLNURLWithdrawParams(obj: any): obj is LNURLWithdrawParams {
    return obj.tag === "withdrawRequest";
}
