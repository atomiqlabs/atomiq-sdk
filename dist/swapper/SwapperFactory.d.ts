import { ChainType, StorageObject, IStorageManager, Messenger, ChainInitializer } from "@atomiqlabs/base";
import { Swapper, SwapperOptions } from "./Swapper";
import { BtcToken, SCToken } from "../types/Token";
import { SwapType } from "../enums/SwapType";
import { SwapTypeMapping } from "../utils/SwapUtils";
import { CustomPriceFunction } from "../types/CustomPriceFunction";
import { MempoolApi, MempoolBitcoinRpc } from "@atomiqlabs/btc-mempool";
/**
 * Token definitions for a specific chain
 */
type TypedChainTokens<T extends ChainInitializer<any, any, any>> = {
    [val in keyof T["tokens"]]: SCToken<T["chainId"]>;
};
/**
 * Token resolver for a specific chain
 */
type TypedChainTokenResolver<T extends ChainInitializer<any, any, any>> = {
    getToken: (address: string) => SCToken<T["chainId"]>;
};
type ChainTypeDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: T["chainType"];
};
type ToMultichain<T extends readonly ChainInitializer<any, any, any>[]> = (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]] ? ChainTypeDict<First> & ToMultichain<Rest> : {});
type TokensDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokens<T>;
};
type GetAllTokens<T extends readonly ChainInitializer<any, any, any>[]> = (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]] ? TokensDict<First> & GetAllTokens<Rest> : unknown);
type TokenResolverDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokenResolver<T>;
};
type OptionsDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: T["options"];
};
type GetAllOptions<T extends readonly ChainInitializer<any, any, any>[]> = (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]] ? OptionsDict<First> & GetAllOptions<Rest> : unknown);
/**
 * Configuration options for creating a Swapper instance
 *
 * @category Core
 */
export type TypedSwapperOptions<T extends readonly ChainInitializer<any, any, any>[]> = {
    chains: GetAllOptions<T>;
    chainStorageCtor?: <T extends StorageObject>(name: string) => IStorageManager<T>;
    pricingFeeDifferencePPM?: bigint;
    getPriceFn?: CustomPriceFunction;
    mempoolApi?: MempoolApi | MempoolBitcoinRpc | string | string[];
    messenger?: Messenger;
} & SwapperOptions;
/**
 * Token resolvers for all chains, resolve tokens based on their address
 *
 * @category Core
 */
export type TypedTokenResolvers<T extends readonly ChainInitializer<any, any, any>[]> = (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]] ? TokenResolverDict<First> & TypedTokenResolvers<Rest> : unknown);
/**
 * All tokens including Bitcoin tokens
 *
 * @category Core
 */
export type TypedTokens<T extends readonly ChainInitializer<any, ChainType, any>[]> = GetAllTokens<T> & {
    BITCOIN: {
        BTC: BtcToken<false>;
        BTCLN: BtcToken<true>;
    };
};
/**
 * Type alias for a Swapper instance with typed chain support
 *
 * @category Core
 */
export type TypedSwapper<T extends readonly ChainInitializer<any, ChainType, any>[]> = Swapper<ToMultichain<T>>;
/**
 * Type alias for a specific swap type
 *
 * @category Core
 */
export type TypedSwap<T extends ChainInitializer<any, ChainType, any>, S extends SwapType> = SwapTypeMapping<T["chainType"]>[S];
/**
 * Factory class for creating and initializing Swapper instances with typed chain support
 *
 * @category Core
 */
export declare class SwapperFactory<T extends readonly ChainInitializer<any, ChainType, any>[]> {
    readonly initializers: T;
    /**
     * All available tokens for the atomiq SDK
     */
    Tokens: TypedTokens<T>;
    /**
     * Token resolvers for various smart chains supported by the SDK, allow fetching tokens based on their addresses
     */
    TokenResolver: TypedTokenResolvers<T>;
    constructor(initializers: T);
    /**
     * Returns a new swapper instance with the passed options.
     *
     * The swapper returned here is not yet initialized, be sure to call {@link Swapper.init}, before
     *  calling any other functions in the swapper instance.
     *
     * @param options Options for customizing the swapper instance
     */
    newSwapper(options: TypedSwapperOptions<T>): TypedSwapper<T>;
    /**
     * Returns a new and already initialized swapper instance with the passed options. There is no need
     *  to call {@link Swapper.init} anymore.
     *
     * @param options Options for customizing the swapper instance
     */
    newSwapperInitialized(options: TypedSwapperOptions<T>): Promise<TypedSwapper<T>>;
}
export {};
