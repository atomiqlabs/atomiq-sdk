export type PercentagePPM = {
    ppm: bigint;
    decimal: number;
    percentage: number;
    toString: (decimal?: number) => string;
};
export declare function ppmToPercentage(ppm: bigint): PercentagePPM;
