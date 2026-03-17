# AGENTS.md

## Purpose
This file is a navigation index for `Multichain/sdk`.
Use it to quickly find where APIs, swap logic, and utilities live before editing.

## First Read Order
1. `README.md` (usage and lifecycle examples).
2. `src/index.ts` (public export surface).
3. `src/swapper/Swapper.ts` (top-level orchestration).
4. `src/swaps/ISwapWrapper.ts` and `src/swaps/ISwap.ts` (shared swap lifecycle).
5. Protocol-specific wrapper and swap class.

## Public API Entry Points
- `src/index.ts`: canonical export barrel.
- `src/swapper/SwapperFactory.ts`: typed initialization and factory flow.
- `src/swapper/Swapper.ts`: runtime swap orchestration (`swap`, lookup, persistence integration).
- `src/swapper/SwapperWithChain.ts`: chain-scoped swapper view.
- `src/swapper/SwapperWithSigner.ts`: signer-scoped swapper view.
- `src/swapper/SwapperUtils.ts`: stateless helper operations around tokens/swaps.

## Swap Protocol Matrix
- Smart chain -> BTC on-chain: `ToBTCWrapper` + `ToBTCSwap` + `ToBTCSwapState`.
- Smart chain -> BTC LN: `ToBTCLNWrapper` + `ToBTCLNSwap` + `ToBTCSwapState`.
- BTC on-chain -> smart chain (escrow): `FromBTCWrapper` + `FromBTCSwap` + `FromBTCSwapState`.
- BTC LN -> smart chain (escrow): `FromBTCLNWrapper` + `FromBTCLNSwap` + `FromBTCLNSwapState`.
- BTC LN -> smart chain (auto): `FromBTCLNAutoWrapper` + `FromBTCLNAutoSwap` + `FromBTCLNAutoSwapState`.
- BTC on-chain -> smart chain (SPV vault): `SpvFromBTCWrapper` + `SpvFromBTCSwap` + `SpvFromBTCSwapState`.
- Trusted LN -> gas: `LnForGasWrapper` + `LnForGasSwap` + `LnForGasSwapState`.
- Trusted BTC on-chain -> gas: `OnchainForGasWrapper` + `OnchainForGasSwap` + `OnchainForGasSwapState`.

## Class Index

### Wallet / Bitcoin
- `src/bitcoin/wallet/BitcoinWallet.ts`: `BitcoinWallet` (abstract wallet base).
- `src/bitcoin/wallet/SingleAddressBitcoinWallet.ts`: `SingleAddressBitcoinWallet`.

### Errors
- `src/errors/BitcoinNotEnoughBalanceError.ts`: `BitcoinNotEnoughBalanceError`.
- `src/errors/IntermediaryError.ts`: `IntermediaryError`.
- `src/errors/RequestError.ts`: `RequestError`, `OutOfBoundsError`.
- `src/errors/UserError.ts`: `UserError`.

### Events
- `src/events/UnifiedSwapEventListener.ts`: `UnifiedSwapEventListener`.

### HTTP / Param Coding
- `src/http/paramcoders/ParamEncoder.ts`: `ParamEncoder`.
- `src/http/paramcoders/ParamDecoder.ts`: `ParamDecoder`.
- `src/http/paramcoders/client/StreamParamEncoder.ts`: `StreamParamEncoder`.
- `src/http/paramcoders/client/ResponseParamDecoder.ts`: `ResponseParamDecoder`.

### Intermediary Layer
- `src/intermediaries/Intermediary.ts`: `Intermediary`.
- `src/intermediaries/IntermediaryDiscovery.ts`: `IntermediaryDiscovery`.
- `src/intermediaries/apis/IntermediaryAPI.ts`: `IntermediaryAPI`.
- `src/intermediaries/apis/TrustedIntermediaryAPI.ts`: `TrustedIntermediaryAPI`.

### LNURL
- `src/lnurl/LNURL.ts`: `LNURL`.

### Pricing
- `src/prices/abstract/ISwapPrice.ts`: `ISwapPrice` (abstract).
- `src/prices/abstract/ICachedSwapPrice.ts`: `ICachedSwapPrice` (abstract).
- `src/prices/abstract/IPriceProvider.ts`: `IPriceProvider` (abstract).
- `src/prices/providers/abstract/HttpPriceProvider.ts`: `HttpPriceProvider` (abstract).
- `src/prices/providers/abstract/ExchangePriceProvider.ts`: `ExchangePriceProvider` (abstract).
- `src/prices/providers/BinancePriceProvider.ts`: `BinancePriceProvider`.
- `src/prices/providers/CoinGeckoPriceProvider.ts`: `CoinGeckoPriceProvider`.
- `src/prices/providers/CoinPaprikaPriceProvider.ts`: `CoinPaprikaPriceProvider`.
- `src/prices/providers/KrakenPriceProvider.ts`: `KrakenPriceProvider`.
- `src/prices/providers/OKXPriceProvider.ts`: `OKXPriceProvider`.
- `src/prices/providers/CustomPriceProvider.ts`: `CustomPriceProvider`.
- `src/prices/SingleSwapPrice.ts`: `SingleSwapPrice`.
- `src/prices/RedundantSwapPrice.ts`: `RedundantSwapPrice`.
- `src/prices/SwapPriceWithChain.ts`: `SwapPriceWithChain`.

### Storage
- `src/storage/UnifiedSwapStorage.ts`: `UnifiedSwapStorage`.
- `src/storage-browser/IndexedDBUnifiedStorage.ts`: `IndexedDBUnifiedStorage`.
- `src/storage-browser/LocalStorageManager.ts`: `LocalStorageManager`.

### Swapper
- `src/swapper/Swapper.ts`: `Swapper`.
- `src/swapper/SwapperFactory.ts`: `SwapperFactory`.
- `src/swapper/SwapperUtils.ts`: `SwapperUtils`.
- `src/swapper/SwapperWithChain.ts`: `SwapperWithChain`.
- `src/swapper/SwapperWithSigner.ts`: `SwapperWithSigner`.

### Core Swap Abstractions
- `src/swaps/ISwap.ts`: `ISwap` (abstract).
- `src/swaps/ISwapWrapper.ts`: `ISwapWrapper` (abstract).
- `src/swaps/escrow_swaps/IEscrowSwap.ts`: `IEscrowSwap` (abstract).
- `src/swaps/escrow_swaps/IEscrowSelfInitSwap.ts`: `IEscrowSelfInitSwap` (abstract).
- `src/swaps/escrow_swaps/IEscrowSwapWrapper.ts`: `IEscrowSwapWrapper` (abstract).
- `src/swaps/escrow_swaps/frombtc/IFromBTCWrapper.ts`: `IFromBTCWrapper` (abstract).
- `src/swaps/escrow_swaps/frombtc/IFromBTCLNWrapper.ts`: `IFromBTCLNWrapper` (abstract).
- `src/swaps/escrow_swaps/frombtc/IFromBTCSelfInitSwap.ts`: `IFromBTCSelfInitSwap` (abstract).
- `src/swaps/escrow_swaps/tobtc/IToBTCWrapper.ts`: `IToBTCWrapper` (abstract).
- `src/swaps/escrow_swaps/tobtc/IToBTCSwap.ts`: `IToBTCSwap` (abstract).

### Concrete Swap Classes
- `src/swaps/escrow_swaps/tobtc/onchain/ToBTCWrapper.ts`: `ToBTCWrapper`.
- `src/swaps/escrow_swaps/tobtc/onchain/ToBTCSwap.ts`: `ToBTCSwap`.
- `src/swaps/escrow_swaps/tobtc/ln/ToBTCLNWrapper.ts`: `ToBTCLNWrapper`.
- `src/swaps/escrow_swaps/tobtc/ln/ToBTCLNSwap.ts`: `ToBTCLNSwap`.
- `src/swaps/escrow_swaps/frombtc/onchain/FromBTCWrapper.ts`: `FromBTCWrapper`.
- `src/swaps/escrow_swaps/frombtc/onchain/FromBTCSwap.ts`: `FromBTCSwap`.
- `src/swaps/escrow_swaps/frombtc/ln/FromBTCLNWrapper.ts`: `FromBTCLNWrapper`.
- `src/swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap.ts`: `FromBTCLNSwap`.
- `src/swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoWrapper.ts`: `FromBTCLNAutoWrapper`.
- `src/swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap.ts`: `FromBTCLNAutoSwap`.
- `src/swaps/spv_swaps/SpvFromBTCWrapper.ts`: `SpvFromBTCWrapper`.
- `src/swaps/spv_swaps/SpvFromBTCSwap.ts`: `SpvFromBTCSwap`.
- `src/swaps/trusted/ln/LnForGasWrapper.ts`: `LnForGasWrapper`.
- `src/swaps/trusted/ln/LnForGasSwap.ts`: `LnForGasSwap`.
- `src/swaps/trusted/onchain/OnchainForGasWrapper.ts`: `OnchainForGasWrapper`.
- `src/swaps/trusted/onchain/OnchainForGasSwap.ts`: `OnchainForGasSwap`.

