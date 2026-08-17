/**
 * Enum representing the direction of a swap (from or to Bitcoin)
 *
 * @category Core
 */
export var SwapDirection;
(function (SwapDirection) {
    /**
     * Swaps from bitcoin to smart chains (Solana, Starknet, EVM, etc.)
     */
    SwapDirection[SwapDirection["FROM_BTC"] = 0] = "FROM_BTC";
    /**
     * Swaps from smart chains (Solana, Starknet, EVM, etc.) to bitcoin
     */
    SwapDirection[SwapDirection["TO_BTC"] = 1] = "TO_BTC";
})(SwapDirection = SwapDirection || (SwapDirection = {}));
