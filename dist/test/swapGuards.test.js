"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const index_js_1 = require("../index.js");
/**
 * Minimal mock — the guards only ever call getType(), so a stub returning a
 *  fixed SwapType is sufficient to exercise every guard's truth set.
 */
function mockSwap(type) {
    return { getType: () => type };
}
const ALL_TYPES = [
    index_js_1.SwapType.FROM_BTC,
    index_js_1.SwapType.FROM_BTCLN,
    index_js_1.SwapType.TO_BTC,
    index_js_1.SwapType.TO_BTCLN,
    index_js_1.SwapType.TRUSTED_FROM_BTC,
    index_js_1.SwapType.TRUSTED_FROM_BTCLN,
    index_js_1.SwapType.SPV_VAULT_FROM_BTC,
    index_js_1.SwapType.FROM_BTCLN_AUTO
];
// For each guard: the exact set of SwapType values for which it must return true.
const cases = [
    { name: "isFromBTCSwap", guard: index_js_1.isFromBTCSwap, truthy: [index_js_1.SwapType.FROM_BTC] },
    { name: "isFromBTCLNSwap", guard: index_js_1.isFromBTCLNSwap, truthy: [index_js_1.SwapType.FROM_BTCLN] },
    { name: "isToBTCSwap", guard: index_js_1.isToBTCSwap, truthy: [index_js_1.SwapType.TO_BTC] },
    { name: "isToBTCLNSwap", guard: index_js_1.isToBTCLNSwap, truthy: [index_js_1.SwapType.TO_BTCLN] },
    { name: "isOnchainForGasSwap", guard: index_js_1.isOnchainForGasSwap, truthy: [index_js_1.SwapType.TRUSTED_FROM_BTC] },
    { name: "isLnForGasSwap", guard: index_js_1.isLnForGasSwap, truthy: [index_js_1.SwapType.TRUSTED_FROM_BTCLN] },
    { name: "isSpvFromBTCSwap", guard: index_js_1.isSpvFromBTCSwap, truthy: [index_js_1.SwapType.SPV_VAULT_FROM_BTC] },
    { name: "isFromBTCLNAutoSwap", guard: index_js_1.isFromBTCLNAutoSwap, truthy: [index_js_1.SwapType.FROM_BTCLN_AUTO] },
    { name: "isIToBTCSwap", guard: index_js_1.isIToBTCSwap, truthy: [index_js_1.SwapType.TO_BTC, index_js_1.SwapType.TO_BTCLN] },
    { name: "isIFromBTCSelfInitSwap", guard: index_js_1.isIFromBTCSelfInitSwap, truthy: [index_js_1.SwapType.FROM_BTC, index_js_1.SwapType.FROM_BTCLN] },
    { name: "isIEscrowSelfInitSwap", guard: index_js_1.isIEscrowSelfInitSwap, truthy: [index_js_1.SwapType.FROM_BTC, index_js_1.SwapType.FROM_BTCLN, index_js_1.SwapType.TO_BTC, index_js_1.SwapType.TO_BTCLN] }
];
for (const { name, guard, truthy } of cases) {
    (0, node_test_1.test)(name + " matches exactly its mapped SwapType(s) across all 8 values", () => {
        for (const type of ALL_TYPES) {
            const expected = truthy.includes(type);
            (0, node_assert_1.strictEqual)(guard(mockSwap(type)), expected, `${name}(${index_js_1.SwapType[type]}) should be ${expected}`);
        }
    });
}
