# SwapperApi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a framework-agnostic REST API definition layer (`SwapperApi`) inside the atomiq-sdk, continuing Adam's `api` branch work.

**Architecture:** A `SwapperApi` class wraps `Swapper<T>` and exposes an `endpoints` object containing typed API endpoint definitions (createSwap, getSwapStatus, submitTransaction). A `SerializedAction<T>` generic type strips non-serializable fields from `SwapExecutionAction` types. A shared `SwapStatusResponse` type is returned by both create and status endpoints.

**Tech Stack:** TypeScript, atomiq-sdk internals (Swapper, ISwap, SwapExecutionAction, SwapExecutionStep, TokenAmount, Fee)

**Spec:** `docs/superpowers/specs/2026-03-20-swapper-api-design.md`

**Branch:** `api` (continue Adam's commits)

---

## File Structure

All API-related files live in `src/api/` to keep them cleanly separated from the core SDK.

| File | Action      | Responsibility                                                                                                                                 |
|------|-------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `src/api/SwapperApi.ts` | Create      | Main API class, endpoint definitions, callbacks, response building                                                                             |
| `src/api/SerializedAction.ts` | Create      | `SerializedAction<T>` generic type + `serializeAction()` runtime function                                                                      |
| `src/api/ApiTypes.ts` | Create      | `ApiEndpoint`, `ApiAmount`, `SwapStatusResponse`, `CreateSwapInput`, `GetSwapStatusInput`, `SubmitTransactionInput`, `SubmitTransactionOutput` |
| `src/ApiList.ts` | Remove      | Replaced by `src/api/`                                                                                                                         |
| `src/index.ts` | Don't touch | Don't add new exports just yet, there will be a separate export shim just for API-related exports                                              |

---

### Task 1: Create API type definitions

**Files:**
- Create: `src/api/ApiTypes.ts`

- [ ] **Step 1: Create `ApiAmount` type**

```typescript
// src/api/ApiTypes.ts

/**
 * Unified amount type for all API responses
 *
 * @category API
 */
export interface ApiAmount {
    /** Decimal format, e.g. "1.5" */
    amount: string;
    /** Raw base units as string, e.g. "1500000000000000000" */
    rawAmount: string;
    /** Token decimals, e.g. 18 */
    decimals: number;
    /** Token ticker, e.g. "STRK" */
    symbol: string;
    /** Chain identifier, e.g. "STARKNET", "BITCOIN", "LIGHTNING" */
    chain: string;
}
```

- [ ] **Step 2: Create `ApiEndpoint` type**

//TODO: Improve the `inputSchema` fields to have a statically typed `type` based on the actual type of the specific key in `TInput` generic

//TODO: There also needs to be some nesting possible in `inputSchema`, since we want to have at least a nested `options` type for the create endpoint (maybe for others)

```typescript
/**
 * Typed API endpoint definition for framework-agnostic integration
 *
 * @category API
 */
export interface ApiEndpoint<TInput, TOutput> {
    type: "GET" | "POST";
    inputSchema: Record<keyof TInput, {
        type: string;
        required: boolean;
        description: string;
    }>;
    callback: (input: TInput) => Promise<TOutput>;
}
```

- [ ] **Step 3: Create input types**

```typescript
/**
 * Input for creating a new swap
 *
 * @category API
 */
export interface CreateSwapInput {
    srcToken: string;
    dstToken: string;
    amount: string;
    amountType: "EXACT_IN" | "EXACT_OUT";
    srcAddress: string;
    dstAddress: string;
    gasAmount?: string;
    paymentHash?: string;
    options?: {
        description?: string;
        descriptionHash?: string;
        expirySeconds?: number;
    };
}

/**
 * Input for getting swap status
 *
 * @category API
 */
export interface GetSwapStatusInput {
    swapId: string;
}

/**
 * Input for submitting signed transactions
 *
 * @category API
 */
export interface SubmitTransactionInput {
    swapId: string;
    signedTxs: string[]; // Make this a string, so it enforces transactions to be in their serialized format
}

/**
 * Output from submitting transactions
 *
 * @category API
 */
export interface SubmitTransactionOutput {
    txHashes: string[];
}
```

- [ ] **Step 4: Create `SwapStatusResponse` type**

Import `SwapExecutionStep` from existing types. Import `SerializedAction` (created in Task 2). Import `SwapExecutionAction` from existing types.

```typescript
import {SwapExecutionStep} from "../types/SwapExecutionStep";
import {SwapExecutionAction} from "../types/SwapExecutionAction";
import {SerializedAction} from "./SerializedAction";

/**
 * Shared response type for createSwap and getSwapStatus
 *
 * @category API
 */
export interface SwapStatusResponse {
    swapId: string;
    swapType: string;

    state: {
        number: number;
        name: string;
        description: string;
    };
    isFinished: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    isExpired: boolean;

    quote: {
        inputAmount: ApiAmount;
        outputAmount: ApiAmount;
        fees: {
            swap: ApiAmount;
            networkOutput?: ApiAmount;
        };
        expiry: number;
    };

    createdAt: number;
    expiresAt: number | null;

    steps: SwapExecutionStep[];
    currentAction: SerializedAction<SwapExecutionAction> | null;

    transactions: {
        source: {
            init: string | null; // Shortened to `init`
            settlement: string | null;
            refund: string | null;
        };
        destination: {
            init: string | null; // Shortened to `init`
            settlement: string | null;
        };
    };
}
```

- [ ] **Step 5: Verify file compiles**

Run: `cd /Users/marci/dev/Atomiq/atomiq-sdk && tsc --noEmit src/api/ApiTypes.ts`

Note: This may fail until Task 2 creates `SerializedAction.ts`. That's expected — just verify no syntax errors in the types themselves by temporarily commenting the `SerializedAction` import.

- [ ] **Step 6: Commit**

```bash
git add src/api/ApiTypes.ts
git commit -m "Add API type definitions: ApiAmount, ApiEndpoint, SwapStatusResponse, input/output types"
```

---

### Task 2: Create SerializedAction type and runtime serializer

**Files:**
- Create: `src/api/SerializedAction.ts`

**Reference:** Read `src/types/SwapExecutionAction.ts` for the four action types and their fields. The generic type must use key-remapping (`as` clause) to truly omit function keys.

- [ ] **Step 1: Create `SerializedAction<T>` generic type**

//TODO: Amount here should also use the ApiAmount type!

```typescript
// src/api/SerializedAction.ts
import {
    SwapExecutionAction,
    SwapExecutionActionSendToAddress,
    SwapExecutionActionSignPSBT,
    SwapExecutionActionSignSmartChainTx,
    SwapExecutionActionWait
} from "../types/SwapExecutionAction";

/**
 * Strips non-serializable fields (functions, complex objects) from SwapExecutionAction types.
 * Uses key-remapping to truly omit function keys from the resulting type.
 *
 * - SignSmartChainTransaction: functions removed, txs → string[]
 * - SignPSBT: functions removed, txs[].psbt (Transaction object) omitted
 * - SendToAddress: functions removed, txs[].amount (TokenAmount) → string
 * - Wait: functions removed, data fields kept as-is
 *
 * @category API
 */
export type SerializedAction<T extends SwapExecutionAction> =
    T["type"] extends "SignSmartChainTransaction" ? {
        [K in keyof T as T[K] extends Function ? never : K]:
            K extends "txs" ? string[] : T[K]
    } :
    T["type"] extends "SignPSBT" ? {
        [K in keyof T as T[K] extends Function ? never : K]:
            K extends "txs" ? (T extends { txs: (infer U)[] }
                ? Omit<U, "psbt">[] : never) : T[K]
    } :
    T["type"] extends "SendToAddress" ? {
        [K in keyof T as T[K] extends Function ? never : K]:
            K extends "txs" ? (T extends { txs: (infer U)[] }
                ? (Omit<U, "amount"> & { amount: string })[] : never) : T[K]
    } : {
        [K in keyof T as T[K] extends Function ? never : K]: T[K]
    };
```

- [ ] **Step 2: Create `serializeAction()` runtime function**

This function performs the runtime transformation matching the compile-time type. It discriminates on `action.type` and uses available transaction serialization functions exposed in `swapper._chains[<chainId>].chainInterface` for serializing smart chain transactions.

//TODO: As mentioned earlier it needs to translate amount to ApiAmount type not to string!

//TODO: Needs to use the mentioned TX serializers for serializing smart chain transactions, not just `JSON.stringify`, that will break on internal transaction structures with buffers, bigints, etc.!

```typescript
/**
 * Runtime serializer that strips non-serializable fields from a SwapExecutionAction.
 * Matches the compile-time SerializedAction<T> type.
 *
 * @category API
 */
export function serializeAction(action: SwapExecutionAction): SerializedAction<SwapExecutionAction> {
    switch (action.type) {
        case "SendToAddress": {
            const {waitForTransactions, ...rest} = action;
            return {
                ...rest,
                txs: rest.txs.map(tx => ({
                    type: tx.type,
                    address: tx.address,
                    hyperlink: tx.hyperlink,
                    amount: tx.amount.rawAmount != null
                        ? tx.amount.rawAmount.toString()
                        : tx.amount.amount 
                }))
            } as SerializedAction<SwapExecutionAction>;
        }
        case "SignPSBT": {
            const {submitPsbt, ...rest} = action;
            return {
                ...rest,
                txs: rest.txs.map(tx => {
                    const {psbt, ...txRest} = tx;
                    return txRest;
                })
            } as SerializedAction<SwapExecutionAction>;
        }
        case "SignSmartChainTransaction": {
            const {submitTransactions, ...rest} = action;
            return {
                ...rest,
                txs: rest.txs.map(tx => JSON.stringify(tx))
            } as SerializedAction<SwapExecutionAction>;
        }
        case "Wait": {
            const {wait, ...rest} = action;
            return rest as SerializedAction<SwapExecutionAction>;
        }
    }
}
```

- [ ] **Step 3: Verify file compiles**

Run: `cd /Users/marci/dev/Atomiq/atomiq-sdk && tsc --noEmit src/api/SerializedAction.ts`

Check for type errors. The `as SerializedAction<SwapExecutionAction>` casts may need adjustment — verify TypeScript accepts them.

- [ ] **Step 4: Commit**

```bash
git add src/api/SerializedAction.ts
git commit -m "Add SerializedAction generic type and runtime serializer"
```

---

### Task 3: Create SwapperApi class

**Files:**
- Create: `src/api/SwapperApi.ts`

**Reference:**
- `src/swapper/Swapper.ts` — the `Swapper` class, its `swap()` method (line ~1431), `getSwapById()` (line ~1682), `getAllSwaps()` (line ~1547)
- `src/swaps/ISwap.ts` — `getStateInfo()`, `getCurrentAction()`, `getSwapSteps()`, `getInput()`, `getOutput()`, `getFee()`, `getFeeBreakdown()`, `isFinished()`, `isSuccessful()`, `isFailed()`, `isQuoteExpired()`, `getId()`, `getInputTxId()`, `getOutputTxId()`, `createdAt`
- `src/types/TokenAmount.ts` — `TokenAmount` type with `rawAmount` (bigint), `amount` (string), `token`
- `src/types/fees/Fee.ts` — `Fee` type with `amountInSrcToken`, `amountInDstToken`
- `src/types/fees/FeeBreakdown.ts` — `FeeBreakdown` array with `type` (FeeType) and `fee`
- `src/enums/FeeType.ts` — `FeeType.SWAP = 0`, `FeeType.NETWORK_OUTPUT = 1`
- `src/types/SwapExecutionAction.ts` — `isSwapExecutionActionSignPSBT()`, `isSwapExecutionActionSignSmartChainTx()`

- [ ] **Step 1: Create helper function `toApiAmount`**

Converts a `TokenAmount` to `ApiAmount`. Place this as a private helper inside `SwapperApi.ts`.

```typescript
import {TokenAmount} from "../types/TokenAmount";
import {ApiAmount} from "./ApiTypes";

function toApiAmount(tokenAmount: TokenAmount): ApiAmount {
    return {
        amount: tokenAmount.amount,
        rawAmount: tokenAmount.rawAmount != null ? tokenAmount.rawAmount.toString() : "0",
        decimals: tokenAmount.token.decimals,
        symbol: tokenAmount.token.ticker,
        chain: tokenAmount.token.chainId
    };
}
```

- [ ] **Step 2: Create helper function `buildSwapStatusResponse`**

Builds `SwapStatusResponse` from an `ISwap` instance. This is the core response builder used by both `createSwap` and `getSwapStatus` callbacks.

```typescript
import {ISwap} from "../swaps/ISwap";
import {SwapStatusResponse} from "./ApiTypes";
import {serializeAction} from "./SerializedAction";
import {FeeType} from "../enums/FeeType";
import {SwapType} from "../enums/SwapType";

async function buildSwapStatusResponse(swap: ISwap): Promise<SwapStatusResponse> {
    const stateInfo = swap.getStateInfo();
    const input = swap.getInput();
    const output = swap.getOutput();
    const feeBreakdown = swap.getFeeBreakdown();
    const currentAction = await swap.getCurrentAction();
    const steps = await swap.getSwapSteps();

    // Build fees from breakdown
    const swapFeeEntry = feeBreakdown.find(f => f.type === FeeType.SWAP);
    const networkFeeEntry = feeBreakdown.find(f => f.type === FeeType.NETWORK_OUTPUT);

    return {
        swapId: swap.getId(),
        swapType: SwapType[swap.getType()],

        state: {
            number: stateInfo.state,
            name: stateInfo.name,
            description: stateInfo.description
        },
        isFinished: swap.isFinished(),
        isSuccess: swap.isSuccessful(),
        isFailed: swap.isFailed(),
        isExpired: swap.isQuoteExpired(),

        quote: {
            inputAmount: toApiAmount(input),
            outputAmount: toApiAmount(output),
            fees: {
                swap: swapFeeEntry
                    ? toApiAmount(swapFeeEntry.fee.amountInSrcToken)
                    : { amount: "0", rawAmount: "0", decimals: 0, symbol: "", chain: "" },
                ...(networkFeeEntry ? {
                    networkOutput: toApiAmount(networkFeeEntry.fee.amountInSrcToken)
                } : {})
            },
            expiry: swap.getQuoteExpiry()
        },

        createdAt: swap.createdAt,
        expiresAt: swap.getQuoteExpiry() > 0 ? swap.getQuoteExpiry() : null,

        steps,
        currentAction: currentAction ? serializeAction(currentAction) : null,

        transactions: {
            source: {
                initiation: swap.getInputTxId(),
                settlement: null,  // TODO: expose when available on ISwap
                refund: null       // TODO: expose when available on ISwap
            },
            destination: {
                initiation: null,  // TODO: expose when available on ISwap
                settlement: swap.getOutputTxId()
            }
        }
    };
}
```

Note: `swap.getType()` — verify this exists on `ISwap`. It may be `swap.TYPE` (protected). If not accessible, check for a public type getter. `swap.getQuoteExpiry()` is the correct public method (ISwap.ts line 488).

- [ ] **Step 3: Create `SwapperApi` class with endpoint definitions**

```typescript
import {MultiChain} from "@atomiqlabs/base";
import {Swapper} from "../swapper/Swapper";
import {
    ApiEndpoint,
    CreateSwapInput,
    GetSwapStatusInput,
    SubmitTransactionInput,
    SubmitTransactionOutput,
    SwapStatusResponse
} from "./ApiTypes";
import {
    isSwapExecutionActionSignPSBT,
    isSwapExecutionActionSignSmartChainTx
} from "../types/SwapExecutionAction";

export class SwapperApi<T extends MultiChain> {

    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, SwapStatusResponse>;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, SwapStatusResponse>;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput>;
    };

    constructor(private swapper: Swapper<T>) {
        this.endpoints = {
            createSwap: {
                type: "POST",
                inputSchema: {
                    srcToken: { type: "string", required: true, description: "Source token ticker (e.g. 'BTC', 'BTCLN', 'STRK')" },
                    dstToken: { type: "string", required: true, description: "Destination token ticker" },
                    amount: { type: "string", required: true, description: "Amount in base units as string" },
                    amountType: { type: "string", required: true, description: "EXACT_IN or EXACT_OUT" },
                    srcAddress: { type: "string", required: true, description: "Source address or Lightning invoice" },
                    dstAddress: { type: "string", required: true, description: "Destination address" },
                    gasAmount: { type: "string", required: false, description: "Gas token amount to receive on destination chain" },
                    paymentHash: { type: "string", required: false, description: "Custom payment hash for Lightning swaps" },
                    options: { type: "object", required: false, description: "Additional options: description, descriptionHash, expirySeconds" }
                },
                callback: (input) => this.createSwap(input)
            },
            getSwapStatus: {
                type: "GET",
                inputSchema: {
                    swapId: { type: "string", required: true, description: "The swap identifier" }
                },
                callback: (input) => this.getSwapStatus(input)
            },
            submitTransaction: {
                type: "POST",
                inputSchema: {
                    swapId: { type: "string", required: true, description: "The swap identifier" },
                    signedTxs: { type: "array", required: true, description: "Array of signed transaction data" }
                },
                callback: (input) => this.submitTransaction(input)
            }
        };
    }

    // ... private methods in next steps
}
```

- [ ] **Step 4: Implement `init()`, `poll()`, `sync()` lifecycle methods**

```typescript
    async init(): Promise<void> {
        await this.swapper.init();
    }

    async poll(): Promise<void> {
        // Poll on-chain events across all chains
        // TODO: Keep this empty for now, until the swapper instance exposes the poll() function
    }

    async sync(): Promise<void> {
        await this.swapper._syncSwaps();
    }
```

Note: Check `Swapper` class for available sync/poll methods. These may be `_syncSwaps()` (internal). If not publicly accessible, expose them or call the equivalent. Adapt during implementation.

- [ ] **Step 5: Implement `createSwap` callback**

```typescript
    private async createSwap(input: CreateSwapInput): Promise<SwapStatusResponse> {
        const exactIn = input.amountType === "EXACT_IN";

        // Build options from input
        const options: any = {};
        if (input.gasAmount != null) options.gasAmount = BigInt(input.gasAmount);
        if (input.paymentHash != null) options.paymentHash = Buffer.from(input.paymentHash, "hex");
        if (input.options?.description != null) options.description = input.options.description;
        if (input.options?.descriptionHash != null) options.descriptionHash = Buffer.from(input.options.descriptionHash, "hex");
        if (input.options?.expirySeconds != null) options.expirySeconds = input.options.expirySeconds;

        // swapper.swap() handles routing based on token types
        const swap = await this.swapper.swap(
            input.srcToken,
            input.dstToken,
            BigInt(input.amount),
            exactIn,
            input.srcAddress,
            input.dstAddress,
            Object.keys(options).length > 0 ? options : undefined
        );

        return buildSwapStatusResponse(swap);
    }
```

Note: The `swapper.swap()` signature accepts string tokens and resolves them internally. Verify this works during implementation. The `srcAddress`/`dstAddress` mapping depends on swap direction — check if `swapper.swap()` handles this or if we need to swap them based on direction.

- [ ] **Step 6: Implement `getSwapStatus` callback**

```typescript
    private async getSwapStatus(input: GetSwapStatusInput): Promise<SwapStatusResponse> {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }
        return buildSwapStatusResponse(swap);
    }
```

- [ ] **Step 7: Implement `submitTransaction` callback**

```typescript
    private async submitTransaction(input: SubmitTransactionInput): Promise<SubmitTransactionOutput> {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }

        const action = await swap.getCurrentAction();
        if (action == null) {
            throw new Error("No current action for swap — re-fetch status");
        }

        if (isSwapExecutionActionSignPSBT(action)) {
            const txHashes = await action.submitPsbt(input.signedTxs);
            return { txHashes };
        }

        if (isSwapExecutionActionSignSmartChainTx(action)) {
            const txHashes = await action.submitTransactions(input.signedTxs);
            return { txHashes };
        }

        throw new Error(
            "Current action is not submittable (type: " + action.type + ") — re-fetch status"
        );
    }
```

- [ ] **Step 8: Verify file compiles**

Run: `cd /Users/marci/dev/Atomiq/atomiq-sdk && tsc --noEmit src/api/SwapperApi.ts`

Fix any type errors. Common issues to watch for:
- `swap.getType()` may not exist — check ISwap and use `swap.TYPE` or similar
- `swap.getQuoteExpiry()` is the correct public method (ISwap.ts line 488)
- `swapper.swap()` signature may not accept plain strings for all params
- `getFeeBreakdown()` return type — verify it's an array with `.find()`

- [ ] **Step 9: Commit**

```bash
git add src/api/SwapperApi.ts
git commit -m "Add SwapperApi class with createSwap, getSwapStatus, submitTransaction endpoints"
```

---

### Task 4: Update exports and remove ApiList

**Files:**
- Remove: `src/ApiList.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Remove `src/ApiList.ts`**

(The `src/api/` folder was already created in Tasks 1-3.)

```bash
git rm src/ApiList.ts
```

Also remove the corresponding `dist/ApiList.js` and `dist/ApiList.d.ts` if they exist.

Check if `src/index.ts` currently exports from `./ApiList` and remove that line.

- [ ] **Step 2: Full project compile check**

Run: `cd /Users/marci/dev/Atomiq/atomiq-sdk && tsc`

This is the full build — verify everything compiles together. Fix any remaining type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Export SwapperApi and API types, remove ApiList boilerplate"
```

---

### Task 5: Verify and fix compilation issues

**Files:**
- Modify: Any files with type errors from Task 3/4

This task handles the inevitable type mismatches between the spec and the actual SDK API surface.

- [ ] **Step 1: Full compile and fix**

Run: `cd /Users/marci/dev/Atomiq/atomiq-sdk && tsc`

Common expected issues to investigate and fix:

1. **`swap.getType()`** — may not exist. Check `ISwap` for how to get the SwapType. It might be `swap.TYPE` (protected). If so, we may need to use `swap.getDirection()` + token info, or add a public getter.

2. **`swap.getQuoteExpiry()`** — this is the correct public method (ISwap.ts line 488). Verify it returns a UNIX timestamp.

3. **`swapper.swap()` parameter mapping** — the `swap()` overloads accept specific token types, not just strings. Check if string tickers are accepted directly (Adam may have added this in the api branch). If not, we need to resolve tickers to token objects via `swapper.getTokens()`.

4. **`getFeeBreakdown()`** — verify the return type. `FeeBreakdown` is defined as `{ type: FeeType, fee: Fee }[]`. Confirm `.find()` works on it.

5. **Transaction fields** — `getInputTxId()` and `getOutputTxId()` return `string | null`. Some swap types may have additional tx IDs (refund, claim). Check what's available and fill the `transactions` object as best as possible.

- [ ] **Step 2: Fix any issues found**

Apply minimal fixes. Do NOT add features beyond what the spec requires.

- [ ] **Step 3: Final compile verification**

Run: `cd /Users/marci/dev/Atomiq/atomiq-sdk && tsc`

Expected: Clean compile, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Fix compilation issues in SwapperApi"
```

---

## Implementation Notes

- **Do not modify Adam's existing code** (SwapExecutionAction, SwapExecutionStep, swap implementations) unless absolutely required for compilation.
- **Do not add tests yet** — this is a first implementation pass. Tests will come after Adam's review.
- **Do not add error handling patterns** beyond basic throws — the framework integration layer handles this.
- **Do not delete any commented-out code** in existing files.
- The `swapper.swap()` method signature is complex with many overloads. During implementation, check the actual overload that accepts string token identifiers — Adam added this on the `api` branch. If it doesn't accept raw strings, use token resolution via `swapper.getTokens()`.
