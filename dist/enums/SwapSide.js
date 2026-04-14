"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapSide = void 0;
/**
 * Enum representing the side of the swap for querying available input/output tokens
 *
 * @category Core
 */
var SwapSide;
(function (SwapSide) {
    /**
     * Represents input / source side of the swap
     */
    SwapSide[SwapSide["INPUT"] = 1] = "INPUT";
    /**
     * Represents output / destination side of the swap
     */
    SwapSide[SwapSide["OUTPUT"] = 0] = "OUTPUT";
})(SwapSide = exports.SwapSide || (exports.SwapSide = {}));
