/**
 * Type for all token types (BTC or smart chain)
 *
 * @category Tokens
 */
export type Token<ChainIdentifier extends string = string> = {
    /**
     * Chain identifier for the token's chain
     */
    chainId: ChainIdentifier | "BITCOIN" | "LIGHTNING";
    /**
     * Ticker of the token
     */
    ticker: string;
    /**
     * Full name of the token
     */
    name: string;
    /**
     * Actual decimal places of the tokens
     */
    decimals: number;
    /**
     * The decimal places that should be rendered and displayed to the user
     */
    displayDecimals?: number;
    /**
     * Address of the token contract, or `""` for Bitcoin
     */
    address: string;
    /**
     * Legacy chain identifier distinguishing between Smart Chain and Bitcoin tokens
     */
    chain: "SC" | "BTC";
    /**
     * Legacy lightning flag, determines whether a Bitcoin token is an Lightning or on-chain one
     */
    lightning?: boolean;
    /**
     * Equality check between tokens
     */
    equals: (other: Token) => boolean;
    /**
     * Returns the
     */
    toString: () => string;
};
/**
 * Type guard for a {@link Token} type, encompassing all tokens (BTC or smart chain)
 *
 * @category Tokens
 */
export declare function isToken(obj: any): obj is Token;
/**
 * Bitcoin token type (BTC on on-chain or lightning)
 *
 * @category Tokens
 */
export type BtcToken<L = boolean> = Token & {
    chainId: L extends true ? "LIGHTNING" : "BITCOIN";
    ticker: "BTC";
    name: L extends true ? "Bitcoin (lightning L2)" : "Bitcoin (on-chain L1)";
    decimals: 8;
    displayDecimals: 8;
    address: "";
    chain: "BTC";
    lightning: L;
    toString: () => L extends true ? "BTC-LN" : "BTC";
};
/**
 * Type guard for {@link BtcToken} (token on the bitcoin network - lightning or on-chain)
 *
 * @category Tokens
 */
export declare function isBtcToken(obj: any): obj is BtcToken;
/**
 * Predefined Bitcoin token constants
 *
 * @category Tokens
 */
export declare const BitcoinTokens: {
    BTC: BtcToken<false>;
    BTCLN: BtcToken<true>;
};
/**
 * Token on the smart chain
 *
 * @category Tokens
 */
export type SCToken<ChainIdentifier extends string = string> = Token<ChainIdentifier> & {
    chainId: ChainIdentifier;
    chain: "SC";
    toString: () => `${ChainIdentifier}-${string}`;
};
/**
 * Type guard for {@link SCToken} (token on the smart chain)
 * @category Tokens
 */
export declare function isSCToken<ChainIdentifier extends string = string>(obj: any, chainIdentifier?: ChainIdentifier[]): obj is SCToken<ChainIdentifier>;
