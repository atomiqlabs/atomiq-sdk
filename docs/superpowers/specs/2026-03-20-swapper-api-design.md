# SwapperApi Design Spec

## Overview

A REST API definition layer built directly into the `atomiq-sdk` package, exposing swap lifecycle operations as a typed dictionary of endpoints. Any HTTP framework (Express, Azure Functions, etc.) can iterate over this dictionary to mount routes automatically.

This continues Adam's work on the `api` branch, which added `getCurrentAction()`, `getSwapSteps()`, and `getStateInfo()` to all swap types, along with the `SwapExecutionAction` and `SwapExecutionStep` type systems.

## Goals

- Provide a framework-agnostic API definition inside the SDK for compiler-time safety
- Expose swap lifecycle through three endpoints: create, status, submit
- Serialize SDK types to JSON-safe formats via a generic `SerializedAction<T>` type
- Return rich, descriptive responses (state, steps, actions, transactions, quote details)
- Include descriptive input schemas for future Swagger/OpenAPI generation

## Non-Goals

- No HTTP framework integration (Express wrapper, etc.) — that lives outside the SDK
- No authentication, rate limiting, or middleware concerns
- No state transition diagrams or documentation (future work)
- No tokens, limits, or health endpoints (future work)

## Architecture

### New Folder: `src/api/`

All API-related files live in `src/api/` to keep them cleanly separated from the core SDK.

### `src/api/SwapperApi.ts`

A generic class wrapping the `Swapper`:

```typescript
class SwapperApi<T extends MultiChain> {
  constructor(private swapper: Swapper<T>) {}

  // Internal lifecycle — NOT exposed as API endpoints
  async init(): Promise<void> { /* swapper.init() */ }
  async poll(): Promise<void> { /* poll on-chain events */ }
  async sync(): Promise<void> { /* sync swap state */ }

  // Exposed API dictionary — integrations iterate only over this object
  readonly endpoints = {
    createSwap: ApiEndpoint<CreateSwapInput, SwapStatusResponse>,
    getSwapStatus: ApiEndpoint<GetSwapStatusInput, SwapStatusResponse>,
    submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput>,
  };
}
```

### Endpoint Definition Type

```typescript
interface ApiEndpoint<TInput, TOutput> {
  type: "GET" | "POST";
  inputSchema: Record<keyof TInput, {
    type: string;
    required: boolean;
    description: string;
  }>;
  callback: (input: TInput) => Promise<TOutput>;
}
```

Each endpoint is strongly typed — consumers get full type info for inputs and outputs. The `inputSchema` provides runtime-inspectable metadata for Swagger generation.

### File Changes

- **New:** `src/api/SwapperApi.ts` — main API class, endpoint definitions, callbacks, response building
- **New:** `src/api/ApiTypes.ts` — type definitions (ApiEndpoint, ApiAmount, SwapStatusResponse, input/output types)
- **New:** `src/api/SerializedAction.ts` — SerializedAction generic type + runtime serializer
- **Remove:** `src/ApiList.ts` — replaced by `src/api/`
- **Update:** `src/index.ts` — export from `src/api/`, remove ApiList export

## Common Types

### ApiAmount

A unified amount type used throughout all API responses for any monetary value (input amounts, output amounts, fees, etc.):

```typescript
interface ApiAmount {
  amount: string;       // Decimal format, e.g. "1.5"
  rawAmount: string;    // Raw base units, e.g. "1500000000000000000"
  decimals: number;     // Token decimals, e.g. 18
  symbol: string;       // Token ticker, e.g. "STRK"
  chain: string;        // Chain identifier, e.g. "STARKNET", "BITCOIN", "LIGHTNING"
}
```

This type replaces all raw amount strings and `TokenAmount` objects in API responses. Used for: `quote.inputAmount`, `quote.outputAmount`, fee amounts, action amounts, etc.

## Endpoints

### createSwap (POST)

Creates a new swap via `swapper.swap()` and returns its full status. The `swapper.swap()` method handles all routing internally — it determines the swap type from the token pair and calls the appropriate creation method.

**Input: `CreateSwapInput`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `srcToken` | `string` | yes | Source token ticker (e.g. "BTC", "BTCLN", "STRK") |
| `dstToken` | `string` | yes | Destination token ticker |
| `amount` | `string` | yes | Amount in base units as string |
| `amountType` | `"EXACT_IN" \| "EXACT_OUT"` | yes | Whether amount refers to input or output |
| `srcAddress` | `string` | yes | Source address or Lightning invoice |
| `dstAddress` | `string` | yes | Destination address |
| `gasAmount` | `string` | no | Gas token amount to receive on destination chain |
| `paymentHash` | `string` | no | Custom payment hash for Lightning swaps |
| `options` | `object` | no | Additional swap options (see below) |

