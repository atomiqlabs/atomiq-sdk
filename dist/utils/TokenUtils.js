"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromHumanReadableString = exports.toHumanReadableString = void 0;
const Utils_1 = require("./Utils");
function toHumanReadableString(amount, currencySpec) {
    if (amount == null)
        return "";
    return (0, Utils_1.toDecimal)(amount, currencySpec.decimals, undefined, currencySpec.displayDecimals);
}
exports.toHumanReadableString = toHumanReadableString;
function fromHumanReadableString(amount, currencySpec) {
    if (amount === "" || amount == null)
        return null;
    try {
        return (0, Utils_1.fromDecimal)(amount, currencySpec.decimals);
    }
    catch (e) {
        return null;
    }
}
exports.fromHumanReadableString = fromHumanReadableString;
