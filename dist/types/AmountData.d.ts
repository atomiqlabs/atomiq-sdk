/**
 * Amount, token and exact input object for initiating swap operations
 *
 * @category Tokens
 */
export type AmountData = {
    amount: bigint;
    token: string;
    exactIn: boolean;
};
