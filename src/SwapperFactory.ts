/**
 * @module SwapperFactory
 * Factory aaaa for creating typed Swapper instances with multi-chain support.
 */

import {
    ChainData,
    BitcoinNetwork,
    BitcoinRpc,
    BaseTokenType,
    ChainType,
    StorageObject,
    IStorageManager, Messenger
} from "@atomiqlabs/base";
import {
    BitcoinTokens,
    BtcToken, CustomPriceFunction, CustomPriceProvider,
    MempoolApi,
    MempoolBitcoinRpc, RedundantSwapPrice,
    RedundantSwapPriceAssets, SCToken, SingleSwapPrice, Swapper,
    SwapperOptions, SwapType, SwapTypeMapping
} from "@atomiqlabs/sdk-lib";
import {SmartChainAssets, SmartChainAssetTickers} from "./SmartChainAssets";
import {LocalStorageManager} from "./storage/LocalStorageManager";
import {NostrMessenger} from "@atomiqlabs/messenger-nostr";

/**
 * @internal
 * Helper type for chain initialization configuration
 */
type ChainInitializer<O, C extends ChainType, T extends BaseTokenType> = {
    chainId: ChainType["ChainId"],
    chainType: ChainType,
    initializer: (
        options: O,
        bitcoinRelay: BitcoinRpc<any>,
        network: BitcoinNetwork,
        storageCtor: <T extends StorageObject>(name: string) => IStorageManager<T>
    ) => ChainData<C>,
    tokens: T,
    options: O
}

/** @internal */
type TokensDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokens<T>
};
/** @internal */
type GetAllTokens<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? TokensDict<First> & GetAllTokens<Rest>
        : unknown);

/** @internal */
export type TokenResolverDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokenResolver<T>
};

/** @internal */
type OptionsDict<T extends ChainInitializer<any, any, any>> = {[K in T["chainId"]]: T["options"]};
/** @internal */
type GetAllOptions<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? OptionsDict<First> & GetAllOptions<Rest>
        : unknown);

/** @internal */
type ChainTypeDict<T extends ChainInitializer<any, any, any>> = {[K in T["chainId"]]: T["chainType"]};
/** @internal */
type ToMultichain<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? ChainTypeDict<First> & ToMultichain<Rest>
        : {});
/**
 * Configuration options for creating a typed Swapper instance.
 *
 * @category Configuration
 *
 * @example
 * ```typescript
 * const options: TypedSwapperOptions<typeof chains> = {
 *   bitcoinNetwork: BitcoinNetwork.MAINNET,
 *   chains: {
 *     SOLANA: { rpcUrl: "https://api.mainnet-beta.solana.com" }
 *   }
 * };
 * ```
 */
export type TypedSwapperOptions<T extends readonly ChainInitializer<any, any, any>[]> = SwapperOptions & {
    /** Chain-specific configuration options */
    chains: GetAllOptions<T>
} & {
    /** Custom storage constructor for chain-specific data */
    chainStorageCtor?: <T extends StorageObject>(name: string) => IStorageManager<T>,
    /** Fee difference tolerance in parts per million (default: 10000 = 1%) */
    pricingFeeDifferencePPM?: bigint,
    /** Mempool API instance or URL(s) for Bitcoin RPC */
    mempoolApi?: MempoolApi | MempoolBitcoinRpc | string | string[],
    /** Messenger for cross-chain communication (default: Nostr) */
    messenger?: Messenger,
    /** Custom price function for token pricing */
    getPriceFn?: CustomPriceFunction
};

/**
 * Token resolver for a specific chain, used to look up tokens by address.
 * @category Types
 */
export type TypedChainTokenResolver<T extends ChainInitializer<any, any, any>> = {
    getToken: (address: string) => SCToken<T["chainId"]>
};

/**
 * Combined token resolvers for all configured chains.
 * @category Types
 */
export type TypedTokenResolvers<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? TokenResolverDict<First> & TypedTokenResolvers<Rest>
        : unknown);

/**
 * Token definitions for a specific chain.
 * @category Types
 */
export type TypedChainTokens<T extends ChainInitializer<any, any, any>> = {
    [val in keyof T["tokens"]]: SCToken<T["chainId"]>
};

/**
 * All token definitions including Bitcoin tokens.
 * Access tokens via `factory.Tokens.SOLANA.USDC` or `factory.Tokens.BITCOIN.BTC`.
 * @category Types
 */
export type TypedTokens<T extends readonly ChainInitializer<any, ChainType, any>[]> = GetAllTokens<T> & {
    BITCOIN: {
        BTC: BtcToken<false>,
        BTCLN: BtcToken<true>
    }
};

/**
 * A typed Swapper instance configured for specific chains.
 * @category Types
 */
