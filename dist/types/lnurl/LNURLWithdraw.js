"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLNURLWithdrawParams = exports.isLNURLWithdraw = void 0;
/**
 * Type guard for {@link LNURLWithdraw}
 *
 * @category Lightning
 * @internal
 */
function isLNURLWithdraw(value) {
    return (typeof value === "object" &&
        value != null &&
        value.type === "withdraw" &&
        typeof (value.min) === "bigint" &&
        typeof (value.max) === "bigint" &&
        isLNURLWithdrawParams(value.params));
}
exports.isLNURLWithdraw = isLNURLWithdraw;
/**
 * Type guard for {@link LNURLWithdrawParams}
 *
 * @category Lightning
 * @internal
 */
function isLNURLWithdrawParams(obj) {
    return obj.tag === "withdrawRequest";
}
exports.isLNURLWithdrawParams = isLNURLWithdrawParams;
