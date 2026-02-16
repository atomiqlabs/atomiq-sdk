"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapAmountType = void 0;
/**
 * Enum representing whether the swap amount is exact input or exact output
 *
 * @category Core
 */
var SwapAmountType;
(function (SwapAmountType) {
    /**
     * Swap amount specified in the input token
     */
    SwapAmountType[SwapAmountType["EXACT_IN"] = 1] = "EXACT_IN";
    /**
     * Swap amount specified in the output token
     */
    SwapAmountType[SwapAmountType["EXACT_OUT"] = 0] = "EXACT_OUT";
})(SwapAmountType = exports.SwapAmountType || (exports.SwapAmountType = {}));
