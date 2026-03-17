/**
 * Type for all token types (BTC or smart chain)
 *
 * @category Tokens
 */
export type Token<ChainIdentifier extends string = string> = {
    /**
     * Chain identifier for the token's chain
     */
    chainId: ChainIdentifier | "BITCOIN" | "LIGHTNING",

    /**
     * Ticker of the token
     */
    ticker: string,
    /**
     * Full name of the token
     */
    name: string,
    /**
     * Actual decimal places of the tokens
     */
    decimals: number,
    /**
     * The decimal places that should be rendered and displayed to the user
     */
    displayDecimals?: number,

    /**
     * Address of the token contract, or `""` for Bitcoin
     */
    address: string,

    // legacy compatibility
    /**
     * Legacy chain identifier distinguishing between Smart Chain and Bitcoin tokens
     */
    chain: "SC" | "BTC",
    /**
     * Legacy lightning flag, determines whether a Bitcoin token is an Lightning or on-chain one
     */
    lightning?: boolean,

    // helpers
    /**
     * Equality check between tokens
     */
    equals: (other: Token) => boolean,
    /**
     * Returns the
     */
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
    lightning: L,

    toString: () => L extends true ? "BTC-LN" : "BTC"
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

    toString: () => `${ChainIdentifier}-${string}`
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
