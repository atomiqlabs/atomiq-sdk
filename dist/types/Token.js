"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isToken = exports.isSCToken = exports.BitcoinTokens = exports.isBtcToken = void 0;
function isBtcToken(obj) {
    return typeof (obj) === "object" &&
        obj.chain === "BTC" &&
        typeof (obj.lightning) === "boolean" &&
        typeof (obj.ticker) === "string" &&
        typeof (obj.decimals) === "number" &&
        typeof (obj.name) === "string";
}
exports.isBtcToken = isBtcToken;
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
function isToken(obj) {
    return isBtcToken(obj) || isSCToken(obj);
}
exports.isToken = isToken;
