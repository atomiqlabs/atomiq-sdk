/// <reference types="node" />
import { ISwapPrice } from "../prices/abstract/ISwapPrice";
import { BitcoinNetwork, BtcRelay, ChainData, ChainType, Messenger, RelaySynchronizer } from "@atomiqlabs/base";
import { ToBTCLNOptions, ToBTCLNWrapper } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNWrapper";
import { ToBTCOptions, ToBTCWrapper } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCWrapper";
import { FromBTCLNOptions, FromBTCLNWrapper } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNWrapper";
import { FromBTCOptions, FromBTCWrapper } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCWrapper";
import { IntermediaryDiscovery } from "../intermediaries/IntermediaryDiscovery";
import { ISwap } from "../swaps/ISwap";
import { SwapType } from "../enums/SwapType";
import { FromBTCLNSwap } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap";
import { FromBTCSwap } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCSwap";
import { ToBTCLNSwap } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNSwap";
import { ToBTCSwap } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCSwap";
import { LnForGasWrapper } from "../swaps/trusted/ln/LnForGasWrapper";
import { LnForGasSwap } from "../swaps/trusted/ln/LnForGasSwap";
import { EventEmitter } from "events";
import { Intermediary } from "../intermediaries/Intermediary";
import { WrapperCtorTokens } from "../swaps/ISwapWrapper";
import { SwapperWithChain } from "./SwapperWithChain";
import { OnchainForGasSwap } from "../swaps/trusted/onchain/OnchainForGasSwap";
import { OnchainForGasWrapper } from "../swaps/trusted/onchain/OnchainForGasWrapper";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { IUnifiedStorage } from "../storage/IUnifiedStorage";
import { UnifiedSwapStorage, UnifiedSwapStorageCompositeIndexes, UnifiedSwapStorageIndexes } from "../storage/UnifiedSwapStorage";
import { UnifiedSwapEventListener } from "../events/UnifiedSwapEventListener";
import { IToBTCSwap } from "../swaps/escrow_swaps/tobtc/IToBTCSwap";
import { SpvFromBTCOptions, SpvFromBTCWrapper } from "../swaps/spv_swaps/SpvFromBTCWrapper";
import { SpvFromBTCSwap } from "../swaps/spv_swaps/SpvFromBTCSwap";
import { SwapperUtils } from "./SwapperUtils";
import { FromBTCLNAutoOptions, FromBTCLNAutoWrapper } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoWrapper";
import { FromBTCLNAutoSwap } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap";
import { SwapAmountType } from "../enums/SwapAmountType";
import { IClaimableSwap } from "../swaps/IClaimableSwap";
import { SwapTypeMapping } from "../utils/SwapUtils";
import { TokenAmount } from "../types/TokenAmount";
import { BtcToken, SCToken, Token } from "../types/Token";
import { LNURLWithdraw } from "../types/lnurl/LNURLWithdraw";
import { LNURLPay } from "../types/lnurl/LNURLPay";
import { NotNever } from "../utils/TypeUtils";
import { MempoolBitcoinBlock, MempoolBitcoinRpc } from "@atomiqlabs/btc-mempool";
import { LightningInvoiceCreateService } from "../types/wallets/LightningInvoiceCreateService";
/**
 * Configuration options for the Swapper
 * @category Core
 */
export type SwapperOptions = {
    intermediaryUrl?: string | string[];
    registryUrl?: string;
    bitcoinNetwork?: BitcoinNetwork;
    getRequestTimeout?: number;
    postRequestTimeout?: number;
    defaultAdditionalParameters?: {
        [key: string]: any;
    };
    storagePrefix?: string;
    defaultTrustedIntermediaryUrl?: string;
    swapStorage?: <T extends ChainType>(chainId: T["ChainId"]) => IUnifiedStorage<UnifiedSwapStorageIndexes, UnifiedSwapStorageCompositeIndexes>;
    noTimers?: boolean;
    noEvents?: boolean;
    noSwapCache?: boolean;
    dontCheckPastSwaps?: boolean;
    dontFetchLPs?: boolean;
    saveUninitializedSwaps?: boolean;
    automaticClockDriftCorrection?: boolean;
};
/**
 * Type representing multiple blockchain configurations
 * @category Core
 */
