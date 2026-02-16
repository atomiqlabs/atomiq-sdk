"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapDirection = void 0;
/**
 * Enum representing the direction of a swap (from or to Bitcoin)
 *
 * @category Core
 */
var SwapDirection;
(function (SwapDirection) {
    /**
     * Swaps from bitcoin to smart chains (Solana, Starknet, EVM, etc.)
     */
    SwapDirection[SwapDirection["FROM_BTC"] = 0] = "FROM_BTC";
    /**
     * Swaps from smart chains (Solana, Starknet, EVM, etc.) to bitcoin
     */
    SwapDirection[SwapDirection["TO_BTC"] = 1] = "TO_BTC";
})(SwapDirection = exports.SwapDirection || (exports.SwapDirection = {}));
