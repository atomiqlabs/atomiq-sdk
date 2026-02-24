"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapProtocolInfo = exports.isSwapType = void 0;
const SwapType_1 = require("../enums/SwapType");
/**
 * Type guard to check if a swap is of a specific swap type
 *
 * @category Utilities
 */
function isSwapType(swap, swapType) {
    if (swap == null)
        return false;
    if (swap.getType() === SwapType_1.SwapType.SPV_VAULT_FROM_BTC && swapType === SwapType_1.SwapType.FROM_BTC)
        return true;
    if (swap.getType() === SwapType_1.SwapType.FROM_BTCLN_AUTO && swapType === SwapType_1.SwapType.FROM_BTCLN)
        return true;
    return swap.getType() === swapType;
}
exports.isSwapType = isSwapType;
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
exports.SwapProtocolInfo = {
    [SwapType_1.SwapType.TO_BTC]: {
        requiresInputWallet: true,
        requiresOutputWallet: false,
        supportsGasDrop: false
    },
    [SwapType_1.SwapType.TO_BTCLN]: {
        requiresInputWallet: true,
        requiresOutputWallet: false,
        supportsGasDrop: false
    },
    [SwapType_1.SwapType.FROM_BTC]: {
        requiresInputWallet: false,
        requiresOutputWallet: true,
        supportsGasDrop: false
    },
    [SwapType_1.SwapType.FROM_BTCLN]: {
        requiresInputWallet: false,
        requiresOutputWallet: true,
        supportsGasDrop: false
    },
    [SwapType_1.SwapType.SPV_VAULT_FROM_BTC]: {
        requiresInputWallet: true,
        requiresOutputWallet: false,
        supportsGasDrop: true
    },
    [SwapType_1.SwapType.FROM_BTCLN_AUTO]: {
        requiresInputWallet: false,
        requiresOutputWallet: false,
        supportsGasDrop: true
    },
    [SwapType_1.SwapType.TRUSTED_FROM_BTC]: {
        requiresInputWallet: false,
        requiresOutputWallet: false,
        supportsGasDrop: false
    },
    [SwapType_1.SwapType.TRUSTED_FROM_BTCLN]: {
        requiresInputWallet: false,
        requiresOutputWallet: false,
        supportsGasDrop: false
    }
};
