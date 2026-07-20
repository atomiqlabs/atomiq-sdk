/**
 * Type guard for {@link LightningInvoiceCreateService}
 *
 * @internal
 */
export function isLightningInvoiceCreateService(obj) {
    return typeof (obj) === "object" &&
        typeof (obj.getInvoice) === "function" &&
        (obj.minMsats == null || typeof (obj.minMsats) === "bigint") &&
        (obj.maxMSats == null || typeof (obj.maxMSats) === "bigint");
}
