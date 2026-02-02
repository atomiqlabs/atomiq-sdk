/**
 * Simple amount definition for swap operations
 * @category Tokens
 */
export type AmountData = {
    amount: bigint;
    token: string;
    exactIn: boolean;
};
