# SPV BTC external-wallet deposit flow - implementation spec

Add first-class SPV external-deposit support to the SDK so the webapp does not need to duplicate fake-UTXO construction, Bitcoin PSBT funding estimation, CPFP fee math, address-swap presentation, or polling/execution glue.

### Single-address wallet mnemonic factory

Add a convenience factory to `SingleAddressBitcoinWallet` for constructing the SDK wallet directly from a persisted mnemonic.

Suggested API:

```ts
SingleAddressBitcoinWallet.fromMnemonic(
  mempoolApi: MempoolApi,
  network: BitcoinNetwork,
  mnemonic: string,
  derivationPath?: string,
  feeMultiplier?: number,
  feeOverride?: number
): SingleAddressBitcoinWallet;
```

The webapp can currently construct the intermediate wallet by calling `SingleAddressBitcoinWallet.mnemonicToPrivateKey(...)` and then passing the WIF into the constructor. A factory keeps that derivation sequence inside the SDK and makes the provider code harder to misuse.

Semantics:

- The factory should derive the same key as `mnemonicToPrivateKey(mnemonic, network, derivationPath)`.
- The factory should not own browser storage or mnemonic lifecycle. The app still decides when to generate, persist, reuse, or forget the mnemonic.
- The factory should not rotate or mutate the mnemonic.
- The existing `generateRandomMnemonic()` and `mnemonicToPrivateKey()` helpers should remain available for lower-level use.

### SPV swap class split

Split the SPV BTC input swap implementation while keeping the public/deserialized class name stable:

- Rename the current `SpvFromBTCSwap` implementation to `SpvFromBTCSwapBase`.
- Add a new public `SpvFromBTCSwap` class extending `SpvFromBTCSwapBase`.
- Keep `SpvFromBTCWrapper._swapDeserializer = SpvFromBTCSwap`, so restored swaps still deserialize into the public `SpvFromBTCSwap` class.
- Keep the existing swap type, storage indexes, state enum, and serialized identity unchanged.
- Put the existing PSBT swap mechanics, SPV vault state handling, settlement logic, and normal wallet-funded execution in `SpvFromBTCSwapBase`.
- Put external-address deposit mode, address-swap compatibility, external deposit waiting, and external deposit execution in the new `SpvFromBTCSwap` class.

This gives the external-deposit flow a clean implementation boundary without creating two different runtime swap classes for the same serialized quote. Existing SDK consumers should continue importing `SpvFromBTCSwap`; the base class is an internal/advanced implementation detail.

### External deposit swap mode

Add explicit swap mode state to the public `SpvFromBTCSwap` class:

```ts
type SpvFromBTCSwapMode = "psbt" | "external";

type SpvExternalSelectedUtxo = {
  txId: string;
  vout: number;
  value: number;
  type: CoinselectAddressTypes;
  cpfp?: {
    txVsize: number;
    txEffectiveFeeRate: number;
  };
};

type SpvFromBTCExternalSwapModeInfo = {
  depositAddress: string;
  depositAddressType: CoinselectAddressTypes;
  selectedExistingUtxos: SpvExternalSelectedUtxo[];
  feeRate: number;
  cpfpAssumptions: {
    txVsize: number;
    txEffectiveFeeRate: number;
  };
  requiredAdditionalUtxoAmount: string;
  totalNetworkFee: string;
};
```

The swap should persist:

- `swapMode`, defaulting to `"psbt"` for old/restored swaps where the field is missing
- `externalSwapModeInfo`, present only when `swapMode === "external"`

NOTE: Careful about the serialization of the `SpvExternalSelectedUtxo` type, as external callers might actually pass `BitcoinWalletUtxo` object which conforms to the required type, but would fail serialization because it also contains a Uint8Array/Buffer!

The selected existing UTXOs are intentionally stored as a funding snapshot, including value, type, and CPFP data. Execution should rehydrate fresh UTXO objects by `txId:vout` before signing, but the snapshot preserves the exact quote-time fee and input amount calculation for synchronous getters such as `getInput()` and `getFeeBreakdown()`.

Add mode APIs:

```ts
getSwapMode(): SpvFromBTCSwapMode;

getExternalSwapModeInfo(): SpvFromBTCExternalSwapModeInfo | null;

setSwapModePsbt(): void;

setSwapModeExternal(
  walletOrAddress: IBitcoinWallet | string,
  existingUtxos?: BitcoinWalletUtxo[],
  feeRate?: number,
  cpfpAssumptions?: {
    txVsize: number;
    txEffectiveFeeRate: number;
  }
): Promise<SpvFromBTCExternalSwapModeInfo>;
```

`setSwapModeExternal()` semantics:

- If `walletOrAddress` is a wallet, infer `depositAddress` from `wallet.getReceiveAddress()`.
- If `existingUtxos` is omitted and `walletOrAddress` is a wallet, fetch UTXOs through `wallet.getUtxoPool()`.
- The wallet overload requires a wallet with `getUtxoPool()` support. If the wallet cannot expose UTXOs, throw a typed unsupported-operation error.
- If `walletOrAddress` is an address string and `existingUtxos` is omitted, fetch UTXOs for that address through the SPV wrapper's Bitcoin RPC/address-index abstraction.
- Infer `depositAddressType` from `depositAddress`; do not require callers to pass an address type manually.
- Normalize `feeRate` with `Math.max(feeRate ?? minimumBtcFeeRate, minimumBtcFeeRate)`.
- Default `cpfpAssumptions` to `{ txEffectiveFeeRate: 1, txVsize: 200 }`.
- For v1, select all currently available UTXOs for the deposit address. This makes everything not included in `selectedExistingUtxos` after mode preparation a candidate newly received deposit UTXO.
- Compute and cache `requiredAdditionalUtxoAmount` and `totalNetworkFee` using an internal external-deposit funding estimator.
- Save the swap mode change so reloads restore external mode.

