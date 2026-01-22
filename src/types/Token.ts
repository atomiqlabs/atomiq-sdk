/**
 * Bitcoin token type (on-chain or lightning)
 * @category Tokens
 */
export type BtcToken<L = boolean> = {
    chain: "BTC",
    lightning: L,
    ticker: "BTC",
    decimals: 8,
    name: L extends true ? "Bitcoin (lightning L2)" : "Bitcoin (on-chain L1)",
    displayDecimals?: number
};

/**
 * Type guard for BtcToken
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
 * @category Tokens
 */
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
/**
 * Smart Chain token type
 * @category Tokens
 */
export type SCToken<ChainIdentifier extends string = string> = {
    chain: "SC",
    chainId: ChainIdentifier,
    address: string,
    ticker: string,
    decimals: number,
    displayDecimals?: number,
    name: string
}

/**
 * Type guard for SCToken
 * @category Tokens
 */
export function isSCToken(obj: any): obj is SCToken {
    return typeof (obj) === "object" &&
        obj.chain === "SC" &&
        typeof (obj.chainId) === "string" &&
        typeof (obj.address) === "string" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}

/**
 * Union type for all token types (BTC or smart chain)
 * @category Tokens
 */
export type Token<ChainIdentifier extends string = string> = BtcToken | SCToken<ChainIdentifier>;

/**
 * Type guard for Token
 * @category Tokens
 */
export function isToken(obj: any): obj is Token {
    return isBtcToken(obj) || isSCToken(obj);
}