**Options object:**

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Lightning invoice description |
| `descriptionHash` | `string` | Lightning invoice description hash |
| `expirySeconds` | `number` | Custom expiry for the swap quote |

**Output:** `SwapStatusResponse`

### getSwapStatus (GET)

Retrieves the current status of an existing swap. Syncs swap state before returning.

**Input: `GetSwapStatusInput`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `swapId` | `string` | yes | The swap identifier |

**Output:** `SwapStatusResponse`

### submitTransaction (POST)

Submits signed transactions for a swap.

**Execution flow:**
1. Load the swap by ID
2. Call `getCurrentAction()` on the fresh swap object
3. Verify the action is a submittable type (`SignPSBT` or `SignSmartChainTransaction`)
4. Call the action's submit function (`submitPsbt()` or `submitTransactions()`) with the signed data
5. If the swap state has changed and no submittable action exists, return an error instructing the client to re-fetch status


**Input: `SubmitTransactionInput`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `swapId` | `string` | yes | The swap identifier |
| `signedTxs` | `any[]` | yes | Array of signed transaction data |

**Output: `SubmitTransactionOutput`**

| Field | Type | Description |
|-------|------|-------------|
| `txHashes` | `string[]` | Transaction hashes of broadcasted transactions |

## Shared Response Type

Both `createSwap` and `getSwapStatus` return `SwapStatusResponse`:

```typescript
interface SwapStatusResponse {
  swapId: string;
  swapType: string;

  // State
  state: {
    number: number;
    name: string;
    description: string;
  };
  isFinished: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isExpired: boolean;

  // Quote
  quote: {
    inputAmount: ApiAmount;
    outputAmount: ApiAmount;
    fees: {
      swap: ApiAmount;             // LP swap fee — always present
      networkOutput?: ApiAmount;   // Destination network fee — optional
    };
    expiry: number;
  };

  // Timing
  createdAt: number;
  expiresAt: number | null;

  // Execution
  steps: SwapExecutionStep[];
  currentAction: SerializedAction<SwapExecutionAction> | null;

  // Transactions
  transactions: {
    source: {
      initiation: string | null;
      settlement: string | null;
      refund: string | null;
    };
    destination: {
      initiation: string | null;
      settlement: string | null;
    };
  };
}
```

## Serialization

### SerializedAction Generic Type

Strips non-serializable fields (functions, complex objects) from `SwapExecutionAction` types while preserving all data fields. Uses key-remapping (`as` clause) to truly omit function keys from the resulting type:

```typescript
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

**Per action type:**

| Action | Functions omitted | Fields replaced |
|--------|-------------------|-----------------|
| `SendToAddress` | `waitForTransactions` | `txs[].amount`: `TokenAmount` → `string` |
| `SignPSBT` | `submitPsbt` | `txs[].psbt`: `Transaction` object omitted (hex/base64 kept) |
| `SignSmartChainTx` | `submitTransactions` | `txs`: `T["TX"][]` → `string[]` (JSON-serialized) |
| `Wait` | `wait` | None — `expectedTimeSeconds`, `pollTimeSeconds` kept as-is |

### SwapExecutionStep Serialization

Steps are plain data objects (type, chain, status, confirmations) with no functions or non-serializable fields. They serialize to JSON directly — no special handling needed.

### Runtime Serializer

A `serializeAction()` function performs the runtime transformation matching the `SerializedAction<T>` type. Discriminates on `action.type` to apply the correct transformation:

- **SendToAddress**: removes `waitForTransactions`, converts `txs[].amount` from `TokenAmount` to string
- **SignPSBT**: removes `submitPsbt`, removes `txs[].psbt` (Transaction object) — hex/base64 strings are kept
- **SignSmartChainTx**: removes `submitTransactions`, JSON-serializes `txs` array entries to strings
- **Wait**: removes `wait` function, all other fields kept as-is

## Integration Example

An Express integration consuming the API dictionary:

```typescript
const api = new SwapperApi(swapper);
await api.init();

for (const [name, endpoint] of Object.entries(api.endpoints)) {
  const method = endpoint.type === "GET" ? "get" : "post";
  app[method](`/api/v1/${name}`, async (req, res) => {
    const input = { ...req.query, ...req.body };
    const result = await endpoint.callback(input);
    res.json(result);
  });
}
```

## Scope

This spec covers the minimal API surface for full swap lifecycle:

1. **Create** a swap (returns quote, initial steps, first action)
2. **Check** swap status (returns updated state, steps, current action, tx history)
3. **Submit** signed transactions (broadcasts and returns hashes)

Future additions (tokens, limits, health, Swagger generation) can be added as new entries in the `endpoints` object without changing the architecture.
