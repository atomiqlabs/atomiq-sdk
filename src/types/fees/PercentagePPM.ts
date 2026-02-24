/**
 * Parts-per-million fee representation with conversion helpers
 *
 * @category Pricing
 */
export type PercentagePPM = {
    ppm: bigint,
    decimal: number,
    percentage: number,
    toString: (decimal?: number) => string
};

/**
 * Converts parts-per-million to percentage representation
 *
 * @category Pricing
 */
export function ppmToPercentage(ppm: bigint): PercentagePPM {
    const percentage = Number(ppm) / 10_000;
    return {
        ppm,
        decimal: Number(ppm) / 1_000_000,
        percentage: percentage,
        toString: (decimals?: number) => (decimals != null ? percentage.toFixed(decimals) : percentage) + "%"
    }
}