## Interface Index
- `src/bitcoin/wallet/IBitcoinWallet.ts`: `IBitcoinWallet` and `isIBitcoinWallet`.
- `src/http/paramcoders/IParamReader.ts`: `IParamReader`.
- `src/storage/IUnifiedStorage.ts`: `IUnifiedStorage` and query/index types.
- `src/swaps/IAddressSwap.ts`: `IAddressSwap` and guard.
- `src/swaps/IBTCWalletSwap.ts`: `IBTCWalletSwap` and guard.
- `src/swaps/IClaimableSwap.ts`: `IClaimableSwap` and guard.
- `src/swaps/IClaimableSwapWrapper.ts`: `IClaimableSwapWrapper`.
- `src/swaps/IRefundableSwap.ts`: `IRefundableSwap` and guard.
- `src/swaps/ISwapWithGasDrop.ts`: `ISwapWithGasDrop` and guard.

## Utilities Index

### Core Utilities
- `src/utils/Utils.ts`: generic helpers (`throwIfUndefined`, `promiseAny`, map helpers, bigint helpers, decimal conversion, random/hash helpers).
- `src/utils/TimeoutUtils.ts`: timeout signal/promise helpers.
- `src/utils/RetryUtils.ts`: retry policy helper (`tryWithRetries`).
- `src/utils/Logger.ts`: logger wrapper (`getLogger`).

### Token / Swap Utilities
- `src/utils/TokenUtils.ts`: token amount parsing/formatting helpers.
- `src/utils/SwapUtils.ts`: swap type narrowing + `SwapProtocolInfo`.
- `src/utils/TypeUtils.ts`: TypeScript helper types.

### Bitcoin Utilities
- `src/utils/BitcoinUtils.ts`: script/address conversion + PSBT transaction parsing.
- `src/utils/BitcoinWalletUtils.ts`: wallet adapter conversion.

### Time Drift Utility
- `src/utils/AutomaticClockDriftCorrection.ts`: `correctClock` server-time synchronization helper.

## Constants and Assets
- `src/SmartChainAssets.ts`: `SmartChainAssets` ticker/asset metadata map.
- `src/types/Token.ts`: `BitcoinTokens` plus BTC/SC token type guards.
- `src/utils/SwapUtils.ts`: `SwapProtocolInfo` protocol metadata map.

## Enums and State Enums
- Global enums: `src/enums/FeeType.ts`, `src/enums/SwapAmountType.ts`, `src/enums/SwapDirection.ts`, `src/enums/SwapType.ts`.
- Swap state enums: `src/swaps/escrow_swaps/tobtc/IToBTCSwap.ts` -> `ToBTCSwapState`.
- Swap state enums: `src/swaps/escrow_swaps/frombtc/onchain/FromBTCSwap.ts` -> `FromBTCSwapState`.
- Swap state enums: `src/swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap.ts` -> `FromBTCLNSwapState`.
- Swap state enums: `src/swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap.ts` -> `FromBTCLNAutoSwapState`.
- Swap state enums: `src/swaps/spv_swaps/SpvFromBTCSwap.ts` -> `SpvFromBTCSwapState`.
- Swap state enums: `src/swaps/trusted/ln/LnForGasSwap.ts` -> `LnForGasSwapState`.
- Swap state enums: `src/swaps/trusted/onchain/OnchainForGasSwap.ts` -> `OnchainForGasSwapState`.
- API status enums: `src/intermediaries/apis/IntermediaryAPI.ts`.
- API status enums: `src/intermediaries/apis/TrustedIntermediaryAPI.ts`.
- Other enums: `src/intermediaries/IntermediaryDiscovery.ts` (`SwapHandlerType`).
- Other enums: `src/http/paramcoders/SchemaVerifier.ts` (`FieldTypeEnum`).

