"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSwapType = void 0;
const SwapType_1 = require("../enums/SwapType");
function isSwapType(swap, swapType) {
    if (swap == null)
        return false;
    if (swap.getType() === SwapType_1.SwapType.SPV_VAULT_FROM_BTC && swapType === SwapType_1.SwapType.FROM_BTC)
        return true;
    if (swap.getType() === SwapType_1.SwapType.FROM_BTCLN_AUTO && swapType === SwapType_1.SwapType.FROM_BTCLN)
        return true;
    return swap.getType() === swapType;
}
exports.isSwapType = isSwapType;
