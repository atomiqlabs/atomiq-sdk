"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIToBTCSwap = exports.isIFromBTCSelfInitSwap = exports.isIEscrowSelfInitSwap = exports.isLnForGasSwap = exports.isOnchainForGasSwap = exports.isToBTCLNSwap = exports.isToBTCSwap = exports.isFromBTCLNAutoSwap = exports.isFromBTCLNSwap = exports.isFromBTCSwap = exports.isSpvFromBTCSwap = void 0;
const SwapType_js_1 = require("../enums/SwapType.js");
/*
 * These type guards deliberately live in their own module, separate from the swap classes
 * they narrow to.
 *
 * A bundler tree-shakes unused *exports*, but it cannot split a single module across
 * chunks: if any export of a module is needed on the eager path, the whole module is
 * placed in the eager chunk. When `isFromBTCSwap` lived inside `FromBTCSwap.ts`, a
 * consumer importing just that three-line guard dragged the entire ~66kB FromBTCSwap
 * class into its eager bundle, even though the class itself is only ever constructed by
 * the lazily-loaded wrapper.
 *
 * Every import above is `import type` (fully erased at compile time) except the SwapType
 * enum, so the emitted module depends on nothing but the enum. Keep it that way: never
 * add a value-level import of a swap class to this file, and never implement a guard here
 * with `instanceof`.
 */
/**
 * Type guard narrowing an {@link ISwap} to a {@link SpvFromBTCSwap} (an SPV-vault
 * Bitcoin -> smart chain swap, {@link SwapType.SPV_VAULT_FROM_BTC}).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
function isSpvFromBTCSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.SPV_VAULT_FROM_BTC;
}
exports.isSpvFromBTCSwap = isSpvFromBTCSwap;
/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCSwap} (a legacy on-chain
 * Bitcoin -> smart chain escrow swap, {@link SwapType.FROM_BTC}).
 *
 * @category Swaps/Legacy/Bitcoin → Smart chain
 */
function isFromBTCSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.FROM_BTC;
}
exports.isFromBTCSwap = isFromBTCSwap;
/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCLNSwap} (a legacy Lightning
 * Bitcoin -> smart chain escrow swap, {@link SwapType.FROM_BTCLN}).
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
function isFromBTCLNSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.FROM_BTCLN;
}
exports.isFromBTCLNSwap = isFromBTCLNSwap;
/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCLNAutoSwap} (an auto-claimed
 * Lightning Bitcoin -> smart chain swap, {@link SwapType.FROM_BTCLN_AUTO}).
 *
 * @category Swaps/Lightning → Smart chain
 */
function isFromBTCLNAutoSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.FROM_BTCLN_AUTO;
}
exports.isFromBTCLNAutoSwap = isFromBTCLNAutoSwap;
/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCSwap} (an on-chain
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTC}).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
function isToBTCSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.TO_BTC;
}
exports.isToBTCSwap = isToBTCSwap;
/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCLNSwap} (a Lightning
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTCLN}).
 *
 * @category Swaps/Smart chain → Lightning
 */
function isToBTCLNSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.TO_BTCLN;
}
exports.isToBTCLNSwap = isToBTCLNSwap;
/**
 * Type guard narrowing an {@link ISwap} to an {@link OnchainForGasSwap} (a trusted on-chain
 * Bitcoin -> smart chain gas top-up swap, {@link SwapType.TRUSTED_FROM_BTC}).
 *
 * @category Swaps/Trusted Gas Swaps
 */
function isOnchainForGasSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.TRUSTED_FROM_BTC;
}
exports.isOnchainForGasSwap = isOnchainForGasSwap;
/**
 * Type guard narrowing an {@link ISwap} to a {@link LnForGasSwap} (a trusted Lightning
 * Bitcoin -> smart chain gas top-up swap, {@link SwapType.TRUSTED_FROM_BTCLN}).
 *
 * @category Swaps/Trusted Gas Swaps
 */
function isLnForGasSwap(swap) {
    return swap.getType() === SwapType_js_1.SwapType.TRUSTED_FROM_BTCLN;
}
exports.isLnForGasSwap = isLnForGasSwap;
/**
 * Type guard narrowing an {@link ISwap} to the {@link IEscrowSelfInitSwap} family
 * (escrow swaps the user must initiate on the smart chain: FROM_BTC, FROM_BTCLN, TO_BTC, TO_BTCLN).
 *
 * @category Swaps/Abstract
 */
function isIEscrowSelfInitSwap(swap) {
    const type = swap.getType();
    switch (type) {
        case SwapType_js_1.SwapType.FROM_BTC:
        case SwapType_js_1.SwapType.FROM_BTCLN:
        case SwapType_js_1.SwapType.TO_BTC:
        case SwapType_js_1.SwapType.TO_BTCLN: return true;
        case SwapType_js_1.SwapType.TRUSTED_FROM_BTC:
        case SwapType_js_1.SwapType.TRUSTED_FROM_BTCLN:
        case SwapType_js_1.SwapType.SPV_VAULT_FROM_BTC:
        case SwapType_js_1.SwapType.FROM_BTCLN_AUTO: return false;
        default: {
            const _exhaustive = type;
            return false;
        }
    }
}
exports.isIEscrowSelfInitSwap = isIEscrowSelfInitSwap;
/**
 * Type guard narrowing an {@link ISwap} to the {@link IFromBTCSelfInitSwap} family
 * (self-initiated escrow swaps from Bitcoin: FROM_BTC, FROM_BTCLN).
 *
 * @category Swaps/Abstract
 */
function isIFromBTCSelfInitSwap(swap) {
    const type = swap.getType();
    switch (type) {
        case SwapType_js_1.SwapType.FROM_BTC:
        case SwapType_js_1.SwapType.FROM_BTCLN: return true;
        case SwapType_js_1.SwapType.TO_BTC:
        case SwapType_js_1.SwapType.TO_BTCLN:
        case SwapType_js_1.SwapType.TRUSTED_FROM_BTC:
        case SwapType_js_1.SwapType.TRUSTED_FROM_BTCLN:
        case SwapType_js_1.SwapType.SPV_VAULT_FROM_BTC:
        case SwapType_js_1.SwapType.FROM_BTCLN_AUTO: return false;
        default: {
            const _exhaustive = type;
            return false;
        }
    }
}
exports.isIFromBTCSelfInitSwap = isIFromBTCSelfInitSwap;
/**
 * Type guard narrowing an {@link ISwap} to the {@link IToBTCSwap} family
 * (escrow swaps sending to Bitcoin: TO_BTC, TO_BTCLN).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
function isIToBTCSwap(swap) {
    const type = swap.getType();
    switch (type) {
        case SwapType_js_1.SwapType.TO_BTC:
        case SwapType_js_1.SwapType.TO_BTCLN: return true;
        case SwapType_js_1.SwapType.FROM_BTC:
        case SwapType_js_1.SwapType.FROM_BTCLN:
        case SwapType_js_1.SwapType.TRUSTED_FROM_BTC:
        case SwapType_js_1.SwapType.TRUSTED_FROM_BTCLN:
        case SwapType_js_1.SwapType.SPV_VAULT_FROM_BTC:
        case SwapType_js_1.SwapType.FROM_BTCLN_AUTO: return false;
        default: {
            const _exhaustive = type;
            return false;
        }
    }
}
exports.isIToBTCSwap = isIToBTCSwap;
