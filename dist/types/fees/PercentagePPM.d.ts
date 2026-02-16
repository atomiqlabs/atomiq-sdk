/**
 * Parts-per-million fee representation with conversion helpers
 *
 * @category Pricing and LPs
 */
export type PercentagePPM = {
    ppm: bigint;
    decimal: number;
    percentage: number;
    toString: (decimal?: number) => string;
};
/**
 * Converts parts-per-million to percentage representation
 *
 * @category Pricing and LPs
 */
export declare function ppmToPercentage(ppm: bigint): PercentagePPM;
