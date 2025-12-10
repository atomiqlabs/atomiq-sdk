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

//Helper types
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

type TokensDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokens<T>
};
type GetAllTokens<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? TokensDict<First> & GetAllTokens<Rest>
        : unknown);

export type TokenResolverDict<T extends ChainInitializer<any, any, any>> = {
    [K in T["chainId"]]: TypedChainTokenResolver<T>
};

type OptionsDict<T extends ChainInitializer<any, any, any>> = {[K in T["chainId"]]: T["options"]};
type GetAllOptions<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? OptionsDict<First> & GetAllOptions<Rest>
        : unknown);

type ChainTypeDict<T extends ChainInitializer<any, any, any>> = {[K in T["chainId"]]: T["chainType"]};
type ToMultichain<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? ChainTypeDict<First> & ToMultichain<Rest>
        : {});

//Exported types
export type TypedSwapperOptions<T extends readonly ChainInitializer<any, any, any>[]> = SwapperOptions & {
    chains: GetAllOptions<T>
} & {
    chainStorageCtor?: <T extends StorageObject>(name: string) => IStorageManager<T>,
    pricingFeeDifferencePPM?: bigint,
    mempoolApi?: MempoolApi | MempoolBitcoinRpc | string | string[],
    messenger?: Messenger,
    getPriceFn?: CustomPriceFunction
};

export type TypedChainTokenResolver<T extends ChainInitializer<any, any, any>> = {
    getToken: (address: string) => SCToken<T["chainId"]>
};

export type TypedTokenResolvers<T extends readonly ChainInitializer<any, any, any>[]> =
    (T extends readonly [infer First extends ChainInitializer<any, any, any>, ...infer Rest extends ChainInitializer<any, any, any>[]]
        ? TokenResolverDict<First> & TypedTokenResolvers<Rest>
        : unknown);

export type TypedChainTokens<T extends ChainInitializer<any, any, any>> = {
    [val in keyof T["tokens"]]: SCToken<T["chainId"]>
};

export type TypedTokens<T extends readonly ChainInitializer<any, ChainType, any>[]> = GetAllTokens<T> & {
    BITCOIN: {
        BTC: BtcToken<false>,
        BTCLN: BtcToken<true>
    }
};

export type TypedSwapper<T extends readonly ChainInitializer<any, ChainType, any>[]> = Swapper<ToMultichain<T>>;

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

const nostrUrls: string[] = [
    "wss://relay.damus.io", "wss://nostr.einundzwanzig.space", "wss://relay01.lnfi.network/", "wss://relay.puresignal.news/", "wss://relay.fountain.fm/", "wss://sendit.nosflare.com/"
];

export class SwapperFactory<T extends readonly ChainInitializer<any, ChainType, any>[]> {

    Tokens: TypedTokens<T> = {
        BITCOIN: BitcoinTokens
    } as any;
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

    async newSwapperInitialized(options: TypedSwapperOptions<T>): Promise<TypedSwapper<T>> {
        const swapper = this.newSwapper(options);
        await swapper.init();
        return swapper;
    }

}
