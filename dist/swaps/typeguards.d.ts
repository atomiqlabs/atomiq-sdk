import type { ChainType } from "@atomiqlabs/base";
import type { ISwap } from "./ISwap.js";
import type { SpvFromBTCSwap } from "./spv_swaps/SpvFromBTCSwap.js";
import type { FromBTCSwap } from "./escrow_swaps/frombtc/onchain/FromBTCSwap.js";
import type { FromBTCLNSwap } from "./escrow_swaps/frombtc/ln/FromBTCLNSwap.js";
import type { FromBTCLNAutoSwap } from "./escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap.js";
import type { ToBTCSwap } from "./escrow_swaps/tobtc/onchain/ToBTCSwap.js";
import type { ToBTCLNSwap } from "./escrow_swaps/tobtc/ln/ToBTCLNSwap.js";
import type { OnchainForGasSwap } from "./trusted/onchain/OnchainForGasSwap.js";
import type { LnForGasSwap } from "./trusted/ln/LnForGasSwap.js";
import type { IEscrowSelfInitSwap } from "./escrow_swaps/IEscrowSelfInitSwap.js";
import type { IFromBTCSelfInitSwap } from "./escrow_swaps/frombtc/IFromBTCSelfInitSwap.js";
import type { IToBTCSwap } from "./escrow_swaps/tobtc/IToBTCSwap.js";
/**
 * Type guard narrowing an {@link ISwap} to a {@link SpvFromBTCSwap} (an SPV-vault
 * Bitcoin -> smart chain swap, {@link SwapType.SPV_VAULT_FROM_BTC}).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
export declare function isSpvFromBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is SpvFromBTCSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCSwap} (a legacy on-chain
 * Bitcoin -> smart chain escrow swap, {@link SwapType.FROM_BTC}).
 *
 * @category Swaps/Legacy/Bitcoin → Smart chain
 */
export declare function isFromBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is FromBTCSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCLNSwap} (a legacy Lightning
 * Bitcoin -> smart chain escrow swap, {@link SwapType.FROM_BTCLN}).
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export declare function isFromBTCLNSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is FromBTCLNSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to a {@link FromBTCLNAutoSwap} (an auto-claimed
 * Lightning Bitcoin -> smart chain swap, {@link SwapType.FROM_BTCLN_AUTO}).
 *
 * @category Swaps/Lightning → Smart chain
 */
export declare function isFromBTCLNAutoSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is FromBTCLNAutoSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCSwap} (an on-chain
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTC}).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare function isToBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is ToBTCSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCLNSwap} (a Lightning
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTCLN}).
 *
 * @category Swaps/Smart chain → Lightning
 */
export declare function isToBTCLNSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is ToBTCLNSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to an {@link OnchainForGasSwap} (a trusted on-chain
 * Bitcoin -> smart chain gas top-up swap, {@link SwapType.TRUSTED_FROM_BTC}).
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare function isOnchainForGasSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is OnchainForGasSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to a {@link LnForGasSwap} (a trusted Lightning
 * Bitcoin -> smart chain gas top-up swap, {@link SwapType.TRUSTED_FROM_BTCLN}).
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare function isLnForGasSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is LnForGasSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to the {@link IEscrowSelfInitSwap} family
 * (escrow swaps the user must initiate on the smart chain: FROM_BTC, FROM_BTCLN, TO_BTC, TO_BTCLN).
 *
 * @category Swaps/Abstract
 */
export declare function isIEscrowSelfInitSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is IEscrowSelfInitSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to the {@link IFromBTCSelfInitSwap} family
 * (self-initiated escrow swaps from Bitcoin: FROM_BTC, FROM_BTCLN).
 *
 * @category Swaps/Abstract
 */
export declare function isIFromBTCSelfInitSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is IFromBTCSelfInitSwap<T>;
/**
 * Type guard narrowing an {@link ISwap} to the {@link IToBTCSwap} family
 * (escrow swaps sending to Bitcoin: TO_BTC, TO_BTCLN).
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export declare function isIToBTCSwap<T extends ChainType = ChainType>(swap: ISwap<T>): swap is IToBTCSwap<T>;
