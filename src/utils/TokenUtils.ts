import {Token} from "../types/Token";

import {fromDecimal, toDecimal} from "./Utils";

export function toHumanReadableString(amount: bigint, currencySpec: Token): string {
    if(amount==null) return "";
    return toDecimal(amount, currencySpec.decimals, undefined, currencySpec.displayDecimals);
}

export function fromHumanReadableString(amount: string, currencySpec: Token): bigint | null {
    if(amount==="" || amount==null) return null;
    try {
        return fromDecimal(amount, currencySpec.decimals);
    } catch (e) {
        return null;
    }
}