## High-Value Type Modules
- `src/types/AmountData.ts`
- `src/types/SwapExecutionAction.ts`
- `src/types/SwapWithSigner.ts`
- `src/types/Token.ts`
- `src/types/TokenAmount.ts`
- `src/types/PriceInfoType.ts`
- `src/types/SwapStateInfo.ts`
- `src/types/fees/Fee.ts`
- `src/types/fees/FeeBreakdown.ts`
- `src/types/fees/PercentagePPM.ts`
- `src/types/lnurl/LNURLPay.ts`
- `src/types/lnurl/LNURLWithdraw.ts`
- `src/types/wallets/MinimalBitcoinWalletInterface.ts`
- `src/types/wallets/MinimalLightningNetworkWalletInterface.ts`
- `src/types/wallets/LightningInvoiceCreateService.ts`

## Bitcoin and HTTP Supporting Modules
- `src/bitcoin/coinselect2/index.ts`: coin selection public functions (`coinSelect`, `maxSendable`).
- `src/bitcoin/coinselect2/accumulative.ts`: accumulative strategy.
- `src/bitcoin/coinselect2/blackjack.ts`: blackjack strategy.
- `src/bitcoin/coinselect2/utils.ts`: transaction size and dust logic.
- `src/http/HttpUtils.ts`: fetch timeout helper.
- `src/http/paramcoders/SchemaVerifier.ts`: request schema validation/parsing.
- `src/http/paramcoders/client/StreamingFetchPromise.ts`: streaming request utility.

## Where To Edit By Task
- Add or modify quote/create flow: start at the protocol wrapper `create(...)` method, then check shared price validation in `src/swaps/ISwapWrapper.ts` (`verifyReturnedPrice`).
- Adjust swap runtime state transitions: protocol swap class `_sync(...)` / `_tick(...)`, plus shared wrapper loop in `src/swaps/ISwapWrapper.ts` (`_tick`, `tick`).
- Add new persisted swap field: update swap `serialize()`/constructor in protocol swap class, then `src/storage/UnifiedSwapStorage.ts` and storage backend if index/query shape changes.
- Change intermediary request/response handling: `src/intermediaries/apis/IntermediaryAPI.ts` (escrow + SPV APIs) and `src/intermediaries/apis/TrustedIntermediaryAPI.ts` (trusted flows).
- Modify wallet behavior or signing: `src/bitcoin/wallet/*.ts`, `src/utils/BitcoinWalletUtils.ts`, and affected swap class.
- Modify price sources or fallback: `src/prices/providers/*`, `src/prices/RedundantSwapPrice.ts`, `src/prices/SingleSwapPrice.ts`.
- Update externally exposed symbols: `src/index.ts`.

## README Section Pointers
- `README.md:7` Installation.
- `README.md:22` How to use.
- `README.md:48` Preparations.
- `README.md:175` Initialization.
- `README.md:193` Bitcoin on-chain swaps.
- `README.md:493` SPV vault BTC -> smart chain flow.
- `README.md:659` Lightning swaps.
- `README.md:1043` LNURLs and readable lightning identifiers.
- `README.md:1372` Exact-In smart chain -> lightning swaps.
- `README.md:1499` Getting swap state.
- `README.md:1565` Stored swaps.
- `README.md:1625` Helpers.
- `README.md:1691` Manual smart chain transaction signing.

## Fast Local Search Commands
- Classes: `rg -n "^export (abstract class|class) " src -g "*.ts"`.
- Enums: `rg -n "^export enum " src -g "*.ts"`.
- Utilities exports: `rg -n "^export (function|const|type|interface|class) " src/utils -g "*.ts"`.
- Public API surface: `rg -n "." src/index.ts`.
- Swap create methods: `rg -n "async create\\(" src/swaps -g "*.ts"`.
- Swap sync/tick hooks: `rg -n "async _sync|async _tick|protected async _tick" src/swaps -g "*.ts"`.
