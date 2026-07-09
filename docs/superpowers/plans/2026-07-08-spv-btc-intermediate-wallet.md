# SPV BTC Intermediate Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class SPV external-deposit/intermediate-wallet support to the SDK, so apps can quote, display, wait for, and execute SPV BTC -> smart-chain swaps without duplicating fake UTXO construction, fee estimation, or address-swap polling logic.

**Architecture:** Keep `SpvFromBTCSwap` as the public/deserialized class. Rename the current implementation to `SpvFromBTCSwapBase`, then add a new public `SpvFromBTCSwap` subclass for external-deposit mode, address-swap compatibility, external UTXO estimation, waiting, and execution. Add a public quote helper that creates a normal `SpvFromBTCSwap` already configured in external mode. Add a mnemonic factory to `SingleAddressBitcoinWallet`.

**Tech Stack:** TypeScript, atomiq-sdk swap internals, `@scure/btc-signer`, `@scure/bip39`, `BitcoinRpcWithAddressIndex`, existing SPV wrapper/coinselect utilities.

**Spec:** `docs/superpowers/specs/2026-07-08-spv-btc-intermediate-wallet.md`

**Branch:** current SPV refactor branch

---

## Documentation Requirements

Every implemented function, method, exported type, and non-obvious helper introduced by this plan must have a valid TSDoc/docstring.

Document:

- what the API does
- parameter semantics, especially `walletOrAddress`, `existingUtxos`, `feeRate`, `cpfpAssumptions`, and exact-input amount handling
- return values
- mode-specific behavior (`"psbt"` vs `"external"`)
- thrown errors for unsupported wallets, missing UTXO access, invalid mode calls, expired quotes, or missing deposits
- persistence/serialization caveats where full UTXO objects are kept in memory but narrowed in `serialize()`

Avoid placeholder comments. Keep comments concise, but make them useful for SDK consumers and future maintainers.

---

## File Structure

