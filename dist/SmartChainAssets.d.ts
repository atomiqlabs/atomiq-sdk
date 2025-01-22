export declare const SmartChainAssets: {
    readonly WBTC: {
        readonly pricing: {
            readonly binancePair: "WBTCBTC";
            readonly okxPair: "$fixed-1";
            readonly coinGeckoCoinId: "wrapped-bitcoin";
            readonly coinPaprikaCoinId: "wbtc-wrapped-bitcoin";
        };
        readonly name: "Wrapped BTC";
    };
    readonly USDC: {
        readonly pricing: {
            readonly binancePair: "!BTCUSDC";
            readonly okxPair: "!BTC-USDC";
            readonly coinGeckoCoinId: "usd-coin";
            readonly coinPaprikaCoinId: "usdc-usd-coin";
        };
        readonly name: "USD Circle";
    };
    readonly USDT: {
        readonly pricing: {
            readonly binancePair: "!BTCUSDT";
            readonly okxPair: "!BTC-USDT";
            readonly coinGeckoCoinId: "tether";
            readonly coinPaprikaCoinId: "usdt-tether";
        };
        readonly name: "Tether USD";
    };
    readonly SOL: {
        readonly pricing: {
            readonly binancePair: "SOLBTC";
            readonly okxPair: "SOL-BTC";
            readonly coinGeckoCoinId: "solana";
            readonly coinPaprikaCoinId: "sol-solana";
        };
        readonly name: "Solana";
    };
    readonly BONK: {
        readonly pricing: {
            readonly binancePair: "BONKUSDC;!BTCUSDC";
            readonly okxPair: any;
            readonly coinGeckoCoinId: "bonk";
            readonly coinPaprikaCoinId: "bonk-bonk";
        };
        readonly name: "Bonk";
    };
};
export type SmartChainAssetTickers = keyof typeof SmartChainAssets;
export type AssetData = {
    [ticker in SmartChainAssetTickers]?: {
        address: string;
        decimals: number;
    };
};
