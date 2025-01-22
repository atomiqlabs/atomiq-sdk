"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartChainAssets = void 0;
exports.SmartChainAssets = {
    WBTC: {
        pricing: {
            binancePair: "WBTCBTC",
            okxPair: "$fixed-1",
            coinGeckoCoinId: "wrapped-bitcoin",
            coinPaprikaCoinId: "wbtc-wrapped-bitcoin"
        },
        name: "Wrapped BTC"
    },
    USDC: {
        pricing: {
            binancePair: "!BTCUSDC",
            okxPair: "!BTC-USDC",
            coinGeckoCoinId: "usd-coin",
            coinPaprikaCoinId: "usdc-usd-coin"
        },
        name: "USD Circle"
    },
    USDT: {
        pricing: {
            binancePair: "!BTCUSDT",
            okxPair: "!BTC-USDT",
            coinGeckoCoinId: "tether",
            coinPaprikaCoinId: "usdt-tether"
        },
        name: "Tether USD"
    },
    SOL: {
        pricing: {
            binancePair: "SOLBTC",
            okxPair: "SOL-BTC",
            coinGeckoCoinId: "solana",
            coinPaprikaCoinId: "sol-solana"
        },
        name: "Solana"
    },
    BONK: {
        pricing: {
            binancePair: "BONKUSDC;!BTCUSDC",
            okxPair: null,
            coinGeckoCoinId: "bonk",
            coinPaprikaCoinId: "bonk-bonk"
        },
        name: "Bonk"
    }
};
