import { test } from "node:test";
import { strictEqual } from "node:assert";
import { SwapType, isFromBTCSwap, isFromBTCLNSwap, isToBTCSwap, isToBTCLNSwap, isOnchainForGasSwap, isLnForGasSwap, isSpvFromBTCSwap, isFromBTCLNAutoSwap, isIToBTCSwap, isIFromBTCSelfInitSwap, isIEscrowSelfInitSwap } from "../index.js";
/**
 * Minimal mock — the guards only ever call getType(), so a stub returning a
 *  fixed SwapType is sufficient to exercise every guard's truth set.
 */
function mockSwap(type) {
    return { getType: () => type };
}
const ALL_TYPES = [
    SwapType.FROM_BTC,
    SwapType.FROM_BTCLN,
    SwapType.TO_BTC,
    SwapType.TO_BTCLN,
    SwapType.TRUSTED_FROM_BTC,
    SwapType.TRUSTED_FROM_BTCLN,
    SwapType.SPV_VAULT_FROM_BTC,
    SwapType.FROM_BTCLN_AUTO
];
// For each guard: the exact set of SwapType values for which it must return true.
const cases = [
    { name: "isFromBTCSwap", guard: isFromBTCSwap, truthy: [SwapType.FROM_BTC] },
    { name: "isFromBTCLNSwap", guard: isFromBTCLNSwap, truthy: [SwapType.FROM_BTCLN] },
    { name: "isToBTCSwap", guard: isToBTCSwap, truthy: [SwapType.TO_BTC] },
    { name: "isToBTCLNSwap", guard: isToBTCLNSwap, truthy: [SwapType.TO_BTCLN] },
    { name: "isOnchainForGasSwap", guard: isOnchainForGasSwap, truthy: [SwapType.TRUSTED_FROM_BTC] },
    { name: "isLnForGasSwap", guard: isLnForGasSwap, truthy: [SwapType.TRUSTED_FROM_BTCLN] },
    { name: "isSpvFromBTCSwap", guard: isSpvFromBTCSwap, truthy: [SwapType.SPV_VAULT_FROM_BTC] },
    { name: "isFromBTCLNAutoSwap", guard: isFromBTCLNAutoSwap, truthy: [SwapType.FROM_BTCLN_AUTO] },
    { name: "isIToBTCSwap", guard: isIToBTCSwap, truthy: [SwapType.TO_BTC, SwapType.TO_BTCLN] },
    { name: "isIFromBTCSelfInitSwap", guard: isIFromBTCSelfInitSwap, truthy: [SwapType.FROM_BTC, SwapType.FROM_BTCLN] },
    { name: "isIEscrowSelfInitSwap", guard: isIEscrowSelfInitSwap, truthy: [SwapType.FROM_BTC, SwapType.FROM_BTCLN, SwapType.TO_BTC, SwapType.TO_BTCLN] }
];
for (const { name, guard, truthy } of cases) {
    test(name + " matches exactly its mapped SwapType(s) across all 8 values", () => {
        for (const type of ALL_TYPES) {
            const expected = truthy.includes(type);
            strictEqual(guard(mockSwap(type)), expected, `${name}(${SwapType[type]}) should be ${expected}`);
        }
    });
}