When `swapMode === "external"`:

- `getInput()` should return the user-facing BTC input amount inclusive of the input-side Bitcoin network fee needed to fund/sign/broadcast the SPV swap PSBT.
- `getFeeBreakdown()` should include the input-side Bitcoin network fee. Add `FeeType.NETWORK_INPUT` for this fee instead of overloading `FeeType.NETWORK_OUTPUT`.
- `getAddress()` should return `externalSwapModeInfo.depositAddress`.
- `getHyperlink()` should return a Bitcoin URI for `depositAddress` and `requiredAdditionalUtxoAmount`.
- `waitForExternalDeposit(...)` should wait for one newly received UTXO matching `requiredAdditionalUtxoAmount`.
- `executeExternalDeposit(...)` should execute the swap with the fresh selected existing UTXOs plus the matched new UTXO, spending that funding set fully without leaving change in the intermediate wallet.

When `swapMode === "psbt"`:

- The swap should behave like the current SPV PSBT-signing swap.
- `setSwapModePsbt()` should clear or ignore cached external fee/deposit values so `getInput()` and `getFeeBreakdown()` return normal PSBT-mode values.
- `getAddress()` and `getHyperlink()` may exist on the class for interface compatibility, but should throw a clear error if called while the swap is not in external mode.

Update `IAddressSwap` typeguard behavior so this mode can be represented cleanly:

```ts
export function isIAddressSwap(obj: any): obj is IAddressSwap {
  return obj != null &&
    typeof obj.getAddress === "function" &&
    typeof obj.getHyperlink === "function" &&
    (typeof obj.isAddressSwapMode !== "function" || obj.isAddressSwapMode());
}
```

`SpvFromBTCSwap` should implement `isAddressSwapMode()` and return `swapMode === "external"`. Existing address swaps do not need to implement this method.

### Future-UTXO quote creation

Add a quote creation helper for SPV BTC input quotes that expects one future incoming UTXO to be added to the wallet/address. This helper should return a normal public `SpvFromBTCSwap` already configured in external mode through `setSwapModeExternal(...)`.

This replaces the need for both:

- a generic `Swapper.swap()` special case for `amount: null` plus `sourceWalletUtxos`
- webapp-side construction of fake `BitcoinWalletUtxoBase` objects

Suggested API shape:

```ts
createSpvFromBtcSwapWithExternalDeposit(
  externalDeposit: {
    walletOrAddress: IBitcoinWallet | string;
    existingUtxos?: BitcoinWalletUtxo[];
    feeRate?: number;
    cpfpAssumptions?: {
      txVsize: number;
      txEffectiveFeeRate: number;
    };
  },
  dstToken: SCToken<ChainIdentifier>,
  amount: bigint | string,
  exactIn: boolean | SwapAmountType,
  dstSmartchainWallet: string,
  options?: SpvFromBTCOptions
): Promise<SpvFromBTCSwap>;
```

The exact positional arguments relevant for the specific swap type should be used here, matching the normal `swap(...)` overload for SPV BTC to smart-chain swaps. Do not expose this as an untyped `Parameters<Swapper["swap"]>` placeholder in the public API; use concrete overloads/signatures so SDK consumers get the same type safety and autocomplete as the regular swap creation path.

Semantics:

- The arguments after `externalDeposit` should behave like the regular `swap(...)` call for SPV BTC to smart-chain swaps.
- For exact-input quotes, the regular `amount` argument is the user-visible total BTC input amount for the quote. It is the total amount the user wants to commit to this swap flow across existing wallet UTXOs plus the future incoming UTXO. It is not the future UTXO amount by itself.
- For exact-output quotes, the regular `amount` argument keeps its normal meaning as the requested output amount; the SDK derives the required BTC input and then prepares external mode from that quote.
- If `existingUtxos` is omitted, the SDK should fetch current UTXOs from `walletOrAddress` using the same rules as `setSwapModeExternal()`.
- For v1, all fetched/supplied existing UTXOs for the deposit address are selected.
- `cpfpAssumptions` describe only the future incoming UTXO and default to `{ txEffectiveFeeRate: 1, txVsize: 200 }`.
- For exact-input quotes, the SDK should quote as if the funding set were all selected existing UTXOs plus one synthetic UTXO with value equal to the missing amount from the regular `amount` argument, using the inferred deposit address type and the supplied/default CPFP assumptions.
- The SDK must not quote exact-input requests against `amount + selectedExistingUtxoTotal`. For example, if the user enters `0.01 BTC` and the intermediate wallet already holds `0.002 BTC`, the quote should be for a total `0.01 BTC` input budget and should report an additional deposit requirement of `0.008 BTC`, before any rounding/dust constraints.
- The SDK should set or derive the SPV `bitcoinFeeRate` from `feeRate` and use the same minimum-fee-rate normalization as execution.
- The returned quote should have `swapMode === "external"` and an `externalSwapModeInfo` snapshot populated.
- If existing UTXOs already cover the required BTC input budget, `requiredAdditionalUtxoAmount` should be zero. In that case the app should not show a new external-deposit QR; it should execute from the connected wallet or prompt for a normal re-quote if exact funding cannot be represented cleanly.

For the first webapp implementation, `existingUtxos` will usually be `[]`; if the intermediate wallet already has a non-zero balance it should normally auto-connect as the input wallet and quote from real UTXOs. Supporting `existingUtxos` in the SDK helper still matters because it keeps the primitive correct for partial wallet funding and avoids another helper later.
