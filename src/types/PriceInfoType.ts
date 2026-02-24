import {toBigInt} from "../utils/Utils";

/**
 * Pricing information for swap validation
 * @category Pricing
 */
export type PriceInfoType = {
    isValid: boolean,
    differencePPM: bigint,
    satsBaseFee: bigint,
    feePPM: bigint,
    realPriceUSatPerToken?: bigint,
    realPriceUsdPerBitcoin?: number,
    swapPriceUSatPerToken: bigint
};

/**
 * Type guard for PriceInfoType
 * @category Pricing
 */
export function isPriceInfoType(obj: any): obj is PriceInfoType {
    return obj != null &&
        typeof (obj.isValid) === "boolean" &&
        typeof (obj.differencePPM) === "bigint" &&
        typeof (obj.satsBaseFee) === "bigint" &&
        typeof (obj.feePPM) === "bigint" &&
        (obj.realPriceUSatPerToken == null || typeof (obj.realPriceUSatPerToken) === "bigint") &&
        (obj.realPriceUsdPerBitcoin == null || typeof (obj.realPriceUsdPerBitcoin) === "number") &&
        typeof (obj.swapPriceUSatPerToken) === "bigint";
}

/**
 * Serializes PriceInfoType for storage
 * @category Pricing
 */
export function serializePriceInfoType(obj: PriceInfoType | undefined): any {
    if (obj == null) return null;
    return {
        isValid: obj.isValid,
        differencePPM: obj.differencePPM == null ? null : obj.differencePPM.toString(10),
        satsBaseFee: obj.satsBaseFee == null ? null : obj.satsBaseFee.toString(10),
        feePPM: obj.feePPM == null ? null : obj.feePPM.toString(10),
        realPriceUSatPerToken: obj.realPriceUSatPerToken == null ? null : obj.realPriceUSatPerToken.toString(10),
        realPriceUsdPerBitcoin: obj.realPriceUsdPerBitcoin,
        swapPriceUSatPerToken: obj.swapPriceUSatPerToken == null ? null : obj.swapPriceUSatPerToken.toString(10),
    }
}

/**
 * Deserializes PriceInfoType from storage
 * @category Pricing
 */
export function deserializePriceInfoType(obj: any): PriceInfoType | undefined {
    if (obj == null) return;
    if (
        obj.isValid != null && obj.differencePPM != null && obj.satsBaseFee != null &&
        obj.feePPM != null && obj.swapPriceUSatPerToken != null
    ) return {
        isValid: obj.isValid,
        differencePPM: toBigInt(obj.differencePPM),
        satsBaseFee: toBigInt(obj.satsBaseFee),
        feePPM: toBigInt(obj.feePPM),
        realPriceUSatPerToken: toBigInt(obj.realPriceUSatPerToken),
        realPriceUsdPerBitcoin: obj.realPriceUsdPerBitcoin,
        swapPriceUSatPerToken: toBigInt(obj.swapPriceUSatPerToken),
    }
}