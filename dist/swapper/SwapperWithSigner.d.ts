import { IntermediaryDiscovery } from "../intermediaries/IntermediaryDiscovery";
import { SwapType } from "../enums/SwapType";
import { LnForGasSwap } from "../swaps/trusted/ln/LnForGasSwap";
import { ISwap } from "../swaps/ISwap";
import { IToBTCSwap } from "../swaps/escrow_swaps/tobtc/IToBTCSwap";
import { ChainIds, MultiChain, SupportsSwapType } from "./Swapper";
import { FromBTCLNSwap } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap";
import { FromBTCSwap } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCSwap";
import { ToBTCLNSwap } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNSwap";
import { ToBTCSwap } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCSwap";
import { SwapPriceWithChain } from "../prices/SwapPriceWithChain";
import { ToBTCOptions } from "../swaps/escrow_swaps/tobtc/onchain/ToBTCWrapper";
import { ToBTCLNOptions } from "../swaps/escrow_swaps/tobtc/ln/ToBTCLNWrapper";
import { FromBTCOptions } from "../swaps/escrow_swaps/frombtc/onchain/FromBTCWrapper";
import { FromBTCLNOptions } from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNWrapper";
import { SwapperUtils } from "./SwapperUtils";
import { SpvFromBTCSwap } from "../swaps/spv_swaps/SpvFromBTCSwap";
import { SwapperWithChain } from "./SwapperWithChain";
import { SwapWithSigner } from "../types/SwapWithSigner";
import { OnchainForGasSwap } from "../swaps/trusted/onchain/OnchainForGasSwap";
import { FromBTCLNAutoSwap } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap";
import { FromBTCLNAutoOptions } from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoWrapper";
import { TokenAmount } from "../types/TokenAmount";
import { BtcToken, SCToken, Token } from "../types/Token";
import { LNURLWithdraw } from "../types/lnurl/LNURLWithdraw";
import { LNURLPay } from "../types/lnurl/LNURLPay";
import { LightningInvoiceCreateService } from "../types/wallets/LightningInvoiceCreateService";
import { Intermediary } from "../intermediaries/Intermediary";
import { SpvFromBTCOptions } from "../swaps/spv_swaps/SpvFromBTCWrapper";
import { SwapTypeMapping } from "../utils/SwapUtils";
/**
 * Chain and signer-specific wrapper for automatic signer injection into swap methods
 * @category Core
 */
