"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenResolver = exports.Tokens = exports.MultichainSwapper = void 0;
const sdk_lib_1 = require("@atomiqlabs/sdk-lib");
const Utils_1 = require("@atomiqlabs/sdk-lib/dist/utils/Utils");
const SolanaChainInitializer_1 = require("./chains/solana/SolanaChainInitializer");
const BN = require("bn.js");
const SmartChainAssets_1 = require("./SmartChainAssets");
const Chains = {
    "SOLANA": SolanaChainInitializer_1.SdkSolana
};
class MultichainSwapper extends sdk_lib_1.Swapper {
    constructor(options) {
        var _a, _b, _c, _d, _e, _f;
        (_a = options.bitcoinNetwork) !== null && _a !== void 0 ? _a : (options.bitcoinNetwork = sdk_lib_1.BitcoinNetwork.MAINNET);
        (_b = options.storagePrefix) !== null && _b !== void 0 ? _b : (options.storagePrefix = "atomiqsdk-" + options.bitcoinNetwork);
        (_c = options.storageCtor) !== null && _c !== void 0 ? _c : (options.storageCtor = (name) => new sdk_lib_1.IndexedDBStorageManager(name));
        (_d = options.defaultTrustedIntermediaryUrl) !== null && _d !== void 0 ? _d : (options.defaultTrustedIntermediaryUrl = options.bitcoinNetwork === sdk_lib_1.BitcoinNetwork.MAINNET ?
            "https://node3.gethopa.com:34100" :
            "https://node3.gethopa.com:24100");
        (_e = options.registryUrl) !== null && _e !== void 0 ? _e : (options.registryUrl = options.bitcoinNetwork === sdk_lib_1.BitcoinNetwork.MAINNET ?
            "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry-mainnet.json?ref=main" :
            "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main");
        const mempoolApi = new sdk_lib_1.MempoolApi(options.bitcoinNetwork === sdk_lib_1.BitcoinNetwork.TESTNET ?
            "https://mempool.space/testnet/api/" :
            "https://mempool.space/api/");
        const bitcoinRpc = new sdk_lib_1.MempoolBitcoinRpc(mempoolApi);
        const pricingAssets = [];
        Object.keys(SmartChainAssets_1.SmartChainAssets).forEach((ticker) => {
            const chains = {};
            for (let chainId in Chains) {
                if (Chains[chainId].assets[ticker] != null)
                    chains[chainId] = Chains[chainId].assets[ticker];
            }
            const assetData = SmartChainAssets_1.SmartChainAssets[ticker];
            pricingAssets.push(Object.assign(Object.assign({}, assetData.pricing), { chains,
                ticker, name: assetData.name }));
        });
        const ctorChainData = (0, Utils_1.objectMap)(Chains, (value, key) => {
            return value.getCtorData(options, bitcoinRpc, options.bitcoinNetwork);
        });
        super(bitcoinRpc, ctorChainData, sdk_lib_1.RedundantSwapPrice.createFromTokenMap((_f = options.pricingFeeDifferencePPM) !== null && _f !== void 0 ? _f : new BN(10000), pricingAssets), pricingAssets, options);
    }
}
exports.MultichainSwapper = MultichainSwapper;
exports.Tokens = Object.assign(Object.assign({}, (0, Utils_1.objectMap)(Chains, (value, key) => {
    return (0, Utils_1.objectMap)(value.assets, (assetData, ticker) => {
        return {
            chain: "SC",
            chainId: value.chainIdentifier,
            address: assetData.address,
            name: SmartChainAssets_1.SmartChainAssets[ticker].name,
            decimals: assetData.decimals,
            ticker
        };
    });
})), { BITCOIN: sdk_lib_1.BitcoinTokens });
exports.TokenResolver = Object.assign({}, (0, Utils_1.objectMap)(Chains, (value, key) => {
    const addressMap = {};
    for (let ticker in value.assets) {
        addressMap[value.assets[ticker].address] = {
            chain: "SC",
            chainId: value.chainIdentifier,
            address: value.assets[ticker].address,
            ticker,
            name: SmartChainAssets_1.SmartChainAssets[ticker].name,
            decimals: value.assets[ticker].decimals
        };
    }
    return {
        getToken: (address) => addressMap[address]
    };
}));
