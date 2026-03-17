"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSCToken = exports.BitcoinTokens = exports.isBtcToken = exports.isToken = void 0;
/**
 * Type guard for a {@link Token} type, encompassing all tokens (BTC or smart chain)
 *
 * @category Tokens
 */
function isToken(obj) {
    return typeof (obj) === "object" &&
        (obj.chain === "SC" || obj.chain === "BTC") &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}
exports.isToken = isToken;
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
        chainId: "BITCOIN",
        lightning: false,
        ticker: "BTC",
        decimals: 8,
        displayDecimals: 8,
        name: "Bitcoin (on-chain L1)",
        address: "",
        equals: (other) => other.chainId === "BITCOIN" && other.ticker === "BTC",
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
        equals: (other) => other.chainId === "LIGHTNING" && other.ticker === "BTC",
        toString: () => "BTC-LN"
    }
};
/**
 * Type guard for {@link SCToken} (token on the smart chain)
 * @category Tokens
 */
function isSCToken(obj, chainIdentifier) {
    return typeof (obj) === "object" &&
        obj.chain === "SC" &&
        typeof (obj.chainId) === "string" &&
        (chainIdentifier == null || chainIdentifier.includes(obj.chainId)) &&
        typeof (obj.address) === "string" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}
exports.isSCToken = isSCToken;
