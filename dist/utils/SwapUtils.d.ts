import { ChainType } from "@atomiqlabs/base";
import { SwapType } from "../enums/SwapType";
import { SupportsSwapType } from "../swapper/Swapper";
import { SpvFromBTCSwap } from "../swaps/spv_swaps/SpvFromBTCSwap";
import { FromBTCSwap } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCSwap";
import { FromBTCLNSwap } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap";
import { ToBTCSwap } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCSwap";
import { FromBTCLNAutoSwap } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap";
import { ToBTCLNSwap } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNSwap";
import { OnchainForGasSwap } from "../swaps/trusted/onchain/OnchainForGasSwap";
import { LnForGasSwap } from "../swaps/trusted/ln/LnForGasSwap";
import { ISwap } from "../swaps/ISwap";
/**
 * Type mapping from SwapType enum to specific swap class implementations, it is important
 *  to pass the chain type generic, since different chains support different swap protocols
 *  for some directions.
 *
 * @category Utilities
 */
export type SwapTypeMapping<T extends ChainType> = {
    [SwapType.FROM_BTC]: SupportsSwapType<T, SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T> : FromBTCSwap<T>;
    [SwapType.FROM_BTCLN]: SupportsSwapType<T, SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T> : FromBTCLNSwap<T>;
    [SwapType.TO_BTC]: ToBTCSwap<T>;
    [SwapType.TO_BTCLN]: ToBTCLNSwap<T>;
    [SwapType.TRUSTED_FROM_BTC]: OnchainForGasSwap<T>;
    [SwapType.TRUSTED_FROM_BTCLN]: LnForGasSwap<T>;
    [SwapType.SPV_VAULT_FROM_BTC]: SpvFromBTCSwap<T>;
    [SwapType.FROM_BTCLN_AUTO]: FromBTCLNAutoSwap<T>;
};
/**
 * Type guard to check if a swap is of a specific swap type
 *
 * @category Utilities
 */
export declare function isSwapType<T extends ChainType, S extends SwapType>(swap: ISwap<T>, swapType: S): swap is SwapTypeMapping<T>[S];
/**
 * Helper information about various swap protocol and their features:
 * - `requiresInputWallet`: Whether a swap requires a connected wallet on the input chain able to sign
 *  arbitrary transaction
 * - `requiresOutputWallet`: Whether a swap requires a connected wallet on the output chain able to sign
 *  arbitrary transactions
 * - `supportsGasDrop`: Whether a swap supports the "gas drop" feature, allowing to user to receive a small
 *  amount of native token as part of the swap when swapping to smart chains
 */
export declare const SwapProtocolInfo: {
    readonly 2: {
        readonly requiresInputWallet: true;
        readonly requiresOutputWallet: false;
        readonly supportsGasDrop: false;
    };
    readonly 3: {
        readonly requiresInputWallet: true;
        readonly requiresOutputWallet: false;
        readonly supportsGasDrop: false;
    };
    readonly 0: {
        readonly requiresInputWallet: false;
        readonly requiresOutputWallet: true;
        readonly supportsGasDrop: false;
    };
    readonly 1: {
        readonly requiresInputWallet: false;
        readonly requiresOutputWallet: true;
        readonly supportsGasDrop: false;
    };
    readonly 6: {
        readonly requiresInputWallet: true;
        readonly requiresOutputWallet: false;
        readonly supportsGasDrop: true;
    };
    readonly 7: {
        readonly requiresInputWallet: false;
        readonly requiresOutputWallet: false;
        readonly supportsGasDrop: true;
    };
    readonly 4: {
        readonly requiresInputWallet: false;
        readonly requiresOutputWallet: false;
        readonly supportsGasDrop: false;
    };
    readonly 5: {
        readonly requiresInputWallet: false;
        readonly requiresOutputWallet: false;
        readonly supportsGasDrop: false;
    };
};
