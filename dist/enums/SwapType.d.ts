/**
 * Enum representing different types of swap protocols used by atomiq.
 *
 * @category Core
 */
export declare enum SwapType {
    /**
     * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation of the swap
     *  on the destination chain.
     *
     * Handled by {@link FromBTCWrapper} & {@link FromBTCSwap}.
     *
     * Legacy swaps are only used on Solana!
     */
    FROM_BTC = 0,
    /**
     * Legacy swap HTLC for Bitcoin Lightning -> Smart chains, requires manual settlement of the swap on the
     *  destination network once the lightning network payment is received by the LP
     *
     * Handled by {@link FromBTCLNWrapper} & {@link FromBTCLNSwap}.
     *
     * Legacy swaps are only used on Solana!
     */
    FROM_BTCLN = 1,
    /**
     * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
     *
     * Handled by {@link ToBTCWrapper} & {@link ToBTCSwap}.
     */
    TO_BTC = 2,
    /**
     * Escrow based (HTLC) swap for Smart chains -> Bitcoin Lightning
     *
     * Handled by {@link ToBTCLNWrapper} & {@link ToBTCLNSwap}.
     */
    TO_BTCLN = 3,
    /**
     * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the destination
     *  chain, which is only needed for Solana, which still uses legacy swaps and doesn't support newer
     *  {@link SPV_VAULT_FROM_BTC} & {@link FROM_BTCLN_AUTO} swaps.
     *
     * Handled by {@link OnchainForGasWrapper} & {@link OnchainForGasSwap}.
     */
    TRUSTED_FROM_BTC = 4,
    /**
     * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on the
     *  destination chain, which is only needed for Solana, which still uses legacy swaps and doesn't support newer
     *  {@link SPV_VAULT_FROM_BTC} & {@link FROM_BTCLN_AUTO} swaps.
     *
     * Handled by {@link LnForGasWrapper} & {@link LnForGasSwap}.
     */
    TRUSTED_FROM_BTCLN = 5,
    /**
     * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring any
     *  initiation on the destination chain, and with the added possibility for the user to receive a
     *  native token on the destination chain as part of the swap (a "gas drop" feature).
     *
     * Handled by {@link SpvFromBTCWrapper} & {@link SpvFromBTCSwap}.
     *
     * Used on all the supported chains except Solana!
     */
    SPV_VAULT_FROM_BTC = 6,
    /**
     * New escrow based (HTLC) swaps for Bitcoin Lightning -> Smart chain swaps not requiring manual
     *  settlement on the destination by the user, and instead letting the LP initiate the escrow,
     *  with the permissionless watchtower network managing the claiming of HTLC, with the swap secret
     *  broadcasted over Nostr. Also adds a possibility for the user to receive a native token on the
     *  destination chain as part of the swap (a "gas drop" feature).
     *
     * Handled by {@link FromBTCLNAutoWrapper} & {@link FromBTCLNAutoSwap}.
     *
     * Used on all the supported chains except Solana!
     */
    FROM_BTCLN_AUTO = 7
}
