/**
 * Pricing information for swap validation
 * @category Pricing and LPs
 */
export type PriceInfoType = {
    isValid: boolean;
    differencePPM: bigint;
    satsBaseFee: bigint;
    feePPM: bigint;
    realPriceUSatPerToken?: bigint;
    realPriceUsdPerBitcoin?: number;
    swapPriceUSatPerToken: bigint;
};
/**
 * Type guard for PriceInfoType
 * @category Pricing and LPs
 */
export declare function isPriceInfoType(obj: any): obj is PriceInfoType;
/**
 * Serializes PriceInfoType for storage
 * @category Pricing and LPs
 */
export declare function serializePriceInfoType(obj: PriceInfoType | undefined): any;
/**
 * Deserializes PriceInfoType from storage
 * @category Pricing and LPs
 */
export declare function deserializePriceInfoType(obj: any): PriceInfoType | undefined;
