"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapAmountType = void 0;
/**
 * Enum representing whether the swap amount is exact input or exact output
 * @category Core
 */
var SwapAmountType;
(function (SwapAmountType) {
    SwapAmountType[SwapAmountType["EXACT_IN"] = 1] = "EXACT_IN";
    SwapAmountType[SwapAmountType["EXACT_OUT"] = 0] = "EXACT_OUT";
})(SwapAmountType = exports.SwapAmountType || (exports.SwapAmountType = {}));
