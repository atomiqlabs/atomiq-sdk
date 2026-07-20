import { BitcoinTokens } from "../types/Token";
import { toTokenAmount } from "../types/TokenAmount";
import { parseApiInput } from "./ApiParser";
/**
 * Converts a TokenAmount to the serializable ApiAmount format
 *
 * @category API
 */
export function toApiAmount(tokenAmount) {
    return {
        amount: tokenAmount.amount,
        rawAmount: tokenAmount.rawAmount != null ? tokenAmount.rawAmount.toString() : "0",
        decimals: tokenAmount.token.decimals,
        symbol: tokenAmount.token.ticker,
        chain: tokenAmount.token.chainId
    };
}
/**
 * Converts a Token to the serializable ApiToken format
 *
 * @category API
 */
export function toApiToken(token) {
    return {
        id: `${token.chainId}-${token.ticker}`,
        chainId: token.chainId,
        ticker: token.ticker,
        name: token.name,
        decimals: token.decimals,
        address: token.address
    };
}
/**
 * Converts LNURL data to the serializable API format
 *
 * @category API
 */
export function toApiLNURL(lnurl, swapper) {
    if (lnurl.type === "pay") {
        return {
            type: "pay",
            min: toApiAmount(toTokenAmount(lnurl.min, BitcoinTokens.BTCLN, swapper.prices)),
            max: toApiAmount(toTokenAmount(lnurl.max, BitcoinTokens.BTCLN, swapper.prices)),
            commentMaxLength: lnurl.commentMaxLength,
            ...(lnurl.shortDescription != null ? { shortDescription: lnurl.shortDescription } : {}),
            ...(lnurl.longDescription != null ? { longDescription: lnurl.longDescription } : {}),
            ...(lnurl.icon != null ? { icon: lnurl.icon } : {}),
            params: lnurl.params
        };
    }
    return {
        type: "withdraw",
        min: toApiAmount(toTokenAmount(lnurl.min, BitcoinTokens.BTCLN, swapper.prices)),
        max: toApiAmount(toTokenAmount(lnurl.max, BitcoinTokens.BTCLN, swapper.prices)),
        params: lnurl.params
    };
}
export function createApiEndpoint(type, description, callback, inputSchema) {
    return {
        type,
        description,
        callback,
        inputSchema,
        callbackRaw: (input, abortSignal) => {
            return callback(parseApiInput(inputSchema, input), abortSignal);
        }
    };
}
