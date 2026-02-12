"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ppmToPercentage = void 0;
/**
 * Converts parts-per-million to percentage representation
 *
 * @category Pricing and LPs
 */
function ppmToPercentage(ppm) {
    const percentage = Number(ppm) / 10000;
    return {
        ppm,
        decimal: Number(ppm) / 1000000,
        percentage: percentage,
        toString: (decimals) => (decimals != null ? percentage.toFixed(decimals) : percentage) + "%"
    };
}
exports.ppmToPercentage = ppmToPercentage;
