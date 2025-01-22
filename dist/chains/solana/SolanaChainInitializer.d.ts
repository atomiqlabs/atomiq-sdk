import { SolanaChainType, SolanaFees, SolanaRetryPolicy, StoredDataAccount } from "@atomiqlabs/chain-solana";
import { IStorageManager } from "@atomiqlabs/base";
import { Connection } from "@solana/web3.js";
import { SdkChain } from "../ChainInitializer";
type SolanaSwapperOptions = {
    rpcUrl: string | Connection;
    dataAccountStorage?: IStorageManager<StoredDataAccount>;
    retryPolicy?: SolanaRetryPolicy;
    btcRelayContract?: string;
    swapContract?: string;
    fees?: SolanaFees;
};
declare const SolanaAssets: {
    readonly WBTC: {
        readonly address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";
        readonly decimals: 8;
    };
    readonly USDC: {
        readonly address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        readonly decimals: 6;
    };
    readonly USDT: {
        readonly address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
        readonly decimals: 6;
    };
    readonly SOL: {
        readonly address: "So11111111111111111111111111111111111111112";
        readonly decimals: 9;
    };
    readonly BONK: {
        readonly address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
        readonly decimals: 5;
    };
};
export type SdkSolanaType = {
    ChainType: SolanaChainType;
    Options: SolanaSwapperOptions;
    Assets: typeof SolanaAssets;
};
export declare const SdkSolana: SdkChain<SdkSolanaType>;
export {};
