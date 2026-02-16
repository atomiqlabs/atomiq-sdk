
/**
 * Enum representing the direction of a swap (from or to Bitcoin)
 *
 * @category Core
 */
export enum SwapDirection {
    /**
     * Swaps from bitcoin to smart chains (Solana, Starknet, EVM, etc.)
     */
    FROM_BTC=0,
    /**
     * Swaps from smart chains (Solana, Starknet, EVM, etc.) to bitcoin
     */
    TO_BTC=1
}