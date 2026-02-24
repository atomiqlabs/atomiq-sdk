import { FeeType } from "../../enums/FeeType";
import { Fee } from "./Fee";
/**
 * Breakdown of fees by type (swap fee, network fee, etc.)
 *
 * @category Pricing
 */
export type FeeBreakdown<ChainIdentifier extends string = string> = {
    type: FeeType;
    fee: Fee<ChainIdentifier>;
}[];