export type MultiChain = {
    [chainIdentifier in string]: ChainType;
};
type ChainSpecificData<T extends ChainType> = {
    wrappers: {
        [SwapType.TO_BTCLN]: ToBTCLNWrapper<T>;
        [SwapType.TO_BTC]: ToBTCWrapper<T>;
        [SwapType.FROM_BTCLN]: FromBTCLNWrapper<T>;
        [SwapType.FROM_BTC]: FromBTCWrapper<T>;
        [SwapType.TRUSTED_FROM_BTCLN]: LnForGasWrapper<T>;
        [SwapType.TRUSTED_FROM_BTC]: OnchainForGasWrapper<T>;
        [SwapType.SPV_VAULT_FROM_BTC]: SpvFromBTCWrapper<T>;
        [SwapType.FROM_BTCLN_AUTO]: FromBTCLNAutoWrapper<T>;
    };
    chainEvents: T["Events"];
    swapContract: T["Contract"];
    spvVaultContract: T["SpvVaultContract"];
    chainInterface: T["ChainInterface"];
    btcRelay: BtcRelay<any, T["TX"], MempoolBitcoinBlock, T["Signer"]>;
    synchronizer: RelaySynchronizer<any, T["TX"], MempoolBitcoinBlock>;
    unifiedChainEvents: UnifiedSwapEventListener<T>;
    unifiedSwapStorage: UnifiedSwapStorage<T>;
    reviver: (val: any) => ISwap<T>;
};
type MultiChainData<T extends MultiChain> = {
    [chainIdentifier in keyof T]: ChainSpecificData<T[chainIdentifier]>;
};
type CtorMultiChainData<T extends MultiChain> = {
    [chainIdentifier in keyof T]: ChainData<T[chainIdentifier]>;
};
/**
 * Type extracting chain identifiers from a MultiChain type
 * @category Core
 */
export type ChainIds<T extends MultiChain> = keyof T & string;
/**
 * Type helper to check if a chain supports a specific swap type
 * @category Core
 */
export type SupportsSwapType<C extends ChainType, Type extends SwapType> = Type extends SwapType.SPV_VAULT_FROM_BTC ? NotNever<C["SpvVaultContract"]> : Type extends (SwapType.TRUSTED_FROM_BTCLN | SwapType.TRUSTED_FROM_BTC) ? true : Type extends SwapType.FROM_BTCLN_AUTO ? (C["Contract"]["supportsInitWithoutClaimer"] extends true ? true : false) : NotNever<C["Contract"]>;
/**
 * Core orchestrator for all atomiq swap operations
 *
 * @category Core
 */
