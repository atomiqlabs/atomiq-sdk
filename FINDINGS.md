## Findings

- [P1] Status-only calls require a Bitcoin wallet. /C:/atomiq/Multichain/sdk/src/swaps/spv_swaps/SpvFromBTCSwap.ts:942 throws before honoring skipBuildingAction. Consequently, getExecutionSteps() and getExecutionStatus({skipBuildingAction: true}) fail for every valid
  CREATED intermediate-wallet swap without a wallet. The latter is used by the SDK’s list/status API at /C:/atomiq/Multichain/sdk/src/api/SwapperApi.ts:295. Wallet lookup should only occur when actually building the current action.

- [P1] Unsupported address types can be funded before becoming unexecutable. /C:/atomiq/Multichain/sdk/src/swaps/spv_swaps/SpvFromBTCSwap.ts:408 accepts all inferred types. A P2PKH wallet is later rejected by submitPsbt() at /C:/atomiq/Multichain/sdk/src/swaps/spv_swaps/
  SpvFromBTCSwapBase.ts:946, while P2WSH reaches the unsupported branch in /C:/atomiq/Multichain/sdk/src/utils/BitcoinWalletUtils.ts:81. Validate supported script types before creating the quote or presenting a deposit address.

- [P1] The public sweepBitcoinWallet() API was removed without a compatibility path. Its replacement at /C:/atomiq/Multichain/sdk/src/swapper/Swapper.ts:1199 has a different signature and return shape, so existing consumers fail to compile. Unless this is intentionally a
  major-version break, retain a deprecated wrapper delegating to the new flow.

- [P2] Exact-output quote selection ignores the input network fee. At /C:/atomiq/Multichain/sdk/src/swapper/Swapper.ts:1650, normal PSBT quotes are selected first and only the winner is converted to intermediate-wallet mode. createSwap() therefore compares base inputs
  before the mode-aware getInput() includes each candidate’s Bitcoin fee. LPs with different minimum fee rates can be ranked incorrectly. Externalize every candidate before best-quote selection.

- [P2] Existing public Promise signatures became synchronous. getTransactionDetails() and getPsbt() at /C:/atomiq/Multichain/sdk/src/swaps/spv_swaps/SpvFromBTCSwapBase.ts:763 and /C:/atomiq/Multichain/sdk/src/swaps/spv_swaps/SpvFromBTCSwapBase.ts:820 returned Promises on
  master. await callers survive, but .then() and explicitly typed consumers break. Preserve the async public contract or introduce synchronous internal helpers.

Verification: direct tsc --noEmit passes with TypeScript 5.9.3, and git diff --check master...HEAD passes. No files were changed.
