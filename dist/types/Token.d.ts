/**
 * Type for all token types (BTC or smart chain)
 *
 * @category Tokens
 */
export type Token<ChainIdentifier extends string = string> = {
    chainId: ChainIdentifier | "BITCOIN" | "LIGHTNING";
    ticker: string;
    name: string;
    decimals: number;
    displayDecimals?: number;
    address: string;
    chain: "SC" | "BTC";
    lightning?: boolean;
    equals: (other: Token) => boolean;
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
};
/**
 * Type guard for {@link SCToken} (token on the smart chain)
 * @category Tokens
 */
export declare function isSCToken<ChainIdentifier extends string = string>(obj: any, chainIdentifier?: ChainIdentifier[]): obj is SCToken<ChainIdentifier>;
