"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapType = void 0;
/**
 * Enum representing different types of swap protocols used by atomiq.
 *
 * @category Core
 */
var SwapType;
(function (SwapType) {
    /**
     * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation of the swap
     *  on the destination chain.
     *
     * Handled by {@link FromBTCWrapper} & {@link FromBTCSwap}.
     *
     * Legacy swaps are only used on Solana!
     */
    SwapType[SwapType["FROM_BTC"] = 0] = "FROM_BTC";
    /**
     * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement of the swap on the
     *  destination network once the lightning network payment is received by the LP
     *
     * Handled by {@link FromBTCLNWrapper} & {@link FromBTCLNSwap}.
     *
     * Legacy swaps are only used on Solana!
     */
    SwapType[SwapType["FROM_BTCLN"] = 1] = "FROM_BTCLN";
    /**
     * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
     *
     * Handled by {@link ToBTCWrapper} & {@link ToBTCSwap}.
     */
    SwapType[SwapType["TO_BTC"] = 2] = "TO_BTC";
    /**
     * Escrow based (HTLC) swap for Smart chains -> Bitcoin Lightning
     *
     * Handled by {@link ToBTCLNWrapper} & {@link ToBTCLNSwap}.
     */
    SwapType[SwapType["TO_BTCLN"] = 3] = "TO_BTCLN";
    /**
     * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the destination
     *  chain, which is only needed for Solana, which still uses legacy swaps and doesn't support newer
     *  {@link SPV_VAULT_FROM_BTC} & {@link FROM_BTCLN_AUTO} swaps.
     *
     * Handled by {@link OnchainForGasWrapper} & {@link OnchainForGasSwap}.
     */
    SwapType[SwapType["TRUSTED_FROM_BTC"] = 4] = "TRUSTED_FROM_BTC";
    /**
     * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on the
     *  destination chain, which is only needed for Solana, which still uses legacy swaps and doesn't support newer
     *  {@link SPV_VAULT_FROM_BTC} & {@link FROM_BTCLN_AUTO} swaps.
     *
     * Handled by {@link LnForGasWrapper} & {@link LnForGasSwap}.
     */
    SwapType[SwapType["TRUSTED_FROM_BTCLN"] = 5] = "TRUSTED_FROM_BTCLN";
    /**
     * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring any
     *  initiation on the destination chain, and with the added possibility for the user to receive a
     *  native token on the destination chain as part of the swap (a "gas drop" feature).
     *
     * Handled by {@link SpvFromBTCWrapper} & {@link SpvFromBTCSwap}.
     *
     * Used on all the supported chains except Solana!
     */
    SwapType[SwapType["SPV_VAULT_FROM_BTC"] = 6] = "SPV_VAULT_FROM_BTC";
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
    SwapType[SwapType["FROM_BTCLN_AUTO"] = 7] = "FROM_BTCLN_AUTO";
})(SwapType = exports.SwapType || (exports.SwapType = {}));
