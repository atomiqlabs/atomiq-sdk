"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toTokenAmount = void 0;
const Utils_1 = require("../utils/Utils");
/**
 * Factory function to create a TokenAmount
 * @category Tokens
 */
function toTokenAmount(amount, token, prices, pricingInfo) {
    if (amount == null)
        return {
            rawAmount: undefined,
            amount: "",
            _amount: NaN,
            token,
            currentUsdValue: () => Promise.resolve(NaN),
            pastUsdValue: NaN,
            usdValue: () => Promise.resolve(NaN),
            toString: () => "??? " + token.ticker,
            isUnknown: true
        };
    const amountStr = (0, Utils_1.toDecimal)(amount, token.decimals, undefined, token.displayDecimals);
    const _amount = parseFloat(amountStr);
    let usdValue = undefined;
    if (pricingInfo != null) {
        if (token.chain === "BTC" && token.ticker === "BTC") {
            if (pricingInfo.realPriceUsdPerBitcoin != null) {
                usdValue = Number(amount) * pricingInfo.realPriceUsdPerBitcoin;
            }
        }
        else {
            if (pricingInfo.realPriceUsdPerBitcoin != null && pricingInfo.realPriceUSatPerToken != null) {
                usdValue = _amount
                    * pricingInfo.realPriceUsdPerBitcoin
                    * Number(pricingInfo.realPriceUSatPerToken)
                    / 1000000;
            }
        }
    }
    const currentUsdValue = (abortSignal, preFetchedUsdPrice) => prices.getUsdValue(amount, token, abortSignal, preFetchedUsdPrice);
    return {
        rawAmount: amount,
        amount: amountStr,
        _amount,
        token,
        currentUsdValue,
        pastUsdValue: usdValue,
        usdValue: async (abortSignal, preFetchedUsdPrice) => {
            if (usdValue == null) {
                usdValue = await currentUsdValue(abortSignal, preFetchedUsdPrice);
            }
            return usdValue;
        },
        toString: () => amountStr + " " + token.ticker,
        isUnknown: false
    };
}
exports.toTokenAmount = toTokenAmount;
