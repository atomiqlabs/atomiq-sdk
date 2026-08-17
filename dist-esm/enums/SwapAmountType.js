/**
 * Enum representing whether the swap amount is exact input or exact output
 *
 * @category Core
 */
export var SwapAmountType;
(function (SwapAmountType) {
    /**
     * Swap amount specified in the input token
     */
    SwapAmountType[SwapAmountType["EXACT_IN"] = 1] = "EXACT_IN";
    /**
     * Swap amount specified in the output token
     */
    SwapAmountType[SwapAmountType["EXACT_OUT"] = 0] = "EXACT_OUT";
})(SwapAmountType || (SwapAmountType = {}));
