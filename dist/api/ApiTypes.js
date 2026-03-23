"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toApiAmount = void 0;
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
