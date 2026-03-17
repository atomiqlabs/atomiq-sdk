/**
 * Type for all token types (BTC or smart chain)
 *
 * @category Tokens
 */
export type Token<ChainIdentifier extends string = string> = {
    chainId: ChainIdentifier | "BITCOIN" | "LIGHTNING",

    ticker: string,
    name: string,
    decimals: number,
    displayDecimals?: number,

    address: string,

    // legacy compatibility
    chain: "SC" | "BTC",
    lightning?: boolean,

    // helpers
    equals: (other: Token) => boolean,
    toString: () => string
};

/**
 * Type guard for a {@link Token} type, encompassing all tokens (BTC or smart chain)
 *
 * @category Tokens
 */
export function isToken(obj: any): obj is Token {
    return typeof (obj) === "object" &&
      (obj.chain === "SC" || obj.chain === "BTC") &&
      typeof (obj.ticker) === "string" &&
      typeof (obj.decimals) === "number" &&
      typeof (obj.name) === "string";
}

/**
 * Bitcoin token type (BTC on on-chain or lightning)
 *
 * @category Tokens
 */
export type BtcToken<L = boolean> = Token & {
    chainId: L extends true ? "LIGHTNING" : "BITCOIN",
    ticker: "BTC",
    name: L extends true ? "Bitcoin (lightning L2)" : "Bitcoin (on-chain L1)",
    decimals: 8,
    displayDecimals: 8,

    address: "",

    // legacy compatibility
    chain: "BTC",
    lightning: L
};

/**
 * Type guard for {@link BtcToken} (token on the bitcoin network - lightning or on-chain)
 *
 * @category Tokens
 */
export function isBtcToken(obj: any): obj is BtcToken {
    return typeof (obj) === "object" &&
        obj.chain === "BTC" &&
        typeof (obj.lightning) === "boolean" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}

/**
 * Predefined Bitcoin token constants
 *
 * @category Tokens
 */
export const BitcoinTokens: {
    BTC: BtcToken<false>,
    BTCLN: BtcToken<true>
} = {
    BTC: {
        chain: "BTC",
        chainId: "BITCOIN",
        lightning: false,
        ticker: "BTC",
        decimals: 8,
        displayDecimals: 8,
        name: "Bitcoin (on-chain L1)",
        address: "",
        equals: (other: Token) => other.chainId==="BITCOIN" && other.ticker==="BTC",
        toString: () => "BTC"
    },
    BTCLN: {
        chain: "BTC",
        chainId: "LIGHTNING",
        lightning: true,
        ticker: "BTC",
        decimals: 8,
        displayDecimals: 8,
        name: "Bitcoin (lightning L2)",
        address: "",
        equals: (other: Token) => other.chainId==="LIGHTNING" && other.ticker==="BTC",
        toString: () => "BTC-LN"
    }
};

/**
 * Token on the smart chain
 *
 * @category Tokens
 */
export type SCToken<ChainIdentifier extends string = string> = Token<ChainIdentifier> & {
    chainId: ChainIdentifier,
    chain: "SC"
};

/**
 * Type guard for {@link SCToken} (token on the smart chain)
 * @category Tokens
 */
export function isSCToken<ChainIdentifier extends string = string>(obj: any, chainIdentifier?: ChainIdentifier[]): obj is SCToken<ChainIdentifier> {
    return typeof (obj) === "object" &&
        obj.chain === "SC" &&
        typeof (obj.chainId) === "string" &&
        (chainIdentifier==null || chainIdentifier.includes(obj.chainId)) &&
        typeof (obj.address) === "string" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}
