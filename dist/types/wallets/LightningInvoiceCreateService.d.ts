export type LightningWalletCallback = (valueSats: number, abortSignal?: AbortSignal) => Promise<string>;
export type LightningInvoiceCreateService = {
    getInvoice: LightningWalletCallback;
    minMsats?: bigint;
    maxMSats?: bigint;
};
export declare function isLightningInvoiceCreateService(obj: any): obj is LightningInvoiceCreateService;
