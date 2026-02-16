import {
    ChainData,
    BitcoinNetwork,
    ChainType,
    StorageObject,
    IStorageManager, Messenger, ChainInitializer, BtcRelay
} from "@atomiqlabs/base";
import {SmartChainAssets, SmartChainAssetTickers} from "../SmartChainAssets";
import {NostrMessenger} from "@atomiqlabs/messenger-nostr";
import {Swapper, SwapperOptions} from "./Swapper";
import {CustomPriceProvider} from "../prices/providers/CustomPriceProvider";
import {BitcoinTokens, BtcToken, SCToken} from "../types/Token";
import {SwapType} from "../enums/SwapType";
import {SwapTypeMapping} from "../utils/SwapUtils";
import {RedundantSwapPrice, RedundantSwapPriceAssets} from "../prices/RedundantSwapPrice";
import {LocalStorageManager} from "../storage-browser/LocalStorageManager";
import {SingleSwapPrice} from "../prices/SingleSwapPrice";
import {CustomPriceFunction} from "../types/CustomPriceFunction";
import {MempoolApi, MempoolBitcoinRpc, MempoolBtcRelaySynchronizer} from "@atomiqlabs/btc-mempool";

//Helper types
/**
 * Token definitions for a specific chain
 */
type TypedChainTokens<T extends ChainInitializer<any, any, any>> = {
    [val in keyof T["tokens"]]: SCToken<T["chainId"]>
};
/**
 * Token resolver for a specific chain
 */
type TypedChainTokenResolver<T extends ChainInitializer<any, any, any>> = {
    getToken: (address: string) => SCToken<T["chainId"]>
};

type ChainTypeDict<T extends ChainInitializer<any, any, any>> = {[K in T["chainId"]]: T["chainType"]};
type ToMultichain<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? ChainTypeDict<First> & ToMultichain<Rest>
        : {});

type TokensDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokens<T>
};
type GetAllTokens<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? TokensDict<First> & GetAllTokens<Rest>
        : unknown);

type TokenResolverDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokenResolver<T>
};

type OptionsDict<T extends ChainInitializer<any, any, any>> = {[K in T["chainId"]]: T["options"]};
type GetAllOptions<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? OptionsDict<First> & GetAllOptions<Rest>
        : unknown);

//Exported types
/**
 * Configuration options for creating a Swapper instance
 *
 * @category Core
 */
export type TypedSwapperOptions<T extends readonly ChainInitializer<any, any, any>[]> = {
    chains: GetAllOptions<T>,
    chainStorageCtor?: <T extends StorageObject>(name: string) => IStorageManager<T>,
    pricingFeeDifferencePPM?: bigint,
    getPriceFn?: CustomPriceFunction,
    mempoolApi?: MempoolApi | MempoolBitcoinRpc | string | string[],
    messenger?: Messenger,
} & SwapperOptions;

/**
 * Token resolvers for all chains, resolve tokens based on their address
 *
 * @category Core
 */
export type TypedTokenResolvers<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? TokenResolverDict<First> & TypedTokenResolvers<Rest>
        : unknown);

/**
 * All tokens including Bitcoin tokens
 *
 * @category Core
 */
