import { Token } from "../types/Token";
export declare function toHumanReadableString(amount: bigint, currencySpec: Token): string;
export declare function fromHumanReadableString(amount: string, currencySpec: Token): bigint | null;
