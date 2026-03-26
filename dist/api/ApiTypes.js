"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toApiToken = exports.toApiAmount = void 0;
/**
 * Converts a TokenAmount to the serializable ApiAmount format
 *
 * @category API
 */
function toApiAmount(tokenAmount) {
    return {
        amount: tokenAmount.amount,
        rawAmount: tokenAmount.rawAmount != null ? tokenAmount.rawAmount.toString() : "0",
        decimals: tokenAmount.token.decimals,
        symbol: tokenAmount.token.ticker,
        chain: tokenAmount.token.chainId
    };
}
exports.toApiAmount = toApiAmount;
/**
 * Converts a Token to the serializable ApiToken format
 *
 * @category API
 */
function toApiToken(token) {
    return {
        id: token.chain === "BTC" ? (token.lightning ? "BTCLN" : "BTC") : `${token.chainId}-${token.ticker}`,
        chainId: token.chainId,
        ticker: token.ticker,
        name: token.name,
        decimals: token.decimals,
        address: token.address
    };
}
exports.toApiToken = toApiToken;
