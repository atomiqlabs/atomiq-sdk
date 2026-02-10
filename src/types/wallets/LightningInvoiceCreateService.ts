export type LightningWalletCallback = (valueSats: number, abortSignal?: AbortSignal) => Promise<string>;
export type LightningInvoiceCreateService = {
    getInvoice: LightningWalletCallback,
    minMsats?: bigint,
    maxMSats?: bigint
};

export function isLightningInvoiceCreateService(obj: any): obj is LightningInvoiceCreateService {
    return typeof (obj) === "object" &&
        typeof (obj.getInvoice) === "function" &&
        (obj.minMsats == null || typeof (obj.minMsats) === "bigint") &&
        (obj.maxMSats == null || typeof (obj.maxMSats) === "bigint");
}
