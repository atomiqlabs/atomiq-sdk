/**
 * Type guard for {@link LNURLWithdraw}
 *
 * @category Lightning
 */
export function isLNURLWithdraw(value) {
    return (typeof value === "object" &&
        value != null &&
        value.type === "withdraw" &&
        typeof (value.min) === "bigint" &&
        typeof (value.max) === "bigint" &&
        isLNURLWithdrawParams(value.params));
}
/**
 * Type guard for {@link LNURLWithdrawParams}
 *
 * @category Lightning
 * @internal
 */
export function isLNURLWithdrawParams(obj) {
    return obj.tag === "withdrawRequest";
}