export declare class SwapperWithSigner<T extends MultiChain, ChainIdentifier extends ChainIds<T>> {
    private readonly signer;
    /**
     * Underlying single chain swapper instance
     */
    private readonly swapper;
    /**
     * Smart chain identifier of this swapper with chain and signer
     */
    readonly chainIdentifier: ChainIdentifier;
    /**
     * Pricing API used by the SDK
     */
    get prices(): SwapPriceWithChain<T, ChainIdentifier>;
    /**
     * Intermediary discovery instance
     */
    get intermediaryDiscovery(): IntermediaryDiscovery;
    /**
     * Miscellaneous utility functions
     */
    get Utils(): SwapperUtils<T>;
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
    get SwapTypeInfo(): Record<SwapType, {
        requiresInputWallet: boolean;
        requiresOutputWallet: boolean;
        supportsGasDrop: boolean;
    }>;
    constructor(swapper: SwapperWithChain<T, ChainIdentifier>, signer: T[ChainIdentifier]["Signer"]);
    /**
     * Creates Smart chain -> Bitcoin ({@link SwapType.TO_BTC}) swap
     *
     * @param tokenAddress Token address to pay with
     * @param address Recipient's bitcoin address
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to use exact in instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCSwap(tokenAddress: string, address: string, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any>, options?: ToBTCOptions): Promise<SwapWithSigner<ToBTCSwap<T[ChainIdentifier]>>>;
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap
     *
     * @param tokenAddress Token address to pay with
     * @param paymentRequest BOLT11 lightning network invoice to be paid (needs to have a fixed amount), and the swap
     *  amount is taken from this fixed amount, hence only exact output swaps are supported
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwap(tokenAddress: string, paymentRequest: string, additionalParams?: Record<string, any>, options?: ToBTCLNOptions & {
        comment?: string;
    }): Promise<SwapWithSigner<ToBTCLNSwap<T[ChainIdentifier]>>>;
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via LNURL-pay link
     *
     * @param tokenAddress Token address to pay with
     * @param lnurlPay LNURL-pay link to use for the payment
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwapViaLNURL(tokenAddress: string, lnurlPay: string | LNURLPay, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any>, options?: ToBTCLNOptions): Promise<SwapWithSigner<ToBTCLNSwap<T[ChainIdentifier]>>>;
    /**
     * Creates Smart chain -> Bitcoin Lightning ({@link SwapType.TO_BTCLN}) swap via {@link LightningInvoiceCreateService}
     *
     * @param tokenAddress Token address to pay with
     * @param service Invoice create service object which facilitates the creation of fixed amount LN invoices
     * @param amount Amount to send in token based units (if `exactIn=true`) or receive in satoshis (if `exactIn=false`)
     * @param exactIn Whether to do an exact in swap instead of exact out
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createToBTCLNSwapViaInvoiceCreateService(tokenAddress: string, service: LightningInvoiceCreateService, amount: bigint, exactIn?: boolean, additionalParams?: Record<string, any>, options?: ToBTCLNOptions): Promise<SwapWithSigner<ToBTCLNSwap<T[ChainIdentifier]>>>;
    /**
     * Creates Bitcoin -> Smart chain ({@link SwapType.SPV_VAULT_FROM_BTC}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCSwapNew(tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any>, options?: SpvFromBTCOptions): Promise<SwapWithSigner<SpvFromBTCSwap<T[ChainIdentifier]>>>;
    /**
     * Creates LEGACY Bitcoin -> Smart chain ({@link SwapType.FROM_BTC}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCSwap(tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any>, options?: FromBTCOptions): Promise<SwapWithSigner<FromBTCSwap<T[ChainIdentifier]>>>;
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwap(tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any>, options?: FromBTCLNOptions): Promise<SwapWithSigner<FromBTCLNSwap<T[ChainIdentifier]>>>;
    /**
     * Creates LEGACY Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     */
    createFromBTCLNSwapViaLNURL(tokenAddress: string, lnurl: string | LNURLWithdraw, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any>): Promise<SwapWithSigner<FromBTCLNSwap<T[ChainIdentifier]>>>;
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap
     *
     * @param tokenAddress Token address to receive
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwapNew(tokenAddress: string, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any>, options?: FromBTCLNAutoOptions): Promise<SwapWithSigner<FromBTCLNAutoSwap<T[ChainIdentifier]>>>;
    /**
     * Creates Bitcoin Lightning -> Smart chain ({@link SwapType.FROM_BTCLN_AUTO}) swap, withdrawing from
     *  an LNURL-withdraw link
     *
     * @param tokenAddress Token address to receive
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amount Amount to send in satoshis (if `exactOut=false`) or receive in token based units (if `exactOut=true`)
     * @param exactOut Whether to use a exact out instead of exact in
     * @param additionalParams Additional parameters sent to the LP when creating the swap
     * @param options Additional options for the swap
     */
    createFromBTCLNSwapNewViaLNURL(tokenAddress: string, lnurl: string | LNURLWithdraw, amount: bigint, exactOut?: boolean, additionalParams?: Record<string, any>, options?: FromBTCLNAutoOptions): Promise<SwapWithSigner<FromBTCLNAutoSwap<T[ChainIdentifier]>>>;
    /**
     * Creates a trusted Bitcoin Lightning -> Smart chain ({@link SwapType.TRUSTED_FROM_BTCLN}) gas swap
     *
     * @param amount Amount of native token to receive, in base units
     * @param trustedIntermediaryOrUrl  URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    createTrustedLNForGasSwap(amount: bigint, trustedIntermediaryOrUrl?: Intermediary | string): Promise<LnForGasSwap<T[ChainIdentifier]>>;
    /**
     * Creates a trusted Bitcoin -> Smart chain ({@link SwapType.TRUSTED_FROM_BTC}) gas swap
     *
     * @param amount Amount of native token to receive, in base units
     * @param refundAddress Bitcoin refund address, in case the swap fails the funds are refunded here
     * @param trustedIntermediaryOrUrl URL or Intermediary object of the trusted intermediary to use, otherwise uses default
     * @throws {Error} If no trusted intermediary specified
     */
    createTrustedOnchainForGasSwap(amount: bigint, refundAddress?: string, trustedIntermediaryOrUrl?: Intermediary | string): Promise<OnchainForGasSwap<T[ChainIdentifier]>>;
    /**
     * @internal
     */
    create(srcToken: BtcToken<true>, dstToken: SCToken<ChainIdentifier>, amount: bigint, exactIn: boolean, lnurlWithdraw?: string | LNURLWithdraw): Promise<(SupportsSwapType<T[ChainIdentifier], SwapType.FROM_BTCLN_AUTO> extends true ? FromBTCLNAutoSwap<T[ChainIdentifier]> : FromBTCLNSwap<T[ChainIdentifier]>)>;
    /**
     * @internal
     */
    create(srcToken: BtcToken<false>, dstToken: SCToken<ChainIdentifier>, amount: bigint, exactIn: boolean): Promise<(SupportsSwapType<T[ChainIdentifier], SwapType.SPV_VAULT_FROM_BTC> extends true ? SpvFromBTCSwap<T[ChainIdentifier]> : FromBTCSwap<T[ChainIdentifier]>)>;
    /**
     * @internal
     */
    create(srcToken: SCToken<ChainIdentifier>, dstToken: BtcToken<false>, amount: bigint, exactIn: boolean, address: string): Promise<ToBTCSwap<T[ChainIdentifier]>>;
    /**
     * @internal
     */
    create(srcToken: SCToken<ChainIdentifier>, dstToken: BtcToken<true>, amount: bigint, exactIn: boolean, lnurlPay: string | LNURLPay): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Creates a swap from srcToken to dstToken, of a specific token amount, either specifying input amount (exactIn=true)
     *  or output amount (exactIn=false), NOTE: For regular -> BTC-LN (lightning) swaps the passed amount is ignored and
     *  invoice's pre-set amount is used instead.
     *
     * @param srcToken Source token of the swap, user pays this token
     * @param dstToken Destination token of the swap, user receives this token
     * @param amount Amount of the swap
     * @param exactIn Whether the amount specified is an input amount (exactIn=true) or an output amount (exactIn=false)
     * @param addressLnurlLightningInvoice Bitcoin on-chain address, lightning invoice, LNURL-pay to pay or
     *  LNURL-withdrawal to withdraw money from
     */
    create(srcToken: SCToken<ChainIdentifier>, dstToken: BtcToken<true>, amount: undefined, exactIn: false, addressLnurlLightningInvoice: string): Promise<ToBTCLNSwap<T[ChainIdentifier]>>;
    /**
     * Returns swaps that are in-progress and are claimable for the specific chain, optionally also for a specific signer's address
     */
    getAllSwaps(): Promise<ISwap<T[ChainIdentifier]>[]>;
    /**
     * Returns swaps that are in-progress and are claimable for the specific chain, optionally also for a specific signer's address
     */
    getActionableSwaps(): Promise<ISwap<T[ChainIdentifier]>[]>;
    /**
     * Returns swaps that are refundable for the specific chain, optionally also for a specific signer's address
     */
    getRefundableSwaps(): Promise<IToBTCSwap<T[ChainIdentifier]>[]>;
    /**
     * Returns swap with a specific id (identifier) on a specific chain and optionally with a signer
     */
    getSwapById(id: string): Promise<ISwap<T[ChainIdentifier]>>;
    /**
     * Returns the swap with a proper return type, or `undefined` if not found or has wrong type
     *
     * @param id An ID of the swap ({@link ISwap.getId})
     * @param swapType Type of the swap
     */
    getTypedSwapById<S extends SwapType>(id: string, swapType: S): Promise<SwapTypeMapping<T[ChainIdentifier]>[S] | undefined>;
    /**
     * Synchronizes swaps from chain, this is usually ran when SDK is initialized, deletes expired quotes
     */
    _syncSwaps(): Promise<void>;
    /**
     * Recovers swaps from on-chain historical data.
     *
     * Please note that the recovered swaps might not be complete (i.e. missing amounts or addresses), as some
     *  of the swap data is purely off-chain and can never be recovered purely from on-chain data. This
     *  functions tries to recover as much swap data as possible.
     *
     * @param startBlockheight Optional starting blockheight for swap data recovery, will only check swaps
     *  initiated after this blockheight
     */
    recoverSwaps(startBlockheight?: number): Promise<ISwap<T[ChainIdentifier]>[]>;
    /**
     * Returns the {@link Token} object for a given token
     *
     * @param tickerOrAddress Token to return the object for, can use multiple formats:
     *  - a) token ticker, such as `"BTC"`, `"SOL"`, etc.
     *  - b) token ticker prefixed with smart chain identifier, such as `"SOLANA-SOL"`, `"SOLANA-USDC"`, etc.
     *  - c) token address
     */
    getToken(tickerOrAddress: string): Token<ChainIdentifier>;
    /**
     * Returns whether the SDK supports a given swap type on this chain based on currently known LPs
     *
     * @param swapType Swap protocol type
     */
    supportsSwapType<Type extends SwapType>(swapType: Type): SupportsSwapType<T[ChainIdentifier], Type>;
    /**
     * @internal
     */
    getSwapType(srcToken: BtcToken<true>, dstToken: SCToken<ChainIdentifier>): (SupportsSwapType<T[ChainIdentifier], SwapType.FROM_BTCLN_AUTO> extends true ? SwapType.FROM_BTCLN_AUTO : SwapType.FROM_BTCLN);
    /**
     * @internal
     */
    getSwapType(srcToken: BtcToken<false>, dstToken: SCToken<ChainIdentifier>): (SupportsSwapType<T[ChainIdentifier], SwapType.SPV_VAULT_FROM_BTC> extends true ? SwapType.SPV_VAULT_FROM_BTC : SwapType.FROM_BTC);
    /**
     * @internal
     */
    getSwapType(srcToken: SCToken<ChainIdentifier>, dstToken: BtcToken<false>): SwapType.TO_BTC;
    /**
     * @internal
     */
    getSwapType(srcToken: SCToken<ChainIdentifier>, dstToken: BtcToken<true>): SwapType.TO_BTCLN;
    /**
     * Returns type of the swap based on input and output tokens specified
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapType(srcToken: Token<ChainIdentifier>, dstToken: Token<ChainIdentifier>): SwapType.FROM_BTCLN_AUTO | SwapType.FROM_BTCLN | SwapType.SPV_VAULT_FROM_BTC | SwapType.FROM_BTC | SwapType.TO_BTC | SwapType.TO_BTCLN;
    /**
     * Returns minimum/maximum limits for inputs and outputs for a swap between given tokens
     *
     * @param srcToken Source token
     * @param dstToken Destination token
     */
    getSwapLimits<A extends Token<ChainIdentifier>, B extends Token<ChainIdentifier>>(srcToken: A, dstToken: B): {
        input: {
            min: TokenAmount<A>;
            max?: TokenAmount<A>;
        };
        output: {
            min: TokenAmount<B>;
            max?: TokenAmount<B>;
        };
    };
    /**
     * Returns tokens that you can swap to (if input=true) from a given token,
     *  or tokens that you can swap from (if input=false) to a given token
     */
    getSwapCounterTokens(token: Token, input: boolean): Token<ChainIdentifier>[];
}