export type TypedSwapper<T extends readonly ChainInitializer<any, ChainType, any>[]> = Swapper<ToMultichain<T>>;

/**
 * A typed swap for a specific chain and swap type.
 * @category Types
 */
export type TypedSwap<
    T extends ChainInitializer<any, ChainType, any>,
    S extends SwapType
> = SwapTypeMapping<T["chainType"]>[S];

/** @internal Default LP registry URLs by network */
const registries: {[key in BitcoinNetwork]?: string} = {
    [BitcoinNetwork.MAINNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-mainnet.json?ref=main",
    [BitcoinNetwork.TESTNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main",
    [BitcoinNetwork.TESTNET4]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-testnet4.json?ref=main"
}

/** @internal Default trusted intermediary URLs by network */
const trustedIntermediaries: {[key in BitcoinNetwork]?: string} = {
    [BitcoinNetwork.MAINNET]: "https://node3.gethopa.com:34100",
    [BitcoinNetwork.TESTNET]: "https://node3.gethopa.com:24100"
}

/** @internal Default Mempool API URLs by network */
const mempoolUrls: {[key in BitcoinNetwork]?: string[]} = {
    [BitcoinNetwork.MAINNET]: [
        "https://mempool.space/api/",
        "https://mempool.holdings/api/",
        "https://mempool.fra.mempool.space/api/",
        "https://mempool.va1.mempool.space/api/",
        "https://mempool.tk7.mempool.space/api/"
    ],
    [BitcoinNetwork.TESTNET]: [
        "https://mempool.space/testnet/api/",
        "https://mempool.holdings/testnet/api/",
        "https://mempool.fra.mempool.space/testnet/api/",
        "https://mempool.va1.mempool.space/testnet/api/",
        "https://mempool.tk7.mempool.space/testnet/api/"
    ],
    [BitcoinNetwork.TESTNET4]: [
        "https://mempool.space/testnet4/api/",
        "https://mempool.holdings/testnet4/api/",
        "https://mempool.fra.mempool.space/testnet4/api/",
        "https://mempool.va1.mempool.space/testnet4/api/",
        "https://mempool.tk7.mempool.space/testnet4/api/"
    ]
}

/** @internal Default Nostr relay URLs */
const nostrUrls: string[] = [
    "wss://relay.damus.io", "wss://nostr.einundzwanzig.space", "wss://relay01.lnfi.network/", "wss://relay.puresignal.news/", "wss://relay.fountain.fm/", "wss://sendit.nosflare.com/"
];

/**
 * Factory for creating typed Swapper instances with multi-chain support.
 *
 * The SwapperFactory is the main entry point for the Atomiq SDK. It handles:
 * - Chain initialization and configuration
 * - Token definitions and resolution
 * - Price provider setup
 * - Bitcoin RPC configuration
 *
 * @category Core
 *
 * @example
 * ```typescript
 * import { SwapperFactory } from "@atomiqlabs/sdk";
 * import { SolanaInitializer } from "@atomiqlabs/chain-solana";
 *
 * // Create factory with Solana chain support
 * const factory = new SwapperFactory([
 *   SolanaInitializer
 * ]);
 *
 * // Create and initialize swapper
 * const swapper = await factory.newSwapperInitialized({
 *   bitcoinNetwork: BitcoinNetwork.MAINNET,
 *   chains: {
 *     SOLANA: { rpcUrl: "https://api.mainnet-beta.solana.com" }
 *   }
 * });
 *
 * // Access tokens
 * const usdc = factory.Tokens.SOLANA.USDC;
 * const btc = factory.Tokens.BITCOIN.BTC;
 * ```
 *
 * @typeParam T - Array of chain initializer configurations
 */
export class SwapperFactory<T extends readonly ChainInitializer<any, ChainType, any>[]> {

    /**
     * Token definitions for all configured chains including Bitcoin.
     * Access via `Tokens.CHAINID.TICKER` (e.g., `Tokens.SOLANA.USDC`).
     */
    Tokens: TypedTokens<T> = {
        BITCOIN: BitcoinTokens
    } as any;

    /**
     * Token resolvers for looking up tokens by contract address.
     * Access via `TokenResolver.CHAINID.getToken(address)`.
     */
    TokenResolver: TypedTokenResolvers<T> = {} as any;

    /**
     * Creates a new SwapperFactory with the specified chain initializers.
     *
     * @param initializers - Array of chain initializer configurations
     */
    constructor(readonly initializers: T) {
        this.initializers = initializers;
        initializers.forEach(initializer => {
            const addressMap: {[tokenAddress: string]: SCToken} = {};

            const tokens = (this.Tokens[initializer.chainId as keyof GetAllTokens<T>] = {} as any);

            for(let ticker in initializer.tokens) {
                const assetData = initializer.tokens[ticker] as any;
                tokens[ticker] = addressMap[assetData.address] = {
                    chain: "SC",
                    chainId: initializer.chainId,
                    address: assetData.address,
                    name: SmartChainAssets[ticker as SmartChainAssetTickers]?.name ?? ticker,
                    decimals: assetData.decimals,
                    displayDecimals: assetData.displayDecimals,
                    ticker
                } as any;
            }

            this.TokenResolver[initializer.chainId as keyof TypedTokenResolvers<T>] = {
                getToken: (address: string) => addressMap[address]
            } as any;
        });
    }

    /**
     * Creates a new Swapper instance without initializing it.
     * Call `swapper.init()` before using the swapper.
     *
     * @param options - Configuration options for the swapper
     * @returns A new Swapper instance (not yet initialized)
     *
     * @example
     * ```typescript
     * const swapper = factory.newSwapper({
     *   bitcoinNetwork: BitcoinNetwork.MAINNET,
     *   chains: { SOLANA: { rpcUrl: "..." } }
     * });
     * await swapper.init();
     * ```
     */
    newSwapper(options: TypedSwapperOptions<T>): TypedSwapper<T> {
        options.bitcoinNetwork ??= BitcoinNetwork.MAINNET;
        options.storagePrefix ??= "atomiqsdk-"+options.bitcoinNetwork+"-";
        options.messenger ??= new NostrMessenger(options.bitcoinNetwork, nostrUrls);
        options.defaultTrustedIntermediaryUrl ??= trustedIntermediaries[options.bitcoinNetwork];
        options.registryUrl ??= registries[options.bitcoinNetwork];

        let bitcoinRpc: MempoolBitcoinRpc;
        if(options.mempoolApi!=null) {
            bitcoinRpc = options.mempoolApi instanceof MempoolBitcoinRpc ? options.mempoolApi : new MempoolBitcoinRpc(options.mempoolApi);
        } else {
            const urls = mempoolUrls[options.bitcoinNetwork];
            if(urls==null) throw new Error(`No pre-configured urls for ${BitcoinNetwork[options.bitcoinNetwork]} network were found, please explicitly pass mempoolApi parameter!`);
            bitcoinRpc = new MempoolBitcoinRpc(urls);
        }

        const pricingAssets: (RedundantSwapPriceAssets<ToMultichain<T>>[number] & {ticker: string, name: string})[] = [];
        Object.keys(SmartChainAssets).forEach((ticker) => {
            const chains: any = {};
            for(let {tokens, chainId} of this.initializers) {
                if(tokens[ticker]!=null) chains[chainId] = tokens[ticker];
            }
            const assetData = SmartChainAssets[ticker as SmartChainAssetTickers];
            pricingAssets.push({
                ...assetData.pricing,
                chains,
                ticker,
                name: assetData.name
            })
        });

        options.chainStorageCtor ??= (name: string) => new LocalStorageManager(name);

        const chains: {[key in T[number]["chainId"]]: ChainData<any>} = {} as any;
        for(let {initializer, chainId} of this.initializers) {
            const chainOptions = options.chains[chainId as keyof GetAllOptions<T>];
            if(chainOptions==null) continue;
            chains[chainId as T[number]["chainId"]] = initializer(chainOptions, bitcoinRpc, options.bitcoinNetwork, options.chainStorageCtor) as any;
        }

        const swapPricing = options.getPriceFn!=null ?
            new SingleSwapPrice(options.pricingFeeDifferencePPM ?? 10000n, new CustomPriceProvider(pricingAssets.map(val => {
                return {
                    coinId: val.ticker,
                    chains: val.chains
                }
            }), options.getPriceFn)) :
            RedundantSwapPrice.createFromTokenMap<ToMultichain<T>>(options.pricingFeeDifferencePPM ?? 10000n, pricingAssets);

        return new Swapper<ToMultichain<T>>(
            bitcoinRpc,
            chains as any,
            swapPricing,
            pricingAssets,
            options.messenger,
            options
        );
    }

    /**
     * Creates and initializes a new Swapper instance.
     * This is the recommended way to create a swapper.
     *
     * @param options - Configuration options for the swapper
     * @returns A fully initialized Swapper ready for use
     *
     * @example
     * ```typescript
     * const swapper = await factory.newSwapperInitialized({
     *   bitcoinNetwork: BitcoinNetwork.MAINNET,
     *   chains: { SOLANA: { rpcUrl: "..." } }
     * });
     *
     * // Ready to create swaps
     * const swap = await swapper.createToBTCSwap(...);
     * ```
     */
    async newSwapperInitialized(options: TypedSwapperOptions<T>): Promise<TypedSwapper<T>> {
        const swapper = this.newSwapper(options);
        await swapper.init();
        return swapper;
    }

}
