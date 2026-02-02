import {FeeType} from "../../enums/FeeType";
import {Fee} from "./Fee";

/**
 * Breakdown of fees by type (swap fee vs network fee)
 * @category Pricing and LPs
 */
export type FeeBreakdown<ChainIdentifier extends string = string> = {
    type: FeeType,
    fee: Fee<ChainIdentifier>
}[];