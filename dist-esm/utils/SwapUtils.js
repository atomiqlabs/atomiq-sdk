import { SwapType } from "../enums/SwapType";
/**
 * Type guard to check if a swap is of a specific swap type
 *
 * @category Utilities
 */
export function isSwapType(swap, swapType) {
    if (swap == null)
        return false;
    if (swap.getType() === SwapType.SPV_VAULT_FROM_BTC && swapType === SwapType.FROM_BTC)
        return true;
    if (swap.getType() === SwapType.FROM_BTCLN_AUTO && swapType === SwapType.FROM_BTCLN)
        return true;
    return swap.getType() === swapType;
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
};
