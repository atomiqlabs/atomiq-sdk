"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isToken = exports.isSCToken = exports.BitcoinTokens = exports.isBtcToken = void 0;
/**
 * Type guard for {@link BtcToken} (token on the bitcoin network - lightning or on-chain)
 *
 * @category Tokens
 */
function isBtcToken(obj) {
    return typeof (obj) === "object" &&
        obj.chain === "BTC" &&
        typeof (obj.lightning) === "boolean" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}
exports.isBtcToken = isBtcToken;
/**
 * Predefined Bitcoin token constants
 *
 * @category Tokens
 */
exports.BitcoinTokens = {
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
 * Type guard for {@link SCToken} (token on the smart chain)
 * @category Tokens
 */
function isSCToken(obj) {
    return typeof (obj) === "object" &&
        obj.chain === "SC" &&
        typeof (obj.chainId) === "string" &&
        typeof (obj.address) === "string" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}
exports.isSCToken = isSCToken;
/**
 * Type guard for an union {@link Token} type, encompassing all tokens (BTC or smart chain)
 *
 * @category Tokens
 */
function isToken(obj) {
    return isBtcToken(obj) || isSCToken(obj);
}
exports.isToken = isToken;
