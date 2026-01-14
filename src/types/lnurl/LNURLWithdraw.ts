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

export type LNURLWithdrawParamsWithUrl = LNURLWithdrawParams & { url: string };

export type LNURLWithdraw = {
    type: "withdraw",
    min: bigint,
    max: bigint,
    params: LNURLWithdrawParamsWithUrl
}

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

export function isLNURLWithdrawParams(obj: any): obj is LNURLWithdrawParams {
    return obj.tag === "withdrawRequest";
}
