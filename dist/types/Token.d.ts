/**
 * Bitcoin token type (BTC on on-chain or lightning)
 *
 * @category Tokens
 */
export type BtcToken<L = boolean> = {
    chain: "BTC";
    lightning: L;
    ticker: "BTC";
    decimals: 8;
    name: L extends true ? "Bitcoin (lightning L2)" : "Bitcoin (on-chain L1)";
    displayDecimals?: number;
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
export type SCToken<ChainIdentifier extends string = string> = {
    chain: "SC";
    chainId: ChainIdentifier;
    address: string;
    ticker: string;
    decimals: number;
    displayDecimals?: number;
    name: string;
};
/**
 * Type guard for {@link SCToken} (token on the smart chain)
 * @category Tokens
 */
export declare function isSCToken(obj: any): obj is SCToken;
/**
 * Union type for all token types (BTC or smart chain)
 *
 * @category Tokens
 */
export type Token<ChainIdentifier extends string = string> = BtcToken | SCToken<ChainIdentifier>;
/**
 * Type guard for an union {@link Token} type, encompassing all tokens (BTC or smart chain)
 *
 * @category Tokens
 */
export declare function isToken(obj: any): obj is Token;
