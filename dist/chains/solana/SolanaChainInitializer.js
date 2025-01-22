"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SdkSolana = void 0;
const chain_solana_1 = require("@atomiqlabs/chain-solana");
const web3_js_1 = require("@solana/web3.js");
const SolanaChains_1 = require("./SolanaChains");
const SolanaChainEventsBrowser_1 = require("@atomiqlabs/chain-solana/dist/solana/events/SolanaChainEventsBrowser");
const chainId = "SOLANA";
function getSolanaCtorData(options, bitcoinRpc, network) {
    var _a, _b, _c, _d;
    const connection = typeof (options.chains.SOLANA.rpcUrl) === "string" ?
        new web3_js_1.Connection(options.chains.SOLANA.rpcUrl) :
        options.chains.SOLANA.rpcUrl;
    const Fees = (_a = options.chains.SOLANA.fees) !== null && _a !== void 0 ? _a : new chain_solana_1.SolanaFees(connection, 200000, 4, 100);
    const btcRelay = new chain_solana_1.SolanaBtcRelay(connection, bitcoinRpc, (_b = options.chains.SOLANA.btcRelayContract) !== null && _b !== void 0 ? _b : SolanaChains_1.SolanaChains[network].addresses.btcRelayContract, Fees);
    const swapContract = new chain_solana_1.SolanaSwapProgram(connection, btcRelay, options.chains.SOLANA.dataAccountStorage || options.storageCtor("solAccounts"), (_c = options.chains.SOLANA.swapContract) !== null && _c !== void 0 ? _c : SolanaChains_1.SolanaChains[network].addresses.swapContract, (_d = options.chains.SOLANA.retryPolicy) !== null && _d !== void 0 ? _d : { transactionResendInterval: 1000 }, Fees);
    const chainEvents = new SolanaChainEventsBrowser_1.SolanaChainEventsBrowser(connection, swapContract);
    return {
        btcRelay,
        swapContract,
        chainEvents,
        swapDataConstructor: chain_solana_1.SolanaSwapData,
        //These are defined here to keep the data from old SolLightning-sdk, not needed for other chains
        storage: {
            toBtc: options.storageCtor("SOLv4-" + options.bitcoinNetwork + "-Swaps-ToBTC"),
            toBtcLn: options.storageCtor("SOLv4-" + options.bitcoinNetwork + "-Swaps-ToBTCLN"),
            fromBtc: options.storageCtor("SOLv4-" + options.bitcoinNetwork + "-Swaps-FromBTC"),
            fromBtcLn: options.storageCtor("SOLv4-" + options.bitcoinNetwork + "-Swaps-FromBTCLN"),
            lnForGas: options.storageCtor("SOLv4-" + options.bitcoinNetwork + "-Swaps-LnForGas"),
            onchainForGas: options.storageCtor("SOLv4-" + options.bitcoinNetwork + "-Swaps-OnchainForGas")
        }
    };
}
const SolanaAssets = {
    WBTC: {
        address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
        decimals: 8
    },
    USDC: {
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6
    },
    USDT: {
        address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        decimals: 6
    },
    SOL: {
        address: "So11111111111111111111111111111111111111112",
        decimals: 9
    },
    BONK: {
        address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        decimals: 5
    }
};
exports.SdkSolana = {
    getCtorData: getSolanaCtorData,
    assets: SolanaAssets,
    chainIdentifier: chainId
};