Keep the public import path for SPV swaps stable. Prefer modifying the existing SPV files rather than adding a parallel public swap module.

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/BitcoinUtils.ts` | Modify | Extend address type inference and add shared address UTXO conversion helper |
| `src/bitcoin/wallet/BitcoinWallet.ts` | Modify | Reuse shared `getWalletAddressUtxos(...)` in `_getUtxoPool(...)` |
| `src/bitcoin/wallet/SingleAddressBitcoinWallet.ts` | Modify | Add `fromMnemonic(...)` factory; share derivation with `mnemonicToPrivateKey(...)` |
| `src/enums/FeeType.ts` | Modify | Add `FeeType.NETWORK_INPUT` for Bitcoin input-side network fees |
| `src/swaps/IAddressSwap.ts` | Modify | Add optional `isAddressSwapMode()` support in the type guard/interface |
| `src/swaps/spv_swaps/SpvFromBTCSwap.ts` | Modify | Rename current implementation to `SpvFromBTCSwapBase`; add new public `SpvFromBTCSwap` subclass, mode types, external mode persistence, address-swap APIs, external wait/execute APIs |
| `src/swaps/spv_swaps/SpvFromBTCWrapper.ts` | Don't touch | Keep the normal SPV quote path unchanged; do not add an external-deposit wrapper helper |
| `src/swapper/Swapper.ts` | Modify | Add typed public `createSpvFromBtcSwapWithExternalDeposit(...)` helper |
| `src/swapper/SwapperWithChain.ts` | Modify | Add chain-scoped convenience helper |
| `src/swapper/SwapperWithSigner.ts` | Modify | Add signer-scoped convenience helper returning `SwapWithSigner<SpvFromBTCSwap<...>>` |
| `src/index.ts` | Modify | Export the new public SPV external mode types; do not export `SpvFromBTCSwapBase` from the SDK barrel unless explicitly needed |

---

### Task 1: Add shared Bitcoin address and UTXO utilities

**Files:**
- Modify: `src/utils/BitcoinUtils.ts`
- Modify: `src/bitcoin/wallet/BitcoinWallet.ts`

- [ ] **Step 1: Extend `toCoinselectAddressType(...)` to accept addresses**

Keep the existing script-based usage working, but add an overload that accepts `(network, address)` and infers the same `CoinselectAddressTypes` from the decoded address.

```typescript
export function toCoinselectAddressType(outputScript: Uint8Array): CoinselectAddressTypes;
export function toCoinselectAddressType(network: BTC_NETWORK, address: string): CoinselectAddressTypes;
export function toCoinselectAddressType(
    outputScriptOrNetwork: Uint8Array | BTC_NETWORK,
    address?: string
): CoinselectAddressTypes {
    const data = address == null
        ? OutScript.decode(outputScriptOrNetwork as Uint8Array)
        : Address(outputScriptOrNetwork as BTC_NETWORK).decode(address);

    switch(data.type) {
        case "pkh":
            return "p2pkh";
        case "sh":
            return "p2sh-p2wpkh";
        case "wpkh":
            return "p2wpkh";
        case "wsh":
            return "p2wsh";
        case "tr":
            return "p2tr";
    }
    throw new Error("Unrecognized address type!");
}
```

Do not add a separate `getDepositAddressType(...)` helper in the SPV swap class. Use this overloaded `toCoinselectAddressType(...)` directly.

- [ ] **Step 2: Add `getWalletAddressUtxos(...)` to `BitcoinUtils`**

Move the address UTXO conversion shape out of `BitcoinWallet._getUtxoPool(...)` so SPV external mode can reuse it without adding local helpers.

```typescript
export async function getWalletAddressUtxos(
    bitcoinRpc: BitcoinRpcWithAddressIndex<any>,
    network: BTC_NETWORK,
    address: string,
    addressType?: CoinselectAddressTypes
): Promise<BitcoinWalletUtxo[]> {
    const resolvedAddressType = addressType ?? toCoinselectAddressType(network, address);

    const utxos = await bitcoinRpc.getAddressUTXOs(address);
    const outputScript = toOutputScript(network, address);

    return await Promise.all(utxos.map(async utxo => ({
        vout: utxo.vout,
        txId: utxo.txid,
        value: Number(utxo.value),
        type: resolvedAddressType,
        outputScript,
        address,
        cpfp: !utxo.confirmed ? await bitcoinRpc.getCPFPData(utxo.txid).then(result => {
            if(result == null) return undefined;
            return {
                txVsize: result.adjustedVsize,
                txEffectiveFeeRate: result.effectiveFeePerVsize
            };
        }) : undefined,
        confirmed: utxo.confirmed
    })));
}
```

Use type-only imports where possible:

- `BitcoinRpcWithAddressIndex` from `@atomiqlabs/base`
- `BitcoinWalletUtxo` from `../bitcoin/wallet/IBitcoinWallet`

- [ ] **Step 3: Wire `BitcoinWallet._getUtxoPool(...)` through the utility**

Replace the duplicated conversion implementation in `src/bitcoin/wallet/BitcoinWallet.ts` with:

```typescript
protected async _getUtxoPool(
    sendingAddress: string,
    sendingAddressType: CoinselectAddressTypes
): Promise<BitcoinWalletUtxo[]> {
    return getWalletAddressUtxos(this.rpc, this.network, sendingAddress, sendingAddressType);
}
```

This keeps existing wallet behavior the same and makes address-only external SPV mode use the same UTXO shape.

- [ ] **Step 4: Verify**

Run:

```bash
tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/BitcoinUtils.ts src/bitcoin/wallet/BitcoinWallet.ts
git commit -m "Add shared bitcoin address UTXO utilities"
```

---

### Task 2: Add mnemonic wallet factory

**Files:**
- Modify: `src/bitcoin/wallet/SingleAddressBitcoinWallet.ts`

- [ ] **Step 1: Keep async mnemonic derivation as the source of truth**

Use the existing `mnemonicToPrivateKey(...)` helper from `fromMnemonic(...)` instead of adding a synchronous duplicate. It is fine for `fromMnemonic(...)` to be async.

While touching this code, make sure the existing helper respects a custom `derivationPath`. The current defaulting logic should use nullish assignment instead of overwriting a supplied value:

```typescript
static async mnemonicToPrivateKey(
    mnemonic: string,
    network?: BitcoinNetwork | BTC_NETWORK,
    derivationPath?: string
): Promise<string> {
    const networkObject = network==null || typeof(network)==="object"
        ? network
        : BitcoinWallet.bitcoinNetworkToObject(network);

    derivationPath ??= networkObject==null || networkObject.bech32===NETWORK.bech32
        ? "m/84'/0'/0'/0/0"
        : "m/84'/1'/0'/0/0";

    const seed = await mnemonicToSeed(mnemonic);
    const hdKey = HDKey.fromMasterSeed(seed);
    const privateKey = hdKey.derive(derivationPath).privateKey;
    if(privateKey==null) throw new Error("Cannot derive private key from the mnemonic!");
    return WIF(networkObject).encode(privateKey);
}
```

Do not import `mnemonicToSeedSync`; keep using the already imported async `mnemonicToSeed`.

- [ ] **Step 2: Add async `fromMnemonic(...)`**

```typescript
static async fromMnemonic(
    mempoolApi: BitcoinRpcWithAddressIndex<any>,
    network: BitcoinNetwork | BTC_NETWORK,
    mnemonic: string,
    derivationPath?: string,
    feeMultiplier?: number,
    feeOverride?: number
): Promise<SingleAddressBitcoinWallet> {
    return new SingleAddressBitcoinWallet(
        mempoolApi,
        network,
        await SingleAddressBitcoinWallet.mnemonicToPrivateKey(mnemonic, network, derivationPath),
        feeMultiplier,
        feeOverride
    );
}
```

- [ ] **Step 3: Keep `mnemonicToPrivateKey(...)` behavior compatible**

Do not remove `generateRandomMnemonic()` or `mnemonicToPrivateKey(...)`. Existing callers of `mnemonicToPrivateKey(...)` should keep working, and new callers can use `await SingleAddressBitcoinWallet.fromMnemonic(...)`.

- [ ] **Step 4: Verify this file compiles**

Run:

```bash
tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/bitcoin/wallet/SingleAddressBitcoinWallet.ts
git commit -m "Add mnemonic factory for single address bitcoin wallet"
```

---

### Task 3: Add shared public type and fee plumbing

**Files:**
- Modify: `src/enums/FeeType.ts`
- Modify: `src/swaps/IAddressSwap.ts`

- [ ] **Step 1: Add `FeeType.NETWORK_INPUT`**

Preserve the existing numeric values for `SWAP` and `NETWORK_OUTPUT`.

```typescript
export enum FeeType {
    SWAP = 0,
    NETWORK_OUTPUT = 1,
    NETWORK_INPUT = 2
}
```

Use `NETWORK_INPUT` only for input-side Bitcoin transaction fees in external SPV mode. Do not overload `NETWORK_OUTPUT`, which currently represents destination/watchtower output-side fees.

- [ ] **Step 2: Make `IAddressSwap` mode-aware**

Update the interface to allow an optional mode predicate:

```typescript
export interface IAddressSwap {
    getAddress(): string;
    getHyperlink(): string;
    isAddressSwapMode?(): boolean;
}
```

Update the type guard exactly as specified:

```typescript
export function isIAddressSwap(obj: any): obj is IAddressSwap {
    return obj != null &&
        typeof(obj.getAddress) === "function" &&
        typeof(obj.getHyperlink) === "function" &&
        (typeof(obj.isAddressSwapMode) !== "function" || obj.isAddressSwapMode());
}
```

Existing address swaps do not need to implement `isAddressSwapMode()`.

- [ ] **Step 3: Verify shared changes compile**

Run:

```bash
tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/enums/FeeType.ts src/swaps/IAddressSwap.ts
git commit -m "Add input network fee type and mode-aware address swaps"
```

---

### Task 4: Split `SpvFromBTCSwap` into base and public subclass

**Files:**
- Modify: `src/swaps/spv_swaps/SpvFromBTCSwap.ts`
- Verify references in: `src/swaps/spv_swaps/SpvFromBTCWrapper.ts`, `src/swapper/*.ts`, `src/utils/SwapUtils.ts`, `src/types/SwapWithSigner.ts`, `src/index.ts`

**Reference:** The current `SpvFromBTCSwap` class owns PSBT construction, LP submit, settlement, state sync, persistence, and `getInputUtxoAmount(...)`.

- [ ] **Step 1: Rename the existing class**

Rename the current class declaration:

```typescript
export class SpvFromBTCSwap<T extends ChainType>
```

to:

```typescript
export class SpvFromBTCSwapBase<T extends ChainType>
```

Keep the existing state enum, init type, init type guard, and serialized fields unchanged.

Do not change:
- `SwapType.SPV_VAULT_FROM_BTC`
- storage indexes
- `SpvFromBTCSwapState`
- `SpvFromBTCSwapInit`
- the serialized identity fields such as `quoteId`, `vaultUtxo`, `btcAmount`, `randomNonce`

- [ ] **Step 2: Add a new public subclass with the old public name**

Add this below the base class or near the end of the same file:

```typescript
export class SpvFromBTCSwap<T extends ChainType> extends SpvFromBTCSwapBase<T> {}
```

The new subclass must become the home for external-deposit mode. The base class remains the home for normal PSBT mechanics and existing SPV lifecycle behavior.

Do not add a pass-through constructor during the mechanical split. TypeScript can inherit the base constructor signature here. Task 5 adds an explicit subclass constructor when external-mode fields are introduced and need deserialization.

- [ ] **Step 3: Keep wrapper deserialization pointing at the public class**

Confirm `SpvFromBTCWrapper` still imports and uses the public class:

```typescript
readonly _swapDeserializer = SpvFromBTCSwap;
```

Restored swaps must deserialize into `SpvFromBTCSwap`, not `SpvFromBTCSwapBase`.

- [ ] **Step 4: Compile and commit the mechanical rename/split**

Before moving methods or changing behavior, compile the pure rename/split:

```bash
tsc --noEmit
```

Then commit just the mechanical rename/split. Use `git add -A` so any file rename is recorded as a rename instead of being mixed into later behavioral diffs.

```bash
git add -A src/swaps/spv_swaps/SpvFromBTCSwap.ts src/swaps/spv_swaps src/swapper src/utils src/types src/index.ts
git commit -m "Rename SPV BTC swap implementation to base class"
```

This commit should contain only:

- renaming the current implementation to `SpvFromBTCSwapBase`
- adding the empty public `SpvFromBTCSwap` subclass
- import/type reference updates required for compilation
- no external-mode behavior changes
- no `getInputUtxoAmount(...)` logic changes

- [ ] **Step 5: Move and update `getInputUtxoAmount(...)` in the new public subclass**

This helper was already added during the refactor start. It must not remain on the renamed base class.

Move/reuse the method in `SpvFromBTCSwap`, because it is specifically part of the external-deposit/intermediate-wallet behavior.

While moving it, update the estimator semantics to match external mode:

- Do not filter out detrimental inputs with `utils.isDetrimentalInput(...)`.
- Use the passed `existingUtxos` array exactly as the selected funding set for `existingUtxoBalance`, `cpfpFeeSum`, and `transactionBytes(...)`.
- A detrimental existing UTXO must increase the network fee and therefore may increase `requiredAdditionalUtxoAmount`; it must not be silently excluded.
- This is required because external mode selects all current UTXOs for v1 and execution spends the selected funding set fully.

Implementation detail: after moving it to the subclass, avoid depending on private base fields. Use public/protected base APIs where possible:

- Use `super.getInput().rawAmount` for the required LP BTC send amount rather than reading `btcAmount` directly.
- Use `this.getTransactionDetails()` for scripts and transaction shape.
- `wrapper` and `pricingInfo` are protected through `ISwap`, so `toTokenAmount(...)` can still be created in the subclass.

- [ ] **Step 6: Compile after moving the estimator**

Run:

```bash
tsc --noEmit
```

Fix any type references caused by moving the estimator into the public subclass.

- [ ] **Step 7: Commit the estimator move/update**

```bash
git add src/swaps/spv_swaps/SpvFromBTCSwap.ts
git commit -m "Move SPV external funding estimator to public swap class"
```

---

### Task 5: Add external swap mode state and persistence

**Files:**
- Modify: `src/swaps/spv_swaps/SpvFromBTCSwap.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Add external mode public types**

Add these near `SpvFromBTCSwapInit` or immediately before the public subclass:

```typescript
export type SpvFromBTCSwapMode = "psbt" | "external";

export type SpvExternalSelectedUtxo = {
    txId: string;
    vout: number;
    value: number;
    type: CoinselectAddressTypes;
    cpfp?: {
        txVsize: number;
        txEffectiveFeeRate: number;
    };
};

export type SpvFromBTCExternalSwapModeInfo = {
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

- [ ] **Step 2: Add subclass fields and constructor hydration**

In the new public `SpvFromBTCSwap` subclass:

```typescript
private swapMode: SpvFromBTCSwapMode = "psbt";
private externalSwapModeInfo: SpvFromBTCExternalSwapModeInfo | null = null;
```

Add an explicit constructor at this point, because the subclass now owns persisted fields that the base constructor cannot deserialize:

```typescript
constructor(wrapper: SpvFromBTCWrapper<T>, init: SpvFromBTCSwapInit);
constructor(wrapper: SpvFromBTCWrapper<T>, obj: any);
constructor(wrapper: SpvFromBTCWrapper<T>, initOrObject: SpvFromBTCSwapInit | any) {
    super(wrapper, initOrObject);

    if(!isSpvFromBTCSwapInit(initOrObject)) {
        this.swapMode = initOrObject.swapMode ?? "psbt";
        this.externalSwapModeInfo = this.swapMode === "external"
            ? SpvFromBTCSwap.deserializeExternalSwapModeInfo(initOrObject.externalSwapModeInfo)
            : null;
    }
}
```

Constructor rules:

- New quotes default to `swapMode = "psbt"`.
- Restored swaps with missing `swapMode` default to `"psbt"`.
- Restored swaps with `swapMode === "external"` require a valid `externalSwapModeInfo`; otherwise fall back to `"psbt"`.
- Don't add additional helpers if not required, the validation should nicely fit in the constructor, do runtime validation before assigning the persisted object.

- [ ] **Step 3: Keep in-memory UTXOs unchanged**

Do not add a UTXO snapshot helper. Keep `externalSwapModeInfo.selectedExistingUtxos` in memory exactly as the objects were passed or fetched, including full `BitcoinWalletUtxo` objects when available.

The only place where the selected UTXOs must be narrowed to `SpvExternalSelectedUtxo` is `serialize()`, because persistence is where `BitcoinWalletUtxo.outputScript`, `address`, `confirmed`, and any `Buffer`/`Uint8Array` values would cause problems.

- [ ] **Step 4: Override `serialize()` in the subclass**

```typescript
serialize(): any {
    const externalSwapModeInfo = this.swapMode === "external" && this.externalSwapModeInfo != null
        ? {
            ...this.externalSwapModeInfo,
            selectedExistingUtxos: this.externalSwapModeInfo.selectedExistingUtxos.map(utxo => ({
                txId: utxo.txId,
                vout: utxo.vout,
                value: utxo.value,
                type: utxo.type,
                cpfp: utxo.cpfp == null ? undefined : {
                    txVsize: utxo.cpfp.txVsize,
                    txEffectiveFeeRate: utxo.cpfp.txEffectiveFeeRate
                }
            }))
        }
        : null;

    return {
        ...super.serialize(),
        swapMode: this.swapMode,
        externalSwapModeInfo
    };
}
```

Only include a non-null `externalSwapModeInfo` when `swapMode === "external"`. Keep the UTXO property selection inline in `serialize()`; do not add a helper unless another caller is added later.

- [ ] **Step 5: Add mode getters**

```typescript
getSwapMode(): SpvFromBTCSwapMode {
    return this.swapMode;
}

getExternalSwapModeInfo(): SpvFromBTCExternalSwapModeInfo | null {
    return this.externalSwapModeInfo;
}
```

Return the stored mode info as read-only-by-convention. If callers mutating returned objects is a concern, return a shallow/deep clone.

- [ ] **Step 6: Add `setSwapModePsbt()`**

```typescript
setSwapModePsbt(): void {
    this.swapMode = "psbt";
    this.externalSwapModeInfo = null;
    if(this._persisted) this._save().catch(e => this.logger.error("setSwapModePsbt(): failed to save", e));
}
```

The method is `void` by spec, so persistence has to be fire-and-forget if the swap is already persisted.

- [ ] **Step 7: Resolve external address and UTXOs inline**

Do not add SPV-local helpers for address type inference or address UTXO fetching.

Use the shared utilities from Task 1:

- `toCoinselectAddressType(this.wrapper._options.bitcoinNetwork, depositAddress)` for address type inference.
- `getWalletAddressUtxos(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, depositAddress, depositAddressType)` when an address string needs UTXOs fetched through the SDK's Bitcoin RPC/address index.

Implement the small amount of mode-specific resolution directly inside `setSwapModeExternal(...)`:

```typescript
const depositAddress = typeof walletOrAddress === "string"
    ? walletOrAddress
    : walletOrAddress.getReceiveAddress();

const depositAddressType = toCoinselectAddressType(this.wrapper._options.bitcoinNetwork, depositAddress);

const selectedExistingUtxos = existingUtxos ?? (
    typeof walletOrAddress === "string"
        ? await getWalletAddressUtxos(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, depositAddress, depositAddressType)
        : await walletOrAddress.getUtxoPool!()
);
```

Rules:

- If `walletOrAddress` is a wallet, infer `depositAddress` from `wallet.getReceiveAddress()`.
- If `existingUtxos` is omitted and `walletOrAddress` is a wallet, require `wallet.getUtxoPool`.
- If `wallet.getUtxoPool` is missing, throw a clear unsupported-operation error before calling it.
- If `walletOrAddress` is an address string and `existingUtxos` is omitted, fetch through `getWalletAddressUtxos(...)`.
- If `existingUtxos` is passed, keep those UTXO objects as-is in memory.

- [ ] **Step 8: Add `setSwapModeExternal(...)`**

```typescript
async setSwapModeExternal(
    walletOrAddress: IBitcoinWallet | string,
    existingUtxos?: BitcoinWalletUtxo[],
    feeRate?: number,
    cpfpAssumptions?: {
        txVsize: number;
        txEffectiveFeeRate: number;
    }
): Promise<SpvFromBTCExternalSwapModeInfo> {
    // resolve address, UTXOs, fee rate, defaults
    // compute external funding amounts through getInputUtxoAmount(...)
    // store mode info and save
}
```

Rules:

- Normalize `feeRate` with `Math.max(feeRate ?? this.minimumBtcFeeRate, this.minimumBtcFeeRate)`.
- Default `cpfpAssumptions` to `{ txEffectiveFeeRate: 1, txVsize: 200 }`.
- For v1, select all currently available UTXOs for the deposit address.
- Call `getInputUtxoAmount(...)` from the public subclass.
- Store:
  - `requiredAdditionalUtxoAmount: estimation.requiredAdditionalUtxoAmount.rawAmount.toString(10)`
  - `totalNetworkFee: estimation.totalNetworkFee.rawAmount.toString(10)`
- Save the swap mode change with `await this._save()` if persisted.

- [ ] **Step 9: Export public mode types**

Update `src/index.ts`:

```typescript
export {
    SpvFromBTCSwap,
    SpvFromBTCSwapState,
    SpvFromBTCSwapMode,
    SpvExternalSelectedUtxo,
    SpvFromBTCExternalSwapModeInfo
} from "./swaps/spv_swaps/SpvFromBTCSwap";
```

Use type-only exports if needed by the TypeScript version/style used in the repo.

- [ ] **Step 10: Verify**

Run:

```bash
tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add src/swaps/spv_swaps/SpvFromBTCSwap.ts src/index.ts
git commit -m "Add external mode state for SPV BTC swaps"
```

---

### Task 6: Implement external mode behavior, waiting, and execution

**Files:**
- Modify: `src/swaps/spv_swaps/SpvFromBTCSwap.ts`

- [ ] **Step 1: Implement address-swap compatibility**

Make the public subclass implement `IAddressSwap`.

```typescript
isAddressSwapMode(): boolean {
    return this.swapMode === "external";
}

getAddress(): string {
    if(this.swapMode !== "external" || this.externalSwapModeInfo == null) throw new Error("SPV swap is not in external deposit mode");
    return this.externalSwapModeInfo.depositAddress;
}

getHyperlink(): string {
    if(this.swapMode !== "external" || this.externalSwapModeInfo == null) throw new Error("SPV swap is not in external deposit mode");
    const amount = toTokenAmount(
        BigInt(this.externalSwapModeInfo.requiredAdditionalUtxoAmount),
        BitcoinTokens.BTC,
        this.wrapper._prices,
        this.pricingInfo
    ).amount;
    return "bitcoin:" + this.externalSwapModeInfo.depositAddress + "?amount=" + encodeURIComponent(amount);
}
```

In `"psbt"` mode, `getAddress()` and `getHyperlink()` must throw a clear error. Gate these methods on `this.swapMode === "external"` as well as `externalSwapModeInfo != null`; do not rely only on the info object being cleared, because future changes might switch modes while leaving cached mode info in memory.

- [ ] **Step 2: Override `getInput()`**

External mode should include the input-side Bitcoin transaction fee:

```typescript
getInput(): TokenAmount<BtcToken<false>, true> {
    if(this.externalSwapModeInfo == null) return super.getInput();
    return toTokenAmount(
        super.getInput().rawAmount + BigInt(this.externalSwapModeInfo.totalNetworkFee),
        BitcoinTokens.BTC,
        this.wrapper._prices,
        this.pricingInfo
    );
}
```

PSBT mode must keep the old value from `super.getInput()`.

- [ ] **Step 3: Override `getFeeBreakdown()`**

In external mode, append a `FeeType.NETWORK_INPUT` entry.

Use the same `Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>` shape as the existing fee breakdown. For the input network fee:

- `amountInSrcToken` is the BTC network fee.
- `amountInDstToken` should be represented with `toTokenAmount(...)` using the output token and current pricing info where possible.
- Keep `SWAP` and `NETWORK_OUTPUT` entries unchanged from `super.getFeeBreakdown()`.

- [ ] **Step 4: Add quote-stable UTXO rehydration**

Execution must not blindly reuse persisted minimal UTXO records, but it must also not blindly replace the quote-time fee model with fresh CPFP metadata. Add a helper:

```typescript
private async rehydrateExternalFundingUtxos(matchedNewUtxo?: BitcoinWalletUtxo): Promise<BitcoinWalletUtxo[]> {
    // fetch current deposit address UTXOs
    // match selectedExistingUtxos by txId:vout
    // build execution UTXOs from fresh signing data plus quote-time fee metadata
    // include the matched new UTXO with the quote-time future-UTXO CPFP assumptions
}
```

Rules:

- If a selected existing UTXO no longer exists, throw a clear error and ask for a re-quote.
- Match by `txId + ":" + vout`.
- Use fresh full UTXO objects for spendability/signing fields such as `txId`, `vout`, `outputScript`, `address`, and `confirmed`.
- Preserve quote-time fee model fields for selected existing UTXOs: after verifying the fresh UTXO still has the same `value` and `type`, use the persisted `value`, `type`, and `cpfp` on the execution UTXO passed to `fundPsbt(...)`.
- For the matched new UTXO, use the fresh UTXO object for spendability/signing fields, but set `cpfp` from `externalSwapModeInfo.cpfpAssumptions` because the external quote/deposit amount was computed against those assumptions.
- Do not let a selected UTXO becoming confirmed and losing fresh CPFP data alter the quote-time package fee model. Otherwise `spendFully` can turn the quote-time CPFP allowance into an apparently excessive direct child fee and fail the wallet's effective-fee-rate guard in edge cases.
- Keep selected existing UTXOs plus the matched new UTXO as the exact funding set.

- [ ] **Step 5: Add `waitForExternalDeposit(...)`**

Use a method shape compatible with `SwapExecutionActionSendToAddress.waitForTransactions`:

```typescript
async waitForExternalDeposit(
    maxWaitTimeSeconds?: number,
    pollIntervalSeconds?: number,
    abortSignal?: AbortSignal
): Promise<BitcoinWalletUtxo> {
    // poll deposit address UTXOs until one new UTXO has value equal to requiredAdditionalUtxoAmount
}
```

Rules:

- Require external mode.
- If `requiredAdditionalUtxoAmount === "0"`, throw a clear "no external deposit required" error.
- Exclude all `selectedExistingUtxos` by `txId:vout`.
- For v1, match the newly received UTXO by exact value equal to `requiredAdditionalUtxoAmount`.
- Poll via `getWalletAddressUtxos(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, address, depositAddressType)`.
- Use `extendAbortController(...)` and `timeoutPromise(...)` patterns already present in the file.

- [ ] **Step 6: Add `processExternalDeposit(...)`**

```typescript
async processExternalDeposit(
    wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner,
    options?: {
        abortSignal?: AbortSignal,
        matchedNewUtxo?: BitcoinWalletUtxo
    }
): Promise<string> {
    // wait for deposit if matchedNewUtxo omitted
    // rehydrate selected UTXOs with quote-stable fee metadata
    // call getFundedPsbt(..., info.feeRate, undefined, utxos, true)
    // sign with wallet and submitPsbt(...)
}
```

Processing rules:

- Require external mode.
- Use `externalSwapModeInfo.feeRate` as the Bitcoin transaction fee rate.
- Combine quote-stable rehydrated selected existing UTXOs with the matched new UTXO.
- Follow the same shape as `sendBitcoinTransaction(...)`: call `getFundedPsbt(...)`, sign the returned PSBT with the wallet, then call `submitPsbt(...)`.
- Pass `spendFully: true` to `getFundedPsbt(...)`.
- Return the Bitcoin transaction id returned by `submitPsbt(...)`.
- Spending must be full, with no change left in the intermediate wallet.
- Do not wait for Bitcoin confirmations or destination settlement in this method. Callers should use the normal swap lifecycle methods/actions after the deposit PSBT is submitted.
- Use `processExternalDeposit`, not `executeExternalDeposit`, to avoid implying this performs the full swap execution lifecycle.

- [ ] **Step 7: Return staged current actions in external mode**

Update `_getExecutionStatus(...)`, `getExecutionAction(...)`, and `getExecutionStatus(...)` return types if needed so external mode can return either:

- `SwapExecutionActionSendToAddress<false>` while waiting for the additional external deposit UTXO.
- `SwapExecutionActionSignPSBT<"FUNDED_PSBT">` once the additional deposit UTXO is present and it is time to sign with the intermediate deposit wallet.

While the swap is in `CREATED`, external mode action selection should be:

1. If `requiredAdditionalUtxoAmount !== "0"` and no matching new UTXO exists yet, return `SendToAddress`.
2. If `requiredAdditionalUtxoAmount === "0"` or a matching new UTXO exists, return `SignPSBT`.
3. After the PSBT is submitted, fall back to the normal wait/settlement actions from the base SPV flow.

The `SendToAddress` action should look like:

```typescript
{
    type: "SendToAddress",
    name: "Deposit on Bitcoin",
    description: "Send funds to the Bitcoin deposit address",
    chain: "BITCOIN",
    txs: [{
        type: "BITCOIN_ADDRESS",
        address: this.getAddress(),
        hyperlink: this.getHyperlink(),
        amount: toTokenAmount(BigInt(info.requiredAdditionalUtxoAmount), BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo)
    }],
    waitForTransactions: async (maxWaitTimeSeconds, pollIntervalSeconds, abortSignal) => {
        const utxo = await this.waitForExternalDeposit(maxWaitTimeSeconds, pollIntervalSeconds, abortSignal);
        return utxo.txId;
    }
}
```

The `SignPSBT` action should be returned once the deposit has been received, to tell the implementor that the intermediate deposit wallet must now sign and submit the SPV funding PSBT. It should follow the existing `SignPSBT` action shape, but use external-mode funding:

```typescript
{
    type: "SignPSBT",
    name: "Deposit on Bitcoin",
    description: "Sign and submit the Bitcoin swap transaction from the intermediate deposit wallet",
    chain: "BITCOIN",
    txs: [{
        ...await this.getFundedPsbt(
            actionOptions.bitcoinWallet,
            info.feeRate,
            undefined,
            await this.rehydrateExternalFundingUtxos(matchedNewUtxo),
            true
        ),
        type: "FUNDED_PSBT"
    }],
    submitPsbt: async (signedPsbt, idempotent) => {
        return this._submitExecutionTransactions(
            Array.isArray(signedPsbt) ? signedPsbt : [signedPsbt],
            undefined,
            [SpvFromBTCSwapState.CREATED, SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED],
            idempotent
        );
    }
}
```

If the caller does not pass a Bitcoin wallet through action options when the deposit is already present, either return a clear error or return a raw PSBT only if it can be represented safely. Prefer the funded PSBT path for this external mode, because the point of this action is to sign with the intermediate deposit wallet using the exact quote-stable funding set.

Do not change PSBT mode behavior. In PSBT mode, the current `SignPSBT` action remains the current action.

- [ ] **Step 8: Verify**

Run:

```bash
tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/swaps/spv_swaps/SpvFromBTCSwap.ts
git commit -m "Implement external deposit behavior for SPV BTC swaps"
```

---

### Task 7: Add future-UTXO external quote helper

**Files:**
- Modify: `src/swapper/Swapper.ts`
- Modify: `src/swapper/SwapperWithChain.ts`
- Modify: `src/swapper/SwapperWithSigner.ts`
- Modify: `src/index.ts` if adding exported helper input types

**Reference:** The normal SPV BTC -> smart-chain quote path is `Swapper.createFromBTCSwapNew(...)` -> `SpvFromBTCWrapper.create(...)`. Keep that wrapper path unchanged. The external-deposit helper should be orchestrated from `Swapper.ts`, similarly to the existing `sweepBitcoinWallet(...)` flow, by creating a normal SPV quote and setting external mode before returning it.

- [ ] **Step 1: Add helper input type**

Create and export a concrete input type near the `Swapper` helper or the public SPV swap types:

```typescript
export type SpvFromBTCExternalDeposit = {
    walletOrAddress: IBitcoinWallet | string;
    existingUtxos?: BitcoinWalletUtxo[];
    feeRate?: number;
    cpfpAssumptions?: {
        txVsize: number;
        txEffectiveFeeRate: number;
    };
};
```

- [ ] **Step 2: Centralize helper orchestration in `Swapper.ts`**

Do not add a new `SpvFromBTCWrapper` helper. The root helper in `Swapper.ts` should:

1. Resolve and validate the destination chain/token/address using the same logic as the BTC -> smart-chain branch of `swap(...)` and `createFromBTCSwapNew(...)`.
2. Require `SwapType.SPV_VAULT_FROM_BTC`; do not silently fall back to legacy `FromBTCSwap`.
3. Create a normal public `SpvFromBTCSwap` quote through the existing SPV quote path.
4. Call `quote.setSwapModeExternal(externalDeposit.walletOrAddress, externalDeposit.existingUtxos, externalDeposit.feeRate, externalDeposit.cpfpAssumptions)` before returning the quote.

This keeps intermediary quote creation and wrapper validation in one existing path, and keeps external deposit orchestration at the public swapper API layer.

- [ ] **Step 3: Implement exact-output helper flow**

For exact-output quotes:

1. From `Swapper.ts`, create the normal SPV quote with the requested destination token amount.
2. Call `quote.setSwapModeExternal(walletOrAddress, existingUtxos, feeRate, cpfpAssumptions)`.
3. Return the quote.

The regular `amount` argument keeps its existing exact-output meaning.

- [ ] **Step 4: Implement exact-input helper flow**

The regular `amount` argument is the total BTC input budget the user wants to commit across selected existing UTXOs plus one future incoming UTXO. It is not the future UTXO amount by itself.

Do not implement this as:

```typescript
swap(..., amount: null, options: { sourceWalletUtxos })
```

That special case must remain hidden from public API consumers.

Recommended robust flow:

1. Resolve existing UTXOs and fee assumptions.
2. From `Swapper.ts`, create a preliminary normal SPV exact-input quote using the total budget as the input amount only to learn the final transaction shape and LP fee rate.
3. Call `setSwapModeExternal(...)` on the preliminary quote to compute `totalNetworkFee`.
4. Compute `finalLpBtcAmount = totalInputBudget - totalNetworkFee`.
5. From `Swapper.ts`, create the final normal SPV exact-input quote with `finalLpBtcAmount`.
6. Call `setSwapModeExternal(...)` on the final quote.
7. If the final quote's `totalNetworkFee` differs from the preliminary fee, repeat once with the adjusted `finalLpBtcAmount`.
8. If `finalLpBtcAmount <= 0n`, throw a clear user error.

This keeps the user-visible input budget stable: `quote.getInput().rawAmount` should equal the requested total input budget except for explicit dust/rounding constraints.

- [ ] **Step 5: Preserve partial funding semantics**

When computing external mode:

- For v1, select all fetched/supplied existing UTXOs for the deposit address.
- If existing UTXOs already cover the required BTC input budget, `requiredAdditionalUtxoAmount` should be `"0"`.
- Do not quote exact-input requests against `amount + selectedExistingUtxoTotal`.
- For example, if the user enters `0.01 BTC` and the intermediate wallet already has `0.002 BTC`, the external mode should report an additional requirement near `0.008 BTC` after network-fee/dust adjustment, not quote for `0.012 BTC`.

- [ ] **Step 6: Add `Swapper.createSpvFromBtcSwapWithExternalDeposit(...)`**

Use concrete overloads/signatures, not `Parameters<Swapper["swap"]>`.

Suggested root signature:

```typescript
createSpvFromBtcSwapWithExternalDeposit<C extends ChainIds<T>>(
    externalDeposit: SpvFromBTCExternalDeposit,
    dstToken: SCToken<C> | string,
    amount: bigint | string,
    exactIn: boolean | SwapAmountType,
    dstSmartchainWallet: string,
    options?: SpvFromBTCOptions
): Promise<SpvFromBTCSwap<T[C]>>;
```

Implementation notes:

- Resolve `dstToken` exactly like the BTC -> smart-chain branch of `swap(...)`.
- Normalize `exactIn` through `SwapAmountType`.
- Validate and normalize `dstSmartchainWallet` using the destination chain interface.
- Require `SwapType.SPV_VAULT_FROM_BTC`; this helper should not silently fall back to legacy `FromBTCSwap`.
- Create the quote through the existing `createFromBTCSwapNew(...)` / `createSwap(...)` path in `Swapper.ts`, then call `quote.setSwapModeExternal(...)` before returning.
- Do not add or call a wrapper-level external-deposit helper.

- [ ] **Step 7: Add chain-scoped helper**

In `SwapperWithChain.ts`:

```typescript
createSpvFromBtcSwapWithExternalDeposit(
    externalDeposit: SpvFromBTCExternalDeposit,
    dstToken: SCToken<ChainIdentifier> | string,
    amount: bigint | string,
    exactIn: boolean | SwapAmountType,
    dstSmartchainWallet: string,
    options?: SpvFromBTCOptions
): Promise<SpvFromBTCSwap<T[ChainIdentifier]>>;
```

Delegate to the root swapper with the chain already fixed.

- [ ] **Step 8: Add signer-scoped helper**

In `SwapperWithSigner.ts`:

```typescript
createSpvFromBtcSwapWithExternalDeposit(
    externalDeposit: SpvFromBTCExternalDeposit,
    dstToken: SCToken<ChainIdentifier> | string,
    amount: bigint | string,
    exactIn: boolean | SwapAmountType,
    options?: SpvFromBTCOptions
): Promise<SwapWithSigner<SpvFromBTCSwap<T[ChainIdentifier]>>>;
```

Use `this.signer.getAddress()` as `dstSmartchainWallet` and wrap with `wrapSwapWithSigner(...)`.

- [ ] **Step 9: Export helper input types**

If `SpvFromBTCExternalDeposit` is declared in `Swapper.ts` or `SpvFromBTCSwap.ts`, export it through `src/index.ts`.

Do not export `SpvFromBTCSwapBase` from `src/index.ts`.

- [ ] **Step 10: Verify helper types compile**

Run:

```bash
tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add src/swapper/Swapper.ts src/swapper/SwapperWithChain.ts src/swapper/SwapperWithSigner.ts src/index.ts
git commit -m "Add external deposit quote helper for SPV BTC swaps"
```

---

### Task 8: Static analysis review

**Files:**
- No code files should be modified for this task unless static analysis finds an issue that must be fixed.

- [ ] **Step 1: Run TypeScript static analysis**

Run:

```bash
tsc --noEmit
```

Fix any type errors before continuing.

- [ ] **Step 2: Review behavior statically**

Inspect the final code and confirm these behaviors from the implementation, without adding tests or a manual harness:

1. `toCoinselectAddressType(network, address)` returns the same type as `toCoinselectAddressType(toOutputScript(network, address))`.
2. `getWalletAddressUtxos(...)` returns the same UTXO object shape previously produced by `BitcoinWallet._getUtxoPool(...)`.
3. `SingleAddressBitcoinWallet.fromMnemonic(...)` derives the same receive address as `await mnemonicToPrivateKey(...)` followed by the constructor.
4. `isIAddressSwap(spvSwap)` returns `false` in PSBT mode and `true` in external mode.
5. `SpvFromBTCSwap` deserializes missing `swapMode` as `"psbt"`.
6. `externalSwapModeInfo.selectedExistingUtxos` serialization strips `outputScript`/`Buffer`.
7. `getInputUtxoAmount(...)` exists on the public `SpvFromBTCSwap` class, not on `SpvFromBTCSwapBase`.
8. `getInputUtxoAmount(...)` includes detrimental existing UTXOs in fee/input calculations instead of filtering them out.
9. `getFeeBreakdown()` in external mode includes `FeeType.NETWORK_INPUT`.

- [ ] **Step 3: Review public type surface statically**

Inspect the declarations and call sites to confirm these APIs are typed as expected:

```typescript
const mode: SpvFromBTCSwapMode = swap.getSwapMode();
const info = swap.getExternalSwapModeInfo();
await swap.setSwapModeExternal(wallet);
await swap.processExternalDeposit(wallet);
await swapper.createSpvFromBtcSwapWithExternalDeposit(externalDeposit, dstToken, amount, true, dstAddress);
```

- [ ] **Step 4: Commit fixes only if static analysis found issues**

If static analysis required code fixes, commit those fixes with a focused message. If no fixes were needed, do not create a verification-only commit.

---

## Final Verification Checklist

- [ ] `tsc --noEmit` passes.
- [ ] Every new or changed function/method/type introduced by the plan has a valid, non-placeholder TSDoc/docstring.
- [ ] `BitcoinWallet._getUtxoPool(...)` uses `getWalletAddressUtxos(...)`.
- [ ] `SpvFromBTCWrapper._swapDeserializer` is still `SpvFromBTCSwap`.
- [ ] `src/index.ts` exports `SpvFromBTCSwap` and external mode types, but not `SpvFromBTCSwapBase`.
- [ ] Old serialized SPV swaps without `swapMode` restore as PSBT mode.
- [ ] `getInputUtxoAmount(...)` is implemented on the new public `SpvFromBTCSwap` subclass, not on `SpvFromBTCSwapBase`.
- [ ] `getInputUtxoAmount(...)` uses all selected existing UTXOs, including detrimental inputs, when computing `totalNetworkFee` and `requiredAdditionalUtxoAmount`.
- [ ] External mode `serialize()` output contains only JSON-safe minimal selected UTXO records.
- [ ] External mode `getInput()` includes input-side Bitcoin fee.
- [ ] External mode `getFeeBreakdown()` includes `FeeType.NETWORK_INPUT`.
- [ ] External deposit processing rehydrates selected UTXOs with fresh signing data while preserving quote-time CPFP metadata, so confirmed-state transitions do not change the fee model before `spendFully` PSBT submission.
- [ ] PSBT mode `getInput()`, `getFeeBreakdown()`, `getPsbt()`, `getFundedPsbt()`, `sendBitcoinTransaction()`, and `execute()` behavior is unchanged.
- [ ] `isIAddressSwap()` returns true for external-mode SPV swaps and false for PSBT-mode SPV swaps.
- [ ] The public quote helper does not expose `amount: null` or `sourceWalletUtxos` as a required app-level workaround.

---

## Implementation Notes

- Do not create a second public serialized SPV swap type. The public/deserialized runtime class remains `SpvFromBTCSwap`.
- Treat `SpvFromBTCSwapBase` as an internal/advanced detail. It can be exported from its module for TypeScript mechanics, but do not add it to `src/index.ts` unless there is a clear public API reason.
- Be careful with exact-input semantics. The user-provided amount is a total BTC budget inclusive of input-side Bitcoin network fee in external mode.
- Be careful with selected UTXO persistence. App callers may pass full `BitcoinWalletUtxo` objects and those can be kept in memory, but persisted `externalSwapModeInfo` must only contain JSON-safe primitives selected inline in `serialize()`.
- Use `src/utils/BitcoinUtils.ts` for address type inference and address UTXO conversion. Do not add SPV-local `getDepositAddressType(...)`, `getAddressUtxoPool(...)`, or broad external UTXO resolution helpers.
- Avoid changing `Swapper.swap(...)` to support an external-deposit special case. Add a dedicated typed helper instead.
- Avoid changing legacy `FromBTC` behavior. This plan is only for `SwapType.SPV_VAULT_FROM_BTC`.
- Do not add a new test framework or manual harness for this plan. The final verification task is static analysis with `tsc --noEmit` and code inspection.
