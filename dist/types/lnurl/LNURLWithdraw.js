"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLNURLWithdrawParams = exports.isLNURLWithdraw = void 0;
function isLNURLWithdraw(value) {
    return (typeof value === "object" &&
        value != null &&
        value.type === "withdraw" &&
        typeof (value.min) === "bigint" &&
        typeof (value.max) === "bigint" &&
        isLNURLWithdrawParams(value.params));
}
exports.isLNURLWithdraw = isLNURLWithdraw;
function isLNURLWithdrawParams(obj) {
    return obj.tag === "withdrawRequest";
}
exports.isLNURLWithdrawParams = isLNURLWithdrawParams;
