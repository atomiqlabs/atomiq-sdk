/**
 * Enum representing the side of the swap for querying available input/output tokens
 *
 * @category Core
 */
export var SwapSide;
(function (SwapSide) {
    /**
     * Represents input / source side of the swap
     */
    SwapSide[SwapSide["INPUT"] = 1] = "INPUT";
    /**
     * Represents output / destination side of the swap
     */
    SwapSide[SwapSide["OUTPUT"] = 0] = "OUTPUT";
})(SwapSide || (SwapSide = {}));
