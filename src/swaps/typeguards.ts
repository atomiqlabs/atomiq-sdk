import type {ChainType} from "@atomiqlabs/base";
import {SwapType} from "../enums/SwapType.js";
import type {ISwap} from "./ISwap.js";
import type {SpvFromBTCSwap} from "./spv_swaps/SpvFromBTCSwap.js";
import type {FromBTCSwap} from "./escrow_swaps/frombtc/onchain/FromBTCSwap.js";
import type {FromBTCLNSwap} from "./escrow_swaps/frombtc/ln/FromBTCLNSwap.js";
import type {FromBTCLNAutoSwap} from "./escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap.js";
import type {ToBTCSwap} from "./escrow_swaps/tobtc/onchain/ToBTCSwap.js";
import type {ToBTCLNSwap} from "./escrow_swaps/tobtc/ln/ToBTCLNSwap.js";
import type {OnchainForGasSwap} from "./trusted/onchain/OnchainForGasSwap.js";
import type {LnForGasSwap} from "./trusted/ln/LnForGasSwap.js";
import type {IEscrowSelfInitSwap} from "./escrow_swaps/IEscrowSelfInitSwap.js";
import type {IFromBTCSelfInitSwap} from "./escrow_swaps/frombtc/IFromBTCSelfInitSwap.js";
import type {IToBTCSwap} from "./escrow_swaps/tobtc/IToBTCSwap.js";

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
export function isSpvFromBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is SpvFromBTCSwap<T> {
    return swap.getType() === SwapType.SPV_VAULT_FROM_BTC;
}

/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCSwap} (a legacy on-chain
 * Bitcoin -> smart chain escrow swap, {@link SwapType.FROM_BTC}).
 *
 * @category Swaps/Legacy/Bitcoin → Smart chain
 */
export function isFromBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is FromBTCSwap<T> {
    return swap.getType() === SwapType.FROM_BTC;
}

/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCLNSwap} (a legacy Lightning
 * Bitcoin -> smart chain escrow swap, {@link SwapType.FROM_BTCLN}).
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export function isFromBTCLNSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is FromBTCLNSwap<T> {
    return swap.getType() === SwapType.FROM_BTCLN;
}

/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCLNAutoSwap} (an auto-claimed
 * Lightning Bitcoin -> smart chain swap, {@link SwapType.FROM_BTCLN_AUTO}).
 *
 * @category Swaps/Lightning → Smart chain
 */
export function isFromBTCLNAutoSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is FromBTCLNAutoSwap<T> {
    return swap.getType() === SwapType.FROM_BTCLN_AUTO;
}

/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCSwap} (an on-chain
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTC}).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export function isToBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is ToBTCSwap<T> {
    return swap.getType() === SwapType.TO_BTC;
}

/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCLNSwap} (a Lightning
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTCLN}).
 *
 * @category Swaps/Smart chain → Lightning
 */
export function isToBTCLNSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is ToBTCLNSwap<T> {
    return swap.getType() === SwapType.TO_BTCLN;
}

/**
 * Type guard narrowing an {@link ISwap} to an {@link OnchainForGasSwap} (a trusted on-chain
 * Bitcoin -> smart chain gas top-up swap, {@link SwapType.TRUSTED_FROM_BTC}).
 *
 * @category Swaps/Trusted Gas Swaps
 */
export function isOnchainForGasSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is OnchainForGasSwap<T> {
    return swap.getType() === SwapType.TRUSTED_FROM_BTC;
}

/**
 * Type guard narrowing an {@link ISwap} to a {@link LnForGasSwap} (a trusted Lightning
 * Bitcoin -> smart chain gas top-up swap, {@link SwapType.TRUSTED_FROM_BTCLN}).
 *
 * @category Swaps/Trusted Gas Swaps
 */
export function isLnForGasSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is LnForGasSwap<T> {
    return swap.getType() === SwapType.TRUSTED_FROM_BTCLN;
}

/**
 * Type guard narrowing an {@link ISwap} to the {@link IEscrowSelfInitSwap} family
 * (escrow swaps the user must initiate on the smart chain: FROM_BTC, FROM_BTCLN, TO_BTC, TO_BTCLN).
 *
 * @category Swaps/Abstract
 */
export function isIEscrowSelfInitSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is IEscrowSelfInitSwap<T> {
    const type = swap.getType();
    switch (type) {
        case SwapType.FROM_BTC: case SwapType.FROM_BTCLN:
        case SwapType.TO_BTC:   case SwapType.TO_BTCLN:   return true;
        case SwapType.TRUSTED_FROM_BTC: case SwapType.TRUSTED_FROM_BTCLN:
        case SwapType.SPV_VAULT_FROM_BTC: case SwapType.FROM_BTCLN_AUTO: return false;
        default: { const _exhaustive: never = type; return false; }
    }
}

/**
 * Type guard narrowing an {@link ISwap} to the {@link IFromBTCSelfInitSwap} family
 * (self-initiated escrow swaps from Bitcoin: FROM_BTC, FROM_BTCLN).
 *
 * @category Swaps/Abstract
 */
export function isIFromBTCSelfInitSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is IFromBTCSelfInitSwap<T> {
    const type = swap.getType();
    switch (type) {
        case SwapType.FROM_BTC: case SwapType.FROM_BTCLN: return true;
        case SwapType.TO_BTC:   case SwapType.TO_BTCLN:
        case SwapType.TRUSTED_FROM_BTC: case SwapType.TRUSTED_FROM_BTCLN:
        case SwapType.SPV_VAULT_FROM_BTC: case SwapType.FROM_BTCLN_AUTO: return false;
        default: { const _exhaustive: never = type; return false; }
    }
}

/**
 * Type guard narrowing an {@link ISwap} to the {@link IToBTCSwap} family
 * (escrow swaps sending to Bitcoin: TO_BTC, TO_BTCLN).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export function isIToBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is IToBTCSwap<T> {
    const type = swap.getType();
    switch (type) {
        case SwapType.TO_BTC:   case SwapType.TO_BTCLN:   return true;
        case SwapType.FROM_BTC: case SwapType.FROM_BTCLN:
        case SwapType.TRUSTED_FROM_BTC: case SwapType.TRUSTED_FROM_BTCLN:
        case SwapType.SPV_VAULT_FROM_BTC: case SwapType.FROM_BTCLN_AUTO: return false;
        default: { const _exhaustive: never = type; return false; }
    }
}
