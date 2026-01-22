/**
 * A type with minimum possible required functionality to be usable with lightning network swaps
 * @category Bitcoin
 */
export type MinimalLightningNetworkWalletInterface = {
    payInvoice: (bolt11PaymentRequest: string) => Promise<string>
}
