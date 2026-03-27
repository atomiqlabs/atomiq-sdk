"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiEndpoint = exports.toApiLNURL = exports.toApiToken = exports.toApiAmount = void 0;
const ApiParser_1 = require("./ApiParser");
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
/**
 * Converts LNURL data to the serializable API format
 *
 * @category API
 */
function toApiLNURL(lnurl) {
    if (lnurl.type === "pay") {
        return {
            type: "pay",
            min: lnurl.min.toString(),
            max: lnurl.max.toString(),
            commentMaxLength: lnurl.commentMaxLength,
            ...(lnurl.shortDescription != null ? { shortDescription: lnurl.shortDescription } : {}),
            ...(lnurl.longDescription != null ? { longDescription: lnurl.longDescription } : {}),
            ...(lnurl.icon != null ? { icon: lnurl.icon } : {}),
            params: lnurl.params
        };
    }
    return {
        type: "withdraw",
        min: lnurl.min.toString(),
        max: lnurl.max.toString(),
        params: lnurl.params
    };
}
exports.toApiLNURL = toApiLNURL;
function createApiEndpoint(type, callback, inputSchema) {
    return {
        type,
        callback,
        inputSchema,
        callbackRaw: input => {
            return callback((0, ApiParser_1.parseApiInput)(inputSchema, input));
        }
    };
}
exports.createApiEndpoint = createApiEndpoint;
