export type BtcToken<L = boolean> = {
    chain: "BTC",
    lightning: L,
    ticker: "BTC",
    decimals: 8,
    name: L extends true ? "Bitcoin (lightning L2)" : "Bitcoin (on-chain L1)",
    displayDecimals?: number
};

export function isBtcToken(obj: any): obj is BtcToken {
    return typeof (obj) === "object" &&
        obj.chain === "BTC" &&
        typeof (obj.lightning) === "boolean" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}

export const BitcoinTokens: {
    BTC: BtcToken<false>,
    BTCLN: BtcToken<true>
} = {
    BTC: {
        chain: "BTC",
        lightning: false,
        ticker: "BTC",
        decimals: 8,
        name: "Bitcoin (on-chain L1)"
    },
    BTCLN: {
        chain: "BTC",
        lightning: true,
        ticker: "BTC",
        decimals: 8,
        name: "Bitcoin (lightning L2)"
    }
};
export type SCToken<ChainIdentifier extends string = string> = {
    chain: "SC",
    chainId: ChainIdentifier,
    address: string,
    ticker: string,
    decimals: number,
    displayDecimals?: number,
    name: string
}

export function isSCToken(obj: any): obj is SCToken {
    return typeof (obj) === "object" &&
        obj.chain === "SC" &&
        typeof (obj.chainId) === "string" &&
        typeof (obj.address) === "string" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}

export type Token<ChainIdentifier extends string = string> = BtcToken | SCToken<ChainIdentifier>;

export function isToken(obj: any): obj is Token {
    return isBtcToken(obj) || isSCToken(obj);
}
