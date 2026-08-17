import {ChainType} from "@atomiqlabs/base";
import {SwapType} from "../enums/SwapType.js";
import {SupportsSwapType} from "../swapper/Swapper.js";
import {SpvFromBTCSwap} from "../swaps/spv_swaps/SpvFromBTCSwap.js";
import {FromBTCSwap} from "../swaps/escrow_swaps/frombtc/onchain/FromBTCSwap.js";
import {FromBTCLNSwap} from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap.js";
import {ToBTCSwap} from "../swaps/escrow_swaps/tobtc/onchain/ToBTCSwap.js";
import {FromBTCLNAutoSwap} from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap.js";
import {ToBTCLNSwap} from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNSwap.js";
import {OnchainForGasSwap} from "../swaps/trusted/onchain/OnchainForGasSwap.js";
import {LnForGasSwap} from "../swaps/trusted/ln/LnForGasSwap.js";
import {ISwap} from "../swaps/ISwap.js";

/**
 * Type mapping from SwapType enum to specific swap class implementations, it is important
 *  to pass the chain type generic, since different chains support different swap protocols
 *  for some directions.
 *
 * @category Utilities
 */
export type SwapTypeMapping<T extends ChainType> = {
    [SwapType.FROM_BTC]: SupportsSwapType<T, SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T> : FromBTCSwap<T>,
    [SwapType.FROM_BTCLN]: SupportsSwapType<T, SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T> : FromBTCLNSwap<T>,
    [SwapType.TO_BTC]: ToBTCSwap<T>,
    [SwapType.TO_BTCLN]: ToBTCLNSwap<T>,
    [SwapType.TRUSTED_FROM_BTC]: OnchainForGasSwap<T>,
    [SwapType.TRUSTED_FROM_BTCLN]: LnForGasSwap<T>,
    [SwapType.SPV_VAULT_FROM_BTC]: SpvFromBTCSwap<T>,
    [SwapType.FROM_BTCLN_AUTO]: FromBTCLNAutoSwap<T>
};

/**
 * Type guard to check if a swap is of a specific swap type
 *
 * @category Utilities
 */
export function isSwapType<T extends ChainType, S extends SwapType>(swap: ISwap<T>, swapType: S): swap is SwapTypeMapping<T>[S] {
    if(swap==null) return false;
    if(swap.getType()===SwapType.SPV_VAULT_FROM_BTC && swapType===SwapType.FROM_BTC) return true;
    if(swap.getType()===SwapType.FROM_BTCLN_AUTO && swapType===SwapType.FROM_BTCLN) return true;
    return swap.getType()===swapType;
}

/**
 * Helper information about various swap protocol and their features:
 * - `requiresInputWallet`: Whether a swap requires a connected wallet on the input chain able to sign
 *  arbitrary transaction
 * - `requiresOutputWallet`: Whether a swap requires a connected wallet on the output chain able to sign
 *  arbitrary transactions
 * - `supportsGasDrop`: Whether a swap supports the "gas drop" feature, allowing to user to receive a small
 *  amount of native token as part of the swap when swapping to smart chains
 *
 * @category Core
 */
export const SwapProtocolInfo = {
    [SwapType.TO_BTC]: {
        requiresInputWallet: true,
        requiresOutputWallet: false,
        supportsGasDrop: false
    },
    [SwapType.TO_BTCLN]: {
        requiresInputWallet: true,
        requiresOutputWallet: false,
        supportsGasDrop: false
    },
    [SwapType.FROM_BTC]: {
        requiresInputWallet: false,
        requiresOutputWallet: true,
        supportsGasDrop: false
    },
    [SwapType.FROM_BTCLN]: {
        requiresInputWallet: false,
        requiresOutputWallet: true,
        supportsGasDrop: false
    },
    [SwapType.SPV_VAULT_FROM_BTC]: {
        requiresInputWallet: true,
        requiresOutputWallet: false,
        supportsGasDrop: true
    },
    [SwapType.FROM_BTCLN_AUTO]: {
        requiresInputWallet: false,
        requiresOutputWallet: false,
        supportsGasDrop: true
    },
    [SwapType.TRUSTED_FROM_BTC]: {
        requiresInputWallet: false,
        requiresOutputWallet: false,
        supportsGasDrop: false
    },
    [SwapType.TRUSTED_FROM_BTCLN]: {
        requiresInputWallet: false,
        requiresOutputWallet: false,
        supportsGasDrop: false
    }
} as const satisfies Record<SwapType, {
    requiresInputWallet: boolean,
    requiresOutputWallet: boolean,
    supportsGasDrop: boolean
}>;