/**
 * A type with minimum possible required functionality to be usable with lightning network swaps, i.e.
 *  a function to pay bolt11 lightning network invoices.
 *
 * @category Lightning
 */
export type MinimalLightningNetworkWalletInterface = {
    payInvoice: (bolt11PaymentRequest: string) => Promise<string>;
};
