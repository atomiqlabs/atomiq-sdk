"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapperFactory = void 0;
const base_1 = require("@atomiqlabs/base");
const sdk_lib_1 = require("@atomiqlabs/sdk-lib");
const SmartChainAssets_1 = require("./SmartChainAssets");
const LocalStorageManager_1 = require("./storage/LocalStorageManager");
const messenger_nostr_1 = require("@atomiqlabs/messenger-nostr");
const registries = {
    [base_1.BitcoinNetwork.MAINNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-mainnet.json?ref=main",
    [base_1.BitcoinNetwork.TESTNET]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main",
    [base_1.BitcoinNetwork.TESTNET4]: "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-testnet4.json?ref=main"
};
const trustedIntermediaries = {
    [base_1.BitcoinNetwork.MAINNET]: "https://node3.gethopa.com:34100",
    [base_1.BitcoinNetwork.TESTNET]: "https://node3.gethopa.com:24100"
};
const mempoolUrls = {
    [base_1.BitcoinNetwork.MAINNET]: [
        "https://mempool.space/api/",
        // "https://mempool.holdings/api/",
        "https://mempool.fra.mempool.space/api/",
        "https://mempool.va1.mempool.space/api/",
        "https://mempool.tk7.mempool.space/api/"
    ],
    [base_1.BitcoinNetwork.TESTNET]: [
        "https://mempool.space/testnet/api/",
        // "https://mempool.holdings/testnet/api/",
        "https://mempool.fra.mempool.space/testnet/api/",
        "https://mempool.va1.mempool.space/testnet/api/",
        "https://mempool.tk7.mempool.space/testnet/api/"
    ],
    [base_1.BitcoinNetwork.TESTNET4]: [
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
class SwapperFactory {
    constructor(initializers) {
        this.initializers = initializers;
        this.Tokens = {
            BITCOIN: sdk_lib_1.BitcoinTokens
        };
        this.TokenResolver = {};
        this.initializers = initializers;
        initializers.forEach(initializer => {
            const addressMap = {};
            const tokens = (this.Tokens[initializer.chainId] = {});
            for (let ticker in initializer.tokens) {
                const assetData = initializer.tokens[ticker];
                tokens[ticker] = addressMap[assetData.address] = {
                    chain: "SC",
                    chainId: initializer.chainId,
                    address: assetData.address,
                    name: SmartChainAssets_1.SmartChainAssets[ticker]?.name ?? ticker,
                    decimals: assetData.decimals,
                    displayDecimals: assetData.displayDecimals,
                    ticker
                };
            }
            this.TokenResolver[initializer.chainId] = {
                getToken: (address) => addressMap[address]
            };
        });
    }
    newSwapper(options) {
        options.bitcoinNetwork ?? (options.bitcoinNetwork = base_1.BitcoinNetwork.MAINNET);
        options.storagePrefix ?? (options.storagePrefix = "atomiqsdk-" + options.bitcoinNetwork + "-");
        options.messenger ?? (options.messenger = new messenger_nostr_1.NostrMessenger(options.bitcoinNetwork, nostrUrls));
        options.defaultTrustedIntermediaryUrl ?? (options.defaultTrustedIntermediaryUrl = trustedIntermediaries[options.bitcoinNetwork]);
        options.registryUrl ?? (options.registryUrl = registries[options.bitcoinNetwork]);
        let bitcoinRpc;
        if (options.mempoolApi != null) {
            bitcoinRpc = options.mempoolApi instanceof sdk_lib_1.MempoolBitcoinRpc ? options.mempoolApi : new sdk_lib_1.MempoolBitcoinRpc(options.mempoolApi);
        }
        else {
            const urls = mempoolUrls[options.bitcoinNetwork];
            if (urls == null)
                throw new Error(`No pre-configured urls for ${base_1.BitcoinNetwork[options.bitcoinNetwork]} network were found, please explicitly pass mempoolApi parameter!`);
            bitcoinRpc = new sdk_lib_1.MempoolBitcoinRpc(urls);
        }
        const pricingAssets = [];
        Object.keys(SmartChainAssets_1.SmartChainAssets).forEach((ticker) => {
            const chains = {};
            for (let { tokens, chainId } of this.initializers) {
                if (tokens[ticker] != null)
                    chains[chainId] = tokens[ticker];
            }
            const assetData = SmartChainAssets_1.SmartChainAssets[ticker];
            pricingAssets.push({
                ...assetData.pricing,
                chains,
                ticker,
                name: assetData.name
            });
        });
        options.chainStorageCtor ?? (options.chainStorageCtor = (name) => new LocalStorageManager_1.LocalStorageManager(name));
        const chains = {};
        for (let { initializer, chainId } of this.initializers) {
            const chainOptions = options.chains[chainId];
            if (chainOptions == null)
                continue;
            chains[chainId] = initializer(chainOptions, bitcoinRpc, options.bitcoinNetwork, options.chainStorageCtor);
        }
        const swapPricing = options.getPriceFn != null ?
            new sdk_lib_1.SingleSwapPrice(options.pricingFeeDifferencePPM ?? 10000n, new sdk_lib_1.CustomPriceProvider(pricingAssets.map(val => {
                return {
                    coinId: val.ticker,
                    chains: val.chains
                };
            }), options.getPriceFn)) :
            sdk_lib_1.RedundantSwapPrice.createFromTokenMap(options.pricingFeeDifferencePPM ?? 10000n, pricingAssets);
        return new sdk_lib_1.Swapper(bitcoinRpc, chains, swapPricing, pricingAssets, options.messenger, options);
    }
    async newSwapperInitialized(options) {
        const swapper = this.newSwapper(options);
        await swapper.init();
        return swapper;
    }
}
exports.SwapperFactory = SwapperFactory;
