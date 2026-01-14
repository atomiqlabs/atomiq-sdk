import { ChainType, StorageObject, IStorageManager, Messenger, ChainInitializer } from "@atomiqlabs/base";
import { Swapper, SwapperOptions } from "./Swapper";
import { MempoolApi } from "../bitcoin/mempool/MempoolApi";
import { MempoolBitcoinRpc } from "../bitcoin/mempool/MempoolBitcoinRpc";
import { BtcToken, SCToken } from "../types/Token";
import { SwapType } from "../enums/SwapType";
import { SwapTypeMapping } from "../utils/SwapUtils";
import { CustomPriceFunction } from "../types/CustomPriceFunction";
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
export type TypedSwapperOptions<T extends readonly ChainInitializer<any, any, any>[]> = {
    chains: GetAllOptions<T>;
    chainStorageCtor?: <T extends StorageObject>(name: string) => IStorageManager<T>;
    pricingFeeDifferencePPM?: bigint;
    getPriceFn?: CustomPriceFunction;
    mempoolApi?: MempoolApi | MempoolBitcoinRpc | string | string[];
    messenger?: Messenger;
} & SwapperOptions;
export type TypedChainTokenResolver<T extends ChainInitializer<any, any, any>> = {
    getToken: (address: string) => SCToken<T["chainId"]>;
};
export type TypedTokenResolvers<T extends readonly ChainInitializer<any, any, any>[]> = (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]] ? TokenResolverDict<First> & TypedTokenResolvers<Rest> : unknown);
export type TypedChainTokens<T extends ChainInitializer<any, any, any>> = {
    [val in keyof T["tokens"]]: SCToken<T["chainId"]>;
};
export type TypedTokens<T extends readonly ChainInitializer<any, ChainType, any>[]> = GetAllTokens<T> & {
    BITCOIN: {
        BTC: BtcToken<false>;
        BTCLN: BtcToken<true>;
    };
};
export type TypedSwapper<T extends readonly ChainInitializer<any, ChainType, any>[]> = Swapper<ToMultichain<T>>;
export type TypedSwap<T extends ChainInitializer<any, ChainType, any>, S extends SwapType> = SwapTypeMapping<T["chainType"]>[S];
export declare class SwapperFactory<T extends readonly ChainInitializer<any, ChainType, any>[]> {
    readonly initializers: T;
    Tokens: TypedTokens<T>;
    TokenResolver: TypedTokenResolvers<T>;
    constructor(initializers: T);
    newSwapper(options: TypedSwapperOptions<T>): TypedSwapper<T>;
    newSwapperInitialized(options: TypedSwapperOptions<T>): Promise<TypedSwapper<T>>;
}
export {};
