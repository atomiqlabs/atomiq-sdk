"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromHumanReadableString = exports.toHumanReadableString = void 0;
const Utils_js_1 = require("./Utils.js");
/**
 * Converts a raw bigint amount to a human-readable string with decimals
 *
 * @param amount Amount in base units
 * @param token Token
 *
 * @category Utilities
 */
function toHumanReadableString(amount, token) {
    if (amount == null)
        return "";
    return (0, Utils_js_1.toDecimal)(amount, token.decimals, undefined, token.displayDecimals);
}
exports.toHumanReadableString = toHumanReadableString;
/**
 * Parses a human-readable decimal string to a raw bigint amount
 *
 * @param amount Amount in base units
 * @param token Token
 *
 * @category Utilities
 */
function fromHumanReadableString(amount, token) {
    if (amount === "" || amount == null)
        return null;
    try {
        return (0, Utils_js_1.fromDecimal)(amount, token.decimals);
    }
    catch (e) {
        return null;
    }
}
exports.fromHumanReadableString = fromHumanReadableString;
