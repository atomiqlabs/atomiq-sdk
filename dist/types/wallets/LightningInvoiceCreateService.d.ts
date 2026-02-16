/**
 * Invoice getter callback for the {@link LightningInvoiceCreateService}
 */
export type LightningWalletCallback = (valueSats: number, abortSignal?: AbortSignal) => Promise<string>;
/**
 * Service that creates on-demand fixed amount bolt11 lightning network invoices, optionally
 *  specifying minimum and maximum swappable sats amount. This used for exact input Smart chain ->
 *  Lightning swaps.
 */
export type LightningInvoiceCreateService = {
    getInvoice: LightningWalletCallback;
    minMsats?: bigint;
    maxMSats?: bigint;
};
/**
 * Type guard for {@link LightningInvoiceCreateService}
 *
 * @internal
 */
export declare function isLightningInvoiceCreateService(obj: any): obj is LightningInvoiceCreateService;