export declare class Swapper<T extends MultiChain> extends EventEmitter<{
    lpsRemoved: [Intermediary[]];
    lpsAdded: [Intermediary[]];
    swapState: [ISwap];
    swapLimitsChanged: [];
}> {
    private readonly logger;
    private readonly swapStateListener;
    private defaultTrustedIntermediary?;
    private readonly bitcoinNetwork;
    private readonly options;
    /**
     * Data propagation layer used for broadcasting messages to watchtowers
     */
    private readonly messenger;
    /**
     * A dictionary of smart chains used by the SDK
     * @internal
     */
    readonly _chains: MultiChainData<T>;
    /**
     * Bitcoin RPC for fetching bitcoin chain data
     * @internal
     */
    readonly _bitcoinRpc: MempoolBitcoinRpc;
    /**
     * Bitcoin network specification
     * @internal
     */
    readonly _btcNetwork: BTC_NETWORK;
    /**
     * Token data indexed by chain identifier and token addresses
     * @internal
     */
    readonly _tokens: {
        [chainId: string]: {
            [tokenAddress: string]: SCToken;
        };
    };
    /**
     * Token data indexed by chain identifier and token tickers
     * @internal
     */
    readonly _tokensByTicker: {
        [chainId: string]: {
            [tokenTicker: string]: SCToken;
        };
    };
    /**
     * Pricing API used by the SDK
     */
    readonly prices: ISwapPrice<T>;
    /**
     * Intermediary discovery instance
     */
    readonly intermediaryDiscovery: IntermediaryDiscovery;
    /**
     * Miscellaneous utility functions
     */
    readonly Utils: SwapperUtils<T>;
    constructor(bitcoinRpc: MempoolBitcoinRpc, chainsData: CtorMultiChainData<T>, pricing: ISwapPrice<T>, tokens: WrapperCtorTokens<T>, messenger: Messenger, options?: SwapperOptions);
    private _init;
    private initPromise?;
    private initialized;
    /**
     * Initializes the swap storage and loads existing swaps, needs to be called before any other action
     */
    init(): Promise<void>;
    /**
     * Stops listening for onchain events and closes this Swapper instance
     */
    stop(): Promise<void>;
    /**
     * Creates swap & handles intermediary, quote selection
     *
     * @param chainIdentifier
     * @param create Callback to create the
     * @param amountData Amount data as passed to the function
     * @param swapType Swap type of the execution
     * @param maxWaitTimeMS Maximum waiting time after the first intermediary returns the quote
     * @private
     * @throws {Error} when no intermediary was found
     * @throws {Error} if the chain with the provided identifier cannot be found
     */
    private createSwap;
    /**
     * Creates Smart chain -> Bitcoin ({@link SwapType.TO_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param address Recipient's bitcoin address
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to use exact in instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, address: string, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any> | undefined, options?: ToBTCOptions): Promise<ToBTCSwap<T[ChainIdentifier]>>;
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param paymentRequest BOLT11 lightning network invoice to be paid (needs to have a fixed amount), and the swap
     *  amount is taken from this fixed amount, hence only exact output swaps are supported
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, paymentRequest: string, additionalParams?: Record<string, any> | undefined, options?: ToBTCLNOptions): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via LNURL-pay link
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param lnurlPay LNURL-pay link to use for the payment
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwapViaLNURL<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, lnurlPay: string | LNURLPay, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any> | undefined, options?: ToBTCLNOptions & {
        comment?: string;
    }): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via {@link LightningInvoiceCreateService}
     *
     * @param chainIdentifier Chain identifier string of the source smart chain
     * @param signer Signer's address on the source chain
     * @param tokenAddress Token address to pay with
     * @param service Invoice create service object which facilitates the creation of fixed amount LN invoices
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwapViaInvoiceCreateService<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, service: LightningInvoiceCreateService, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any> | undefined, options?: ToBTCLNOptions): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates Bitcoin -> Smart chain ({@link SwapType.SPV_VAULT_FROM_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCSwapNew<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, recipient: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: SpvFromBTCOptions): Promise<SpvFromBTCSwap<T[ChainIdentifier]>>;
    /**
     * Creates LEGACY Bitcoin -> Smart chain ({@link SwapType.FROM_BTC}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, recipient: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCOptions): Promise<FromBTCSwap<T[ChainIdentifier]>>;
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, recipient: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCLNOptions): Promise<FromBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     */
    createFromBTCLNSwapViaLNURL<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, recipient: string, tokenAddress: string, lnurl: string | LNURLWithdraw, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined): Promise<FromBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwapNew<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, recipient: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCLNAutoOptions): Promise<FromBTCLNAutoSwap<T[ChainIdentifier]>>;
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwapNewViaLNURL<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, recipient: string, tokenAddress: string, lnurl: string | LNURLWithdraw, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCLNAutoOptions): Promise<FromBTCLNAutoSwap<T[ChainIdentifier]>>;
    /**
     * Creates a trusted Bitcoin Lightning -> Smart chain ({@link SwapType.TRUSTED_FROM_BTCLN}) gas swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param amount Amount of native token to receive, in base units
     * @param trustedIntermediaryOrUrl  URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    createTrustedLNForGasSwap<C extends ChainIds<T>>(chainIdentifier: C, recipient: string, amount: bigint, trustedIntermediaryOrUrl?: Intermediary | string): Promise<LnForGasSwap<T[C]>>;
    /**
     * Creates a trusted Bitcoin -> Smart chain ({@link SwapType.TRUSTED_FROM_BTC}) gas swap
     *
     * @param chainIdentifier Chain identifier string of the destination smart chain
     * @param recipient Recipient address on the destination chain
     * @param amount Amount of native token to receive, in base units
     * @param refundAddress Bitcoin refund address, in case the swap fails the funds are refunded here
     * @param trustedIntermediaryOrUrl URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    createTrustedOnchainForGasSwap<C extends ChainIds<T>>(chainIdentifier: C, recipient: string, amount: bigint, refundAddress?: string, trustedIntermediaryOrUrl?: Intermediary | string): Promise<OnchainForGasSwap<T[C]>>;
    /**
     * @internal
     */
    create<C extends ChainIds<T>>(signer: string, srcToken: BtcToken<true>, dstToken: SCToken<C>, amount: bigint, exactIn: boolean, lnurlWithdraw?: string | LNURLWithdraw): Promise<(SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T[C]> : FromBTCLNSwap<T[C]>)>;
    /**
     * @internal
     */
    create<C extends ChainIds<T>>(signer: string, srcToken: BtcToken<false>, dstToken: SCToken<C>, amount: bigint, exactIn: boolean): Promise<(SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T[C]> : FromBTCSwap<T[C]>)>;
    /**
     * @internal
     */
    create<C extends ChainIds<T>>(signer: string, srcToken: SCToken<C>, dstToken: BtcToken<false>, amount: bigint, exactIn: boolean, address: string): Promise<ToBTCSwap<T[C]>>;
    /**
     * @internal
     */
    create<C extends ChainIds<T>>(signer: string, srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: bigint, exactIn: boolean, lnurlPay: string | LNURLPay): Promise<ToBTCLNSwap<T[C]>>;
    /**
     * @internal
     */
    create<C extends ChainIds<T>>(signer: string, srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: undefined, exactIn: false, lightningInvoice: string): Promise<ToBTCLNSwap<T[C]>>;
    /**
     * Creates a swap from srcToken to dstToken, of a specific token amount, either specifying input amount (exactIn=true)
     *  or output amount (exactIn=false), NOTE: For regular -> BTC-LN (lightning) swaps the passed amount is ignored and
     *  invoice's pre-set amount is used instead.
     * @deprecated Use {@link swap} instead
     *
     * @param signer Smartchain (Solana, Starknet, etc.) address of the user
     * @param srcToken Source token of the swap, user pays this token
     * @param dstToken Destination token of the swap, user receives this token
     * @param amount Amount of the swap
     * @param exactIn Whether the amount specified is an input amount (exactIn=true) or an output amount (exactIn=false)
     * @param addressLnurlLightningInvoice Bitcoin on-chain address, lightning invoice, LNURL-pay to pay or
     *  LNURL-withdrawal to withdraw money from
     */
    create<C extends ChainIds<T>>(signer: string, srcToken: Token<C>, dstToken: Token<C>, amount: bigint | undefined, exactIn: boolean, addressLnurlLightningInvoice?: string | LNURLWithdraw | LNURLPay): Promise<ISwap<T[C]>>;
    /**
     * @internal
     */
    swap<C extends ChainIds<T>>(srcToken: BtcToken<true>, dstToken: SCToken<C>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: undefined | string | LNURLWithdraw, dstSmartchainWallet: string, options?: (SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoOptions : FromBTCLNOptions)): Promise<(SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T[C]> : FromBTCLNSwap<T[C]>)>;
    /**
     * @internal
     */
    swap<C extends ChainIds<T>>(srcToken: BtcToken<false>, dstToken: SCToken<C>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: undefined | string, dstSmartchainWallet: string, options?: (SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCOptions : FromBTCOptions)): Promise<(SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T[C]> : FromBTCSwap<T[C]>)>;
    /**
     * @internal
     */
    swap<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<false>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: string, dstAddress: string, options?: ToBTCOptions): Promise<ToBTCSwap<T[C]>>;
    /**
     * @internal
     */
    swap<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: string, dstLnurlPayOrInvoiceCreateService: string | LNURLPay | LightningInvoiceCreateService, options?: ToBTCLNOptions & {
        comment?: string;
    }): Promise<ToBTCLNSwap<T[C]>>;
    /**
     * @internal
     */
    swap<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: undefined, exactIn: false | SwapAmountType.EXACT_OUT, src: string, dstLightningInvoice: string, options?: ToBTCLNOptions): Promise<ToBTCLNSwap<T[C]>>;
    /**
     * Creates a swap from srcToken to dstToken, of a specific token amount, either specifying input amount (if `exactIn=true`)
     *  or output amount (if `exactIn=false`), NOTE: For regular Smart chain -> BTC-LN (lightning) swaps the passed amount is ignored and
     *  invoice's pre-set amount is used instead, use LNURL-pay links for dynamic amounts
     *
     * @param srcToken Source token of the swap, user pays this token
     * @param dstToken Destination token of the swap, user receives this token
     * @param amount Amount of the swap either in base units as {bigint} or in human readable format (with decimals) as {string}
     * @param exactIn Whether the amount specified is an input amount (exactIn=true) or an output amount (exactIn=false)
     * @param src Source wallet/lnurl-withdraw of the swap
     * @param dst Destination smart chain address, bitcoin on-chain address, lightning invoice, LNURL-pay
     * @param options Options for the swap
     */
    swap<C extends ChainIds<T>>(srcToken: Token<C> | string, dstToken: Token<C> | string, amount: bigint | string | undefined, exactIn: boolean | SwapAmountType, src: undefined | string | LNURLWithdraw, dst: string | LNURLPay | LightningInvoiceCreateService, options?: FromBTCLNOptions | SpvFromBTCOptions | FromBTCOptions | ToBTCOptions | (ToBTCLNOptions & {
        comment?: string;
    }) | FromBTCLNAutoOptions): Promise<ISwap<T[C]>>;
    /**
     * Returns all swaps
     */
    getAllSwaps(): Promise<ISwap[]>;
    /**
     * Returns all swaps for the specific chain, and optionally also for a specific signer's address
     */
    getAllSwaps<C extends ChainIds<T>>(chainId: C, signer?: string): Promise<ISwap<T[C]>[]>;
    /**
     * Returns all swaps where an action is required (either claim or refund)
     */
    getActionableSwaps(): Promise<ISwap[]>;
    /**
     * Returns swaps where an action is required (either claim or refund) for the specific chain, and optionally also for a specific signer's address
     */
    getActionableSwaps<C extends ChainIds<T>>(chainId: C, signer?: string): Promise<ISwap<T[C]>[]>;
    /**
     * Returns all swaps that are refundable
     */
    getRefundableSwaps(): Promise<IToBTCSwap[]>;
    /**
     * Returns swaps which are refundable for the specific chain, and optionally also for a specific signer's address
     */
    getRefundableSwaps<C extends ChainIds<T>>(chainId: C, signer?: string): Promise<IToBTCSwap<T[C]>[]>;
    /**
     * Returns all swaps that are manually claimable
     */
    getClaimableSwaps(): Promise<IClaimableSwap[]>;
    /**
     * Returns all swaps that are manually claimable for the specific chain, and optionally also for a specific signer's address
     */
    getClaimableSwaps<C extends ChainIds<T>>(chainId: C, signer?: string): Promise<IClaimableSwap<T[C]>[]>;
    /**
     * Returns swap with a specific id (identifier)
     */
    getSwapById(id: string): Promise<ISwap>;
    /**
     * Returns swap with a specific id (identifier) on a specific chain and optionally with a signer
     */
    getSwapById<C extends ChainIds<T>>(id: string, chainId: C, signer?: string): Promise<ISwap<T[C]>>;
    /**
     * Returns the swap with a proper return type, or `undefined` if not found or has wrong type
     *
     * @param id An ID of the swap ({@link ISwap.getId})
     * @param chainId Chain identifier of the smart chain where the swap was initiated
     * @param swapType Type of the swap
     * @param signer An optional required smart chain signer address to fetch the swap for
     */
    getTypedSwapById<C extends ChainIds<T>, S extends SwapType>(id: string, chainId: C, swapType: S, signer?: string): Promise<SwapTypeMapping<T[C]>[S] | undefined>;
    private syncSwapsForChain;
    /**
     * Deletes the swaps from the persistent storage backend. Note that some data (like lightning network
     *  amounts and bolt11 invoices) are purely off-chain and can never be recovered later just from
     *  on-chain data!
     *
     * @param chainId Optional, to only delete swaps for this smart chain
     * @param signer Optional, to only delete swaps for this smart chain signer (`chainId` param must be
     *  set to delete only signer's swaps)
     */
    wipeStorage<C extends ChainIds<T>>(chainId?: C, signer?: string): Promise<void>;
    /**
     * Synchronizes swaps from on-chain, this is ran automatically when SDK is initialized, hence
     *  should only be ran manually when `dontCheckPastSwaps=true` is passed in the swapper options,
     *  also deletes expired quotes
     *
     * @param chainId Optional chain identifier to only run swap sync for a single smart chain
     * @param signer Optional signer to only run swap sync for swaps initiated by this signer
     */
    _syncSwaps<C extends ChainIds<T>>(chainId?: C, signer?: string): Promise<void>;
    /**
     * Recovers swaps from on-chain historical data.
     *
     * Please note that the recovered swaps might not be complete (i.e. missing amounts or addresses), as some
     *  of the swap data is purely off-chain and can never be recovered purely from on-chain data. This
     *  functions tries to recover as much swap data as possible.
     *
     * @param chainId Smart chain identifier string to recover the swaps from
     * @param signer Signer address to recover the swaps for
     * @param startBlockheight Optional starting blockheight for swap data recovery, will only check swaps
     *  initiated after this blockheight
     */
    recoverSwaps<C extends ChainIds<T>>(chainId: C, signer: string, startBlockheight?: number): Promise<ISwap<T[C]>[]>;
    /**
     * Returns the {@link Token} object for a given token
     *
     * @param tickerOrAddress Token to return the object for, can use multiple formats:
     *  - a) token ticker, such as `"BTC"`, `"SOL"`, etc.
     *  - b) token ticker prefixed with smart chain identifier, such as `"SOLANA-SOL"`, `"SOLANA-USDC"`, etc.
     *  - c) token address
     */
    getToken(tickerOrAddress: string): Token<ChainIds<T>>;
    /**
     * Creates a child swapper instance with a given smart chain
     *
     * @param chainIdentifier Smart chain identifier for the created child swapper instance
     */
    withChain<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): SwapperWithChain<T, ChainIdentifier>;
    /**
     * Returns an array of all the supported smart chains
     */
    getSmartChains(): ChainIds<T>[];
    /**
     * Returns whether the SDK supports a given swap type on a given chain based on currently known LPs
     *
     * @param chainId Smart chain identifier string
     * @param swapType Swap protocol type
     */
    supportsSwapType<ChainIdentifier extends ChainIds<T>, Type extends SwapType>(chainId: ChainIdentifier, swapType: Type): SupportsSwapType<T[ChainIdentifier], Type>;
    /**
     * @internal
     */
    getSwapType<C extends ChainIds<T>>(srcToken: BtcToken<true>, dstToken: SCToken<C>): (SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? SwapType.FROM_BTCLN_AUTO : SwapType.FROM_BTCLN);
    /**
     * @internal
     */
    getSwapType<C extends ChainIds<T>>(srcToken: BtcToken<false>, dstToken: SCToken<C>): (SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SwapType.SPV_VAULT_FROM_BTC : SwapType.FROM_BTC);
    /**
     * @internal
     */
    getSwapType<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<false>): SwapType.TO_BTC;
    /**
     * @internal
     */
    getSwapType<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<true>): SwapType.TO_BTCLN;
    /**
     * Returns type of the swap based on input and output tokens specified
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapType<C extends ChainIds<T>>(srcToken: Token<C>, dstToken: Token<C>): SwapType.FROM_BTCLN_AUTO | SwapType.FROM_BTCLN | SwapType.SPV_VAULT_FROM_BTC | SwapType.FROM_BTC | SwapType.TO_BTC | SwapType.TO_BTCLN;
    /**
     * Helper information about various swap protocol and their features:
     * - `requiresInputWallet`: Whether a swap requires a connected wallet on the input chain able to sign
     *  arbitrary transaction
     * - `requiresOutputWallet`: Whether a swap requires a connected wallet on the output chain able to sign
     *  arbitrary transactions
     * - `supportsGasDrop`: Whether a swap supports the "gas drop" feature, allowing to user to receive a small
     *  amount of native token as part of the swap when swapping to smart chains
     *
     * Uses a `Record` type here, use the {@link SwapProtocolInfo} import for a literal readonly type, with
     *  pre-filled exact values in the type.
     */
    readonly SwapTypeInfo: Record<SwapType, {
        requiresInputWallet: boolean;
        requiresOutputWallet: boolean;
        supportsGasDrop: boolean;
    }>;
    /**
     * Returns minimum/maximum limits for inputs and outputs for a swap between given tokens
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapLimits<C extends ChainIds<T>, A extends Token<C>, B extends Token<C>>(srcToken: A, dstToken: B): {
        input: {
            min: TokenAmount<string, A>;
            max?: TokenAmount<string, A>;
        };
        output: {
            min: TokenAmount<string, B>;
            max?: TokenAmount<string, B>;
        };
    };
    /**
     * Returns an array of supported tokens either on the input or on the output of a swap
     *
     * @param input Whether to return input tokens or output tokens
     */
    getSupportedTokens(input: boolean): Token[];
    /**
     * Returns a set of supported tokens by all the intermediaries offering a specific swap service
     *
     * @param _swapType Swap service type to check supported tokens for
     */
    private getSupportedTokensForSwapType;
    /**
     * Returns the set of supported token addresses by all the intermediaries we know of offering a specific swapType service
     *
     * @param chainIdentifier Chain identifier string
     * @param swapType Specific swap type for which to obtain supported tokens
     */
    private getSupportedTokenAddresses;
    /**
     * Returns tokens that you can swap to (if input=true) from a given token,
     *  or tokens that you can swap from (if input=false) to a given token
     */
    getSwapCounterTokens(token: Token, input: boolean): Token[];
}
export {};
