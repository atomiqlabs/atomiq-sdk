export type BtcToken<L = boolean> = {
    chain: "BTC";
    lightning: L;
    ticker: "BTC";
    decimals: 8;
    name: L extends true ? "Bitcoin (lightning L2)" : "Bitcoin (on-chain L1)";
    displayDecimals?: number;
};
export declare function isBtcToken(obj: any): obj is BtcToken;
export declare const BitcoinTokens: {
    BTC: BtcToken<false>;
    BTCLN: BtcToken<true>;
};
export type SCToken<ChainIdentifier extends string = string> = {
    chain: "SC";
    chainId: ChainIdentifier;
    address: string;
    ticker: string;
    decimals: number;
    displayDecimals?: number;
    name: string;
};
export declare function isSCToken(obj: any): obj is SCToken;
export type Token<ChainIdentifier extends string = string> = BtcToken | SCToken<ChainIdentifier>;
export declare function isToken(obj: any): obj is Token;
