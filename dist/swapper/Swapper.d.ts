/// <reference types="node" />
import { ISwapPrice } from "../prices/abstract/ISwapPrice";
import { BitcoinNetwork, BtcRelay, ChainData, ChainType, Messenger, RelaySynchronizer } from "@atomiqlabs/base";
import { InvoiceCreateService, ToBTCLNOptions, ToBTCLNWrapper } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNWrapper";
import { ToBTCOptions, ToBTCWrapper } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCWrapper";
import { FromBTCLNOptions, FromBTCLNWrapper } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNWrapper";
import { FromBTCOptions, FromBTCWrapper } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCWrapper";
import { IntermediaryDiscovery, MultichainSwapBounds, SwapBounds } from "../intermediaries/IntermediaryDiscovery";
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
import { MempoolApi, MempoolBitcoinBlock, MempoolBitcoinRpc } from "@atomiqlabs/btc-mempool";
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
 * Core orchestrator for all swap operations with multi-chain support
 * @category Core
 */
export declare class Swapper<T extends MultiChain> extends EventEmitter<{
    lpsRemoved: [Intermediary[]];
    lpsAdded: [Intermediary[]];
    swapState: [ISwap];
    swapLimitsChanged: [];
}> {
    protected readonly logger: import("../utils/Logger").LoggerType;
    protected readonly swapStateListener: (swap: ISwap) => void;
    private defaultTrustedIntermediary?;
    private readonly _bitcoinNetwork;
    private readonly options;
    readonly chains: MultiChainData<T>;
    readonly prices: ISwapPrice<T>;
    readonly intermediaryDiscovery: IntermediaryDiscovery;
    readonly mempoolApi: MempoolApi;
    readonly bitcoinRpc: MempoolBitcoinRpc;
    readonly bitcoinNetwork: BTC_NETWORK;
    readonly messenger: Messenger;
    readonly Utils: SwapperUtils<T>;
    readonly tokens: {
        [chainId: string]: {
            [tokenAddress: string]: SCToken;
        };
    };
    readonly tokensByTicker: {
        [chainId: string]: {
            [tokenTicker: string]: SCToken;
        };
    };
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
     * Creates To BTC swap
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress          Token address to pay with
     * @param address               Recipient's bitcoin address
     * @param amount                Amount to send in satoshis (bitcoin's smallest denomination)
     * @param exactIn               Whether to use exact in instead of exact out
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createToBTCSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, address: string, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any> | undefined, options?: ToBTCOptions): Promise<ToBTCSwap<T[ChainIdentifier]>>;
    /**
     * Creates To BTCLN swap
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress          Token address to pay with
     * @param paymentRequest        BOLT11 lightning network invoice to be paid (needs to have a fixed amount)
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createToBTCLNSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, paymentRequest: string, additionalParams?: Record<string, any> | undefined, options?: ToBTCLNOptions): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates To BTCLN swap via LNURL-pay
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress          Token address to pay with
     * @param lnurlPay              LNURL-pay link to use for the payment
     * @param amount                Amount to be paid in sats
     * @param exactIn               Whether to do an exact in swap instead of exact out
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createToBTCLNSwapViaLNURL<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, lnurlPay: string | LNURLPay, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any> | undefined, options?: ToBTCLNOptions & {
        comment?: string;
    }): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates To BTCLN swap via InvoiceCreationService
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress          Token address to pay with
     * @param service               Invoice create service object which facilitates the creation of fixed amount LN invoices
     * @param amount                Amount to be paid in sats
     * @param exactIn               Whether to do an exact in swap instead of exact out
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createToBTCLNSwapViaInvoiceCreateService<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, service: InvoiceCreateService, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any> | undefined, options?: ToBTCLNOptions): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates From BTC swap
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress          Token address to receive
     * @param amount                Amount to receive, in satoshis (bitcoin's smallest denomination)
     * @param exactOut              Whether to use a exact out instead of exact in
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createFromBTCSwapNew<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: SpvFromBTCOptions): Promise<SpvFromBTCSwap<T[ChainIdentifier]>>;
    /**
     * Creates From BTC swap
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress          Token address to receive
     * @param amount                Amount to receive, in satoshis (bitcoin's smallest denomination)
     * @param exactOut              Whether to use a exact out instead of exact in
     * @param additionalParams      Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createFromBTCSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCOptions): Promise<FromBTCSwap<T[ChainIdentifier]>>;
    /**
     * Creates From BTCLN swap
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress      Token address to receive
     * @param amount            Amount to receive, in satoshis (bitcoin's smallest denomination)
     * @param exactOut          Whether to use exact out instead of exact in
     * @param additionalParams  Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createFromBTCLNSwap<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCLNOptions): Promise<FromBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates From BTCLN swap, withdrawing from LNURL-withdraw
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress      Token address to receive
     * @param lnurl             LNURL-withdraw to pull the funds from
     * @param amount            Amount to receive, in satoshis (bitcoin's smallest denomination)
     * @param exactOut          Whether to use exact out instead of exact in
     * @param additionalParams  Additional parameters sent to the LP when creating the swap
     */
    createFromBTCLNSwapViaLNURL<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, lnurl: string | LNURLWithdraw, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined): Promise<FromBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates From BTCLN swap using new protocol
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress      Token address to receive
     * @param amount            Amount to receive, in satoshis (bitcoin's smallest denomination)
     * @param exactOut          Whether to use exact out instead of exact in
     * @param additionalParams  Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createFromBTCLNSwapNew<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCLNAutoOptions): Promise<FromBTCLNAutoSwap<T[ChainIdentifier]>>;
    /**
     * Creates From BTCLN swap using new protocol, withdrawing from LNURL-withdraw
     *
     * @param chainIdentifier
     * @param signer
     * @param tokenAddress      Token address to receive
     * @param lnurl             LNURL-withdraw to pull the funds from
     * @param amount            Amount to receive, in satoshis (bitcoin's smallest denomination)
     * @param exactOut          Whether to use exact out instead of exact in
     * @param additionalParams  Additional parameters sent to the LP when creating the swap
     * @param options
     */
    createFromBTCLNSwapNewViaLNURL<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, signer: string, tokenAddress: string, lnurl: string | LNURLWithdraw, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any> | undefined, options?: FromBTCLNAutoOptions): Promise<FromBTCLNAutoSwap<T[ChainIdentifier]>>;
    /**
     * Creates trusted LN for Gas swap
     *
     * @param chainId
     * @param signer
     * @param amount                    Amount of native token to receive, in base units
     * @param trustedIntermediaryOrUrl  URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error}                  If no trusted intermediary specified
     */
    createTrustedLNForGasSwap<C extends ChainIds<T>>(chainId: C, signer: string, amount: bigint, trustedIntermediaryOrUrl?: Intermediary | string): Promise<LnForGasSwap<T[C]>>;
    /**
     * Creates trusted BTC on-chain for Gas swap
     *
     * @param chainId
     * @param signer
     * @param amount                    Amount of native token to receive, in base units
     * @param refundAddress             Bitcoin refund address, in case the swap fails
     * @param trustedIntermediaryOrUrl  URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error}                  If no trusted intermediary specified
     */
    createTrustedOnchainForGasSwap<C extends ChainIds<T>>(chainId: C, signer: string, amount: bigint, refundAddress?: string, trustedIntermediaryOrUrl?: Intermediary | string): Promise<OnchainForGasSwap<T[C]>>;
    create<C extends ChainIds<T>>(signer: string, srcToken: BtcToken<true>, dstToken: SCToken<C>, amount: bigint, exactIn: boolean, lnurlWithdraw?: string | LNURLWithdraw): Promise<(SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T[C]> : FromBTCLNSwap<T[C]>)>;
    create<C extends ChainIds<T>>(signer: string, srcToken: BtcToken<false>, dstToken: SCToken<C>, amount: bigint, exactIn: boolean): Promise<(SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T[C]> : FromBTCSwap<T[C]>)>;
    create<C extends ChainIds<T>>(signer: string, srcToken: SCToken<C>, dstToken: BtcToken<false>, amount: bigint, exactIn: boolean, address: string): Promise<ToBTCSwap<T[C]>>;
    create<C extends ChainIds<T>>(signer: string, srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: bigint, exactIn: boolean, lnurlPay: string | LNURLPay): Promise<ToBTCLNSwap<T[C]>>;
    create<C extends ChainIds<T>>(signer: string, srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: undefined, exactIn: false, lightningInvoice: string): Promise<ToBTCLNSwap<T[C]>>;
    create<C extends ChainIds<T>>(signer: string, srcToken: Token<C>, dstToken: Token<C>, amount: bigint | undefined, exactIn: boolean, addressLnurlLightningInvoice?: string | LNURLWithdraw | LNURLPay): Promise<ISwap<T[C]>>;
    swap<C extends ChainIds<T>>(srcToken: BtcToken<true>, dstToken: SCToken<C>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: undefined | string | LNURLWithdraw, dstSmartchainWallet: string, options?: (SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoOptions : FromBTCLNOptions)): Promise<(SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T[C]> : FromBTCLNSwap<T[C]>)>;
    swap<C extends ChainIds<T>>(srcToken: BtcToken<false>, dstToken: SCToken<C>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: undefined | string, dstSmartchainWallet: string, options?: (SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCOptions : FromBTCOptions)): Promise<(SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T[C]> : FromBTCSwap<T[C]>)>;
    swap<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<false>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: string, dstAddress: string, options?: ToBTCOptions): Promise<ToBTCSwap<T[C]>>;
    swap<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: bigint | string, exactIn: boolean | SwapAmountType, src: string, dstLnurlPayOrInvoiceCreateService: string | LNURLPay | InvoiceCreateService, options?: ToBTCLNOptions & {
        comment?: string;
    }): Promise<ToBTCLNSwap<T[C]>>;
    swap<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<true>, amount: undefined, exactIn: false | SwapAmountType.EXACT_OUT, src: string, dstLightningInvoice: string, options?: ToBTCLNOptions): Promise<ToBTCLNSwap<T[C]>>;
    swap<C extends ChainIds<T>>(srcToken: Token<C> | string, dstToken: Token<C> | string, amount: bigint | string | undefined, exactIn: boolean | SwapAmountType, src: undefined | string | LNURLWithdraw, dst: string | LNURLPay | InvoiceCreateService, options?: FromBTCLNOptions | SpvFromBTCOptions | FromBTCOptions | ToBTCOptions | (ToBTCLNOptions & {
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
     * Returns the swap with a proper return type, or undefined, if not found, or has wrong type
     *
     * @param id
     * @param chainId
     * @param swapType
     * @param signer
     */
    getTypedSwapById<C extends ChainIds<T>, S extends SwapType>(id: string, chainId: C, swapType: S, signer?: string): Promise<SwapTypeMapping<T[C]>[S] | undefined>;
    private syncSwapsForChain;
    /**
     * Synchronizes swaps from chain, this is usually ran when SDK is initialized, deletes expired quotes
     *
     * @param chainId
     * @param signer
     */
    _syncSwaps<C extends ChainIds<T>>(chainId?: C, signer?: string): Promise<void>;
    /**
     * Attempts to recover partial swap data from on-chain historical data
     *
     * @param chainId
     * @param signer
     * @param startBlockheight
     */
    recoverSwaps<C extends ChainIds<T>>(chainId: C, signer: string, startBlockheight?: number): Promise<ISwap<T[C]>[]>;
    getToken(tickerOrAddress: string): Token<ChainIds<T>>;
    /**
     * Creates a child swapper instance with a given smart chain
     *
     * @param chainIdentifier
     */
    withChain<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): SwapperWithChain<T, ChainIdentifier>;
    /**
     * Returns supported smart chains
     */
    getSmartChains(): ChainIds<T>[];
    /**
     * Returns whether the SDK supports a given swap type on a given chain based on currently known LPs
     *
     * @param chainId
     * @param swapType
     */
    supportsSwapType<ChainIdentifier extends ChainIds<T>, Type extends SwapType>(chainId: ChainIdentifier, swapType: Type): SupportsSwapType<T[ChainIdentifier], Type>;
    /**
     * Returns type of the swap based on input and output tokens specified
     *
     * @param srcToken
     * @param dstToken
     */
    getSwapType<C extends ChainIds<T>>(srcToken: BtcToken<true>, dstToken: SCToken<C>): (SupportsSwapType<T[C], SwapType.FROM_BTCLN_AUTO> extends true ? SwapType.FROM_BTCLN_AUTO : SwapType.FROM_BTCLN);
    getSwapType<C extends ChainIds<T>>(srcToken: BtcToken<false>, dstToken: SCToken<C>): (SupportsSwapType<T[C], SwapType.SPV_VAULT_FROM_BTC> extends true ? SwapType.SPV_VAULT_FROM_BTC : SwapType.FROM_BTC);
    getSwapType<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<false>): SwapType.TO_BTC;
    getSwapType<C extends ChainIds<T>>(srcToken: SCToken<C>, dstToken: BtcToken<true>): SwapType.TO_BTCLN;
    getSwapType<C extends ChainIds<T>>(srcToken: Token<C>, dstToken: Token<C>): SwapType.FROM_BTCLN_AUTO | SwapType.FROM_BTCLN | SwapType.SPV_VAULT_FROM_BTC | SwapType.FROM_BTC | SwapType.TO_BTC | SwapType.TO_BTCLN;
    readonly SwapTypeInfo: {
        readonly 2: {
            readonly requiresInputWallet: true;
            readonly requiresOutputWallet: false;
            readonly supportsGasDrop: false;
        };
        readonly 3: {
            readonly requiresInputWallet: true;
            readonly requiresOutputWallet: false;
            readonly supportsGasDrop: false;
        };
        readonly 0: {
            readonly requiresInputWallet: false;
            readonly requiresOutputWallet: true;
            readonly supportsGasDrop: false;
        };
        readonly 1: {
            readonly requiresInputWallet: false;
            readonly requiresOutputWallet: true;
            readonly supportsGasDrop: false;
        };
        readonly 6: {
            readonly requiresInputWallet: true;
            readonly requiresOutputWallet: false;
            readonly supportsGasDrop: true;
        };
        readonly 7: {
            readonly requiresInputWallet: false;
            readonly requiresOutputWallet: false;
            readonly supportsGasDrop: true;
        };
        readonly 4: {
            readonly requiresInputWallet: false;
            readonly requiresOutputWallet: false;
            readonly supportsGasDrop: false;
        };
        readonly 5: {
            readonly requiresInputWallet: false;
            readonly requiresOutputWallet: false;
            readonly supportsGasDrop: false;
        };
    };
    /**
     * Returns minimum/maximum limits for inputs and outputs for a swap between given tokens
     *
     * @param srcToken
     * @param dstToken
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
     * Returns supported tokens for a given direction
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
     * @param chainIdentifier
     * @param swapType Specific swap type for which to obtain supported tokens
     */
    private getSupportedTokenAddresses;
    /**
     * Returns tokens that you can swap to (if input=true) from a given token,
     *  or tokens that you can swap from (if input=false) to a given token
     */
    getSwapCounterTokens(token: Token, input: boolean): Token[];
    /**
     * Returns swap bounds (minimums & maximums) for different swap types & tokens
     * @deprecated Use getSwapLimits() instead!
     */
    getSwapBounds<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier): SwapBounds;
    getSwapBounds(): MultichainSwapBounds;
    /**
     * Returns maximum possible swap amount
     * @deprecated Use getSwapLimits() instead!
     *
     * @param chainIdentifier
     * @param type      Type of the swap
     * @param token     Token of the swap
     */
    getMaximum<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, type: SwapType, token: string): bigint;
    /**
     * Returns minimum possible swap amount
     * @deprecated Use getSwapLimits() instead!
     *
     * @param chainIdentifier
     * @param type      Type of swap
     * @param token     Token of the swap
     */
    getMinimum<ChainIdentifier extends ChainIds<T>>(chainIdentifier: ChainIdentifier, type: SwapType, token: string): bigint;
}
export {};
