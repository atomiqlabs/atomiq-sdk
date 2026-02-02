"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLNURLPay = exports.isLNURLPayParams = void 0;
/**
 * Type guard for LNURL-pay parameters
 * @category Bitcoin
 */
function isLNURLPayParams(obj) {
    return obj.tag === "payRequest";
}
exports.isLNURLPayParams = isLNURLPayParams;
/**
 * Type guard for LNURL-pay
 * @category Bitcoin
 */
function isLNURLPay(value) {
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
exports.isLNURLPay = isLNURLPay;
