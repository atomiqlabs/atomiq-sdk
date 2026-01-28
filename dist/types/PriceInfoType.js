"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deserializePriceInfoType = exports.serializePriceInfoType = exports.isPriceInfoType = void 0;
const Utils_1 = require("../utils/Utils");
/**
 * Type guard for PriceInfoType
 * @category Pricing and LPs
 */
function isPriceInfoType(obj) {
    return obj != null &&
        typeof (obj.isValid) === "boolean" &&
        typeof (obj.differencePPM) === "bigint" &&
        typeof (obj.satsBaseFee) === "bigint" &&
        typeof (obj.feePPM) === "bigint" &&
        (obj.realPriceUSatPerToken == null || typeof (obj.realPriceUSatPerToken) === "bigint") &&
        (obj.realPriceUsdPerBitcoin == null || typeof (obj.realPriceUsdPerBitcoin) === "number") &&
        typeof (obj.swapPriceUSatPerToken) === "bigint";
}
exports.isPriceInfoType = isPriceInfoType;
/**
 * Serializes PriceInfoType for storage
 * @category Pricing and LPs
 */
function serializePriceInfoType(obj) {
    if (obj == null)
        return null;
    return {
        isValid: obj.isValid,
        differencePPM: obj.differencePPM == null ? null : obj.differencePPM.toString(10),
        satsBaseFee: obj.satsBaseFee == null ? null : obj.satsBaseFee.toString(10),
        feePPM: obj.feePPM == null ? null : obj.feePPM.toString(10),
        realPriceUSatPerToken: obj.realPriceUSatPerToken == null ? null : obj.realPriceUSatPerToken.toString(10),
        realPriceUsdPerBitcoin: obj.realPriceUsdPerBitcoin,
        swapPriceUSatPerToken: obj.swapPriceUSatPerToken == null ? null : obj.swapPriceUSatPerToken.toString(10),
    };
}
exports.serializePriceInfoType = serializePriceInfoType;
/**
 * Deserializes PriceInfoType from storage
 * @category Pricing and LPs
 */
function deserializePriceInfoType(obj) {
    if (obj == null)
        return;
    if (obj.isValid != null && obj.differencePPM != null && obj.satsBaseFee != null &&
        obj.feePPM != null && obj.swapPriceUSatPerToken != null)
        return {
            isValid: obj.isValid,
            differencePPM: (0, Utils_1.toBigInt)(obj.differencePPM),
            satsBaseFee: (0, Utils_1.toBigInt)(obj.satsBaseFee),
            feePPM: (0, Utils_1.toBigInt)(obj.feePPM),
            realPriceUSatPerToken: (0, Utils_1.toBigInt)(obj.realPriceUSatPerToken),
            realPriceUsdPerBitcoin: obj.realPriceUsdPerBitcoin,
            swapPriceUSatPerToken: (0, Utils_1.toBigInt)(obj.swapPriceUSatPerToken),
        };
}
exports.deserializePriceInfoType = deserializePriceInfoType;
