import { FeeType } from "../../enums/FeeType.js";
import { Fee } from "./Fee.js";
/**
 * Breakdown of fees by type (swap fee, network fee, etc.)
 *
 * @category Pricing
 */
export type FeeBreakdown<ChainIdentifier extends string = string> = {
    type: FeeType;
    fee: Fee<ChainIdentifier>;
}[];
