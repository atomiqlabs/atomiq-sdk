"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIAddressSwap = void 0;
function isIAddressSwap(obj) {
    return obj != null &&
        typeof (obj.getAddress) === "function" &&
        typeof (obj.getHyperlink) === "function";
}
exports.isIAddressSwap = isIAddressSwap;
