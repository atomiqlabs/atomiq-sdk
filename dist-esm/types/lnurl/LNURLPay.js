/**
 * Type guard for {@link LNURLPayParams}
 *
 * @category Lightning
 * @internal
 */
export function isLNURLPayParams(obj) {
    return obj.tag === "payRequest";
}
/**
 * Type guard for {@link LNURLPay}
 *
 * @category Lightning
 */
export function isLNURLPay(value) {
    return (typeof value === "object" &&
        value != null &&
        value.type === "pay" &&
        typeof (value.min) === "bigint" &&
        typeof (value.max) === "bigint" &&
        typeof value.commentMaxLength === "number" &&
        (value.shortDescription === undefined || typeof value.shortDescription === "string") &&
        (value.longDescription === undefined || typeof value.longDescription === "string") &&
        (value.icon === undefined || typeof value.icon === "string") &&
        isLNURLPayParams(value.params));
}
