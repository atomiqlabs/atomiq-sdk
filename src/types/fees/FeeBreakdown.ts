import {FeeType} from "../../enums/FeeType";
import {Fee} from "./Fee";

export type FeeBreakdown<ChainIdentifier extends string = string> = {
    type: FeeType,
    fee: Fee<ChainIdentifier>
}[];