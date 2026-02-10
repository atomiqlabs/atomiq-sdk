"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLightningInvoiceCreateService = void 0;
function isLightningInvoiceCreateService(obj) {
    return typeof (obj) === "object" &&
        typeof (obj.getInvoice) === "function" &&
        (obj.minMsats == null || typeof (obj.minMsats) === "bigint") &&
        (obj.maxMSats == null || typeof (obj.maxMSats) === "bigint");
}
exports.isLightningInvoiceCreateService = isLightningInvoiceCreateService;
