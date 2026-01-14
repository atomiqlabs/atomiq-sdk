export type PriceInfoType = {
    isValid: boolean;
    differencePPM: bigint;
    satsBaseFee: bigint;
    feePPM: bigint;
    realPriceUSatPerToken?: bigint;
    realPriceUsdPerBitcoin?: number;
    swapPriceUSatPerToken: bigint;
};
export declare function isPriceInfoType(obj: any): obj is PriceInfoType;
export declare function serializePriceInfoType(obj: PriceInfoType | undefined): any;
export declare function deserializePriceInfoType(obj: any): PriceInfoType | undefined;