export type TypedTokens<T extends readonly ChainInitializer<any, ChainType, any>[]> = GetAllTokens<T> & {
    BITCOIN: {
        BTC: BtcToken<false>,
        BTCLN: BtcToken<true>
    }
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
export type TypedSwap<
    T extends ChainInitializer<any, ChainType, any>,
    S extends SwapType
> = SwapTypeMapping<T["chainType"]>[S];

const registries: {[key in BitcoinNetwork]?: string} = {
    [BitcoinNetwork.MAINNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-mainnet.json?ref=main",
    [BitcoinNetwork.TESTNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main",
    [BitcoinNetwork.TESTNET4]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-testnet4.json?ref=main"
}

const trustedIntermediaries: {[key in BitcoinNetwork]?: string} = {
    [BitcoinNetwork.MAINNET]: "https://node3.gethopa.com:34100",
    [BitcoinNetwork.TESTNET]: "https://node3.gethopa.com:24100"
}

const mempoolUrls: {[key in BitcoinNetwork]?: string[]} = {
    [BitcoinNetwork.MAINNET]: [
        "https://mempool.space/api/",
        // "https://mempool.holdings/api/",
        "https://mempool.fra.mempool.space/api/",
        "https://mempool.va1.mempool.space/api/",
        "https://mempool.tk7.mempool.space/api/"
    ],
    [BitcoinNetwork.TESTNET]: [
        "https://mempool.space/testnet/api/",
        // "https://mempool.holdings/testnet/api/",
        "https://mempool.fra.mempool.space/testnet/api/",
        "https://mempool.va1.mempool.space/testnet/api/",
        "https://mempool.tk7.mempool.space/testnet/api/"
    ],
    [BitcoinNetwork.TESTNET4]: [
        "https://mempool.space/testnet4/api/",
        // "https://mempool.holdings/testnet4/api/",
        "https://mempool.fra.mempool.space/testnet4/api/",
        "https://mempool.va1.mempool.space/testnet4/api/",
        "https://mempool.tk7.mempool.space/testnet4/api/"
    ]
}

const nostrUrls: string[] = [
    "wss://relay.damus.io", "wss://nostr.einundzwanzig.space", "wss://relay01.lnfi.network/", "wss://relay.puresignal.news/", "wss://relay.fountain.fm/", "wss://sendit.nosflare.com/"
];

/**
 * Factory class for creating and initializing Swapper instances with typed chain support
 *
 * @category Core
 */
export class SwapperFactory<T extends readonly ChainInitializer<any, ChainType, any>[]> {

    /**
     * All available tokens for the atomiq SDK
     */
    Tokens: TypedTokens<T> = {
        BITCOIN: BitcoinTokens
    } as any;
    /**
     * Token resolvers for various smart chains supported by the SDK, allow fetching tokens based on their addresses
     */
    TokenResolver: TypedTokenResolvers<T> = {} as any;

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
     * Returns a new swapper instance with the passed options.
     *
     * The swapper returned here is not yet initialized, be sure to call {@link Swapper.init}, before
     *  calling any other functions in the swapper instance.
     *
     * @param options Options for customizing the swapper instance
     */
    newSwapper(options: TypedSwapperOptions<T>): TypedSwapper<T> {
        options.bitcoinNetwork ??= BitcoinNetwork.MAINNET;
        options.storagePrefix ??= "atomiqsdk-"+options.bitcoinNetwork+"-";
        options.messenger ??= new NostrMessenger(options.bitcoinNetwork, nostrUrls);
        options.defaultTrustedIntermediaryUrl ??= trustedIntermediaries[options.bitcoinNetwork];
        options.registryUrl ??= registries[options.bitcoinNetwork];

        let bitcoinRpc: MempoolBitcoinRpc;
        if(options.mempoolApi!=null) {
            bitcoinRpc = options.mempoolApi instanceof MempoolBitcoinRpc ? options.mempoolApi : new MempoolBitcoinRpc(options.mempoolApi, options.bitcoinNetwork);
        } else {
            const urls = mempoolUrls[options.bitcoinNetwork];
            if(urls==null) throw new Error(`No pre-configured urls for ${BitcoinNetwork[options.bitcoinNetwork]} network were found, please explicitly pass mempoolApi parameter!`);
            bitcoinRpc = new MempoolBitcoinRpc(urls, options.bitcoinNetwork);
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

        options.chainStorageCtor ??= <T extends StorageObject>(name: string) => new LocalStorageManager<T>(name);

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
            bitcoinRpc,
            (btcRelay: BtcRelay<any, any, any>) => new MempoolBtcRelaySynchronizer(btcRelay, bitcoinRpc),
            chains as any,
            swapPricing,
            pricingAssets,
            options.messenger,
            options
        );
    }

    /**
     * Returns a new and already initialized swapper instance with the passed options. There is no need
     *  to call {@link Swapper.init} anymore.
     *
     * @param options Options for customizing the swapper instance
     */
    async newSwapperInitialized(options: TypedSwapperOptions<T>): Promise<TypedSwapper<T>> {
        const swapper = this.newSwapper(options);
        await swapper.init();
        return swapper;
    }

}
