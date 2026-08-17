import { BitcoinNetwork } from "@atomiqlabs/base";
import { SmartChainAssets } from "../SmartChainAssets.js";
import { NostrMessenger } from "@atomiqlabs/messenger-nostr";
import { Swapper } from "./Swapper.js";
import { CustomPriceProvider } from "../prices/providers/CustomPriceProvider.js";
import { BitcoinTokens } from "../types/Token.js";
import { RedundantSwapPrice } from "../prices/RedundantSwapPrice.js";
import { LocalStorageManager } from "../storage-browser/LocalStorageManager.js";
import { SingleSwapPrice } from "../prices/SingleSwapPrice.js";
import { MempoolBitcoinRpc, MempoolBtcRelaySynchronizer } from "@atomiqlabs/btc-mempool";
const registries = {
    [BitcoinNetwork.MAINNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-mainnet.json?ref=main",
    [BitcoinNetwork.TESTNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main",
    [BitcoinNetwork.TESTNET4]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-testnet4.json?ref=main"
};
const trustedIntermediaries = {
    [BitcoinNetwork.MAINNET]: "https://node3.gethopa.com:34100",
    [BitcoinNetwork.TESTNET]: "https://node3.gethopa.com:24100"
};
const mempoolUrls = {
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
};
const nostrUrls = [
    "wss://relay.damus.io", "wss://nostr.einundzwanzig.space", "wss://relay01.lnfi.network/", "wss://relay.puresignal.news/", "wss://relay.fountain.fm/", "wss://sendit.nosflare.com/"
];
/**
 * Factory class for creating and initializing Swapper instances with typed chain support
 *
 * @category Core
 */
export class SwapperFactory {
    constructor(initializers) {
        this.initializers = initializers;
        /**
         * All available tokens for the atomiq SDK
         */
        this.Tokens = {
            BITCOIN: BitcoinTokens
        };
        /**
         * Token resolvers for various smart chains supported by the SDK, allow fetching tokens based on their addresses
         */
        this.TokenResolver = {};
        this.smartChainTokens = [];
        this.initializers = initializers;
        initializers.forEach(initializer => {
            const addressMap = {};
            const tokens = (this.Tokens[initializer.chainId] = {});
            for (let ticker in initializer.tokens) {
                const assetData = initializer.tokens[ticker];
                const token = {
                    chain: "SC",
                    chainId: initializer.chainId,
                    ticker,
                    name: SmartChainAssets[ticker]?.name ?? ticker,
                    decimals: assetData.decimals,
                    displayDecimals: assetData.displayDecimals,
                    address: assetData.address,
                    equals: (other) => other.chainId === initializer.chainId && other.ticker === ticker && other.address === assetData.address,
                    toString: () => `${initializer.chainId}-${ticker}`
                };
                this.smartChainTokens.push(token);
                tokens[ticker] = addressMap[assetData.address] = token;
            }
            this.TokenResolver[initializer.chainId] = {
                getToken: (address) => addressMap[address]
            };
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
    newSwapper(options) {
        options.bitcoinNetwork ??= BitcoinNetwork.MAINNET;
        options.storagePrefix ??= "atomiqsdk-" + options.bitcoinNetwork + "-";
        options.messenger ??= new NostrMessenger(options.bitcoinNetwork, nostrUrls);
        options.defaultTrustedIntermediaryUrl ??= trustedIntermediaries[options.bitcoinNetwork];
        options.registryUrl ??= registries[options.bitcoinNetwork];
        let bitcoinRpc;
        if (options.mempoolApi != null) {
            bitcoinRpc = options.mempoolApi instanceof MempoolBitcoinRpc ? options.mempoolApi : new MempoolBitcoinRpc(options.mempoolApi, options.bitcoinNetwork);
        }
        else {
            const urls = mempoolUrls[options.bitcoinNetwork];
            if (urls == null)
                throw new Error(`No pre-configured urls for ${BitcoinNetwork[options.bitcoinNetwork]} network were found, please explicitly pass mempoolApi parameter!`);
            bitcoinRpc = new MempoolBitcoinRpc(urls, options.bitcoinNetwork);
        }
        const pricingAssets = [];
        Object.keys(SmartChainAssets).forEach((ticker) => {
            const chains = {};
            for (let { tokens, chainId } of this.initializers) {
                if (tokens[ticker] != null)
                    chains[chainId] = tokens[ticker];
            }
            const assetData = SmartChainAssets[ticker];
            pricingAssets.push({
                ...assetData.pricing,
                chains,
                ticker,
                name: assetData.name
            });
        });
        options.chainStorageCtor ??= (name) => new LocalStorageManager(name);
        const chains = {};
        for (let { initializer, chainId } of this.initializers) {
            const chainOptions = options.chains[chainId];
            if (chainOptions == null)
                continue;
            chains[chainId] = initializer(chainOptions, bitcoinRpc, options.bitcoinNetwork, options.chainStorageCtor);
        }
        const swapPricing = options.getPriceFn != null ?
            new SingleSwapPrice(options.pricingFeeDifferencePPM ?? 10000n, new CustomPriceProvider(pricingAssets.map(val => {
                return {
                    coinId: val.ticker,
                    chains: val.chains
                };
            }), options.getPriceFn)) :
            RedundantSwapPrice.createFromTokenMap(options.pricingFeeDifferencePPM ?? 10000n, pricingAssets);
        return new Swapper(bitcoinRpc, bitcoinRpc, (btcRelay) => new MempoolBtcRelaySynchronizer(btcRelay, bitcoinRpc), chains, swapPricing, this.smartChainTokens, options.messenger, options);
    }
    /**
     * Returns a new and already initialized swapper instance with the passed options. There is no need
     *  to call {@link Swapper.init} anymore.
     *
     * @param options Options for customizing the swapper instance
     */
    async newSwapperInitialized(options) {
        const swapper = this.newSwapper(options);
        await swapper.init();
        return swapper;
    }
}
