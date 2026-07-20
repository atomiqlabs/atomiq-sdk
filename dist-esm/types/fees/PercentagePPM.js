/**
 * Converts parts-per-million to percentage representation
 *
 * @category Pricing
 */
export function ppmToPercentage(ppm) {
    const percentage = Number(ppm) / 10000;
    return {
        ppm,
        decimal: Number(ppm) / 1000000,
        percentage: percentage,
        toString: (decimals) => (decimals != null ? percentage.toFixed(decimals) : percentage) + "%"
    };
}
