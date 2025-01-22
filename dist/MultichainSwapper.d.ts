import { BtcToken, SCToken, Swapper, SwapperOptions } from "@atomiqlabs/sdk-lib";
import { SdkSolanaType } from "./chains/solana/SolanaChainInitializer";
import { SdkChain } from "./chains/ChainInitializer";
import * as BN from "bn.js";
import { IStorageManager, StorageObject } from "@atomiqlabs/base";
import { SwapperWithChain } from "@atomiqlabs/sdk-lib/dist/swaps/SwapperWithChain";
import { SwapperWithSigner } from "@atomiqlabs/sdk-lib/dist/swaps/SwapperWithSigner";
type Chains = {
    "SOLANA": SdkSolanaType;
};
declare const Chains: {
    [C in keyof Chains]: SdkChain<Chains[C]>;
};
export type SdkMultichain = {
    [C in keyof Chains]: Chains[C]["ChainType"];
};
export type MultichainSwapperOptions = SwapperOptions & {
    chains: {
        [C in keyof Chains]: Chains[C]["Options"];
    };
} & {
    storageCtor?: <T extends StorageObject>(name: string) => IStorageManager<T>;
    pricingFeeDifferencePPM?: BN;
};
export declare class MultichainSwapper extends Swapper<SdkMultichain> {
    constructor(options: MultichainSwapperOptions);
}
export declare const Tokens: {
    [C in keyof Chains]: {
        [T in keyof Chains[C]["Assets"]]: SCToken<C>;
    };
} & {
    BITCOIN: {
        BTC: BtcToken<false>;
        BTCLN: BtcToken<true>;
    };
};
export declare const TokenResolver: {
    [C in keyof Chains]: {
        getToken(address: string): SCToken<C>;
    };
};
export type SolanaSwapper = SwapperWithChain<SdkMultichain, "SOLANA">;
export type SolanaSwapperWithSigner = SwapperWithSigner<SdkMultichain, "SOLANA">;
export {};
