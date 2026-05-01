/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { ChainType, ClaimEvent, InitializeEvent, LightningNetworkApi, Messenger, RefundEvent, SwapCommitState } from "@atomiqlabs/base";
import { Intermediary } from "../../../../intermediaries/Intermediary";
import { Buffer } from "buffer";
import { SwapType } from "../../../../enums/SwapType";
import { ISwapPrice } from "../../../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { ISwapWrapperOptions, WrapperCtorTokens } from "../../../ISwapWrapper";
import { UnifiedSwapEventListener } from "../../../../events/UnifiedSwapEventListener";
import { UnifiedSwapStorage } from "../../../../storage/UnifiedSwapStorage";
import { ISwap } from "../../../ISwap";
import { FromBTCLNAutoSwap, FromBTCLNAutoSwapState } from "./FromBTCLNAutoSwap";
import { IFromBTCLNDefinition, IFromBTCLNWrapper } from "../IFromBTCLNWrapper";
import { IClaimableSwapWrapper } from "../../../IClaimableSwapWrapper";
import { AmountData } from "../../../../types/AmountData";
import { LNURLWithdrawParamsWithUrl } from "../../../../types/lnurl/LNURLWithdraw";
import { AllOptional } from "../../../../utils/TypeUtils";
export type FromBTCLNAutoOptions = {
    /**
     * Instead of letting the SDK generate the preimage/paymentHash pair internally you can pass your computed
     *  paymentHash here, this will create the swap with the provided payment hash. Note that swaps created this way
     *  won't settle automatically (as the SDK is missing the preimage). Once the HTLC towards the user is created in
     *  the {@link FromBTCLNAutoSwapState.CLAIM_COMMITED} state, you should pass the secret preimage manually in the
     *  {@link FromBTCLNAutoSwap.waitTillClaimed}, {@link FromBTCLNAutoSwap.claim} or {@link FromBTCLNAutoSwap.txsClaim}
     *  functions.
     *
     * Accepts both, a {@link Buffer} and a hexadecimal `string`
     */
    paymentHash?: Buffer | string;
    /**
     * Optional description to use for the swap lightning network invoice, keep the invoice length below 500 characters
     */
    description?: string;
    /**
     * Optional description hash to use for the lightning network invoice, useful when returning the invoice as part of
     *  an LNURL-pay service endpoint.
     *
     * Accepts both, a {@link Buffer} and a hexadecimal `string`
     */
    descriptionHash?: Buffer | string;
    /**
     * Optional additional native token to receive as an output of the swap (e.g. STRK on Starknet or cBTC on Citrea).
     *  When passed as a `bigint` it is specified in base units of the token and in `string` it is the human readable
     *  decimal format.
     */
    gasAmount?: bigint | string;
    /**
     * A flag to skip checking whether the lightning network node of the LP has enough channel liquidity to facilitate
     *  the swap.
     */
    unsafeSkipLnNodeCheck?: boolean;
    /**
     * A flag to attach 0 watchtower fee to the swap, this would make the settlement unattractive for the watchtowers
     *  and therefore automatic settlement for such swaps will not be possible, you will have to settle manually
     *  with {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} functions.
     */
    unsafeZeroWatchtowerFee?: boolean;
    /**
     * A safety factor to use when estimating the watchtower fee to attach to the swap (this has to cover the gas fee
     *  of watchtowers settling the swap). A higher multiple here would mean that a swap is more attractive for
     *  watchtowers to settle automatically.
     *
     * Uses a `1.25` multiple by default (i.e. the current network fee is multiplied by 1.25 and then used to estimate
     *  the settlement gas fee cost)
     */
    feeSafetyFactor?: number;
};
export type FromBTCLNAutoWrapperOptions = ISwapWrapperOptions & {
    safetyFactor: number;
    bitcoinBlocktime: number;
    unsafeSkipLnNodeCheck: boolean;
};
export type FromBTCLNAutoDefinition<T extends ChainType> = IFromBTCLNDefinition<T, FromBTCLNAutoWrapper<T>, FromBTCLNAutoSwap<T>>;
/**
 * New escrow based (HTLC) swaps for Bitcoin Lightning -> Smart chain swaps not requiring manual settlement on
 *  the destination by the user, and instead letting the LP initiate the escrow. Permissionless watchtower network
 *  handles the claiming of HTLC, with the swap secret broadcasted over Nostr. Also adds a possibility for the user
 *  to receive a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Lightning → Smart chain
 */
export declare class FromBTCLNAutoWrapper<T extends ChainType> extends IFromBTCLNWrapper<T, FromBTCLNAutoDefinition<T>, FromBTCLNAutoWrapperOptions> implements IClaimableSwapWrapper<FromBTCLNAutoSwap<T>> {
    readonly TYPE: SwapType.FROM_BTCLN_AUTO;
    /**
     * @internal
     */
    protected readonly tickSwapState: FromBTCLNAutoSwapState[];
    /**
     * @internal
     */
    readonly _pendingSwapStates: FromBTCLNAutoSwapState[];
    /**
     * @internal
     */
    readonly _claimableSwapStates: FromBTCLNAutoSwapState[];
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof FromBTCLNAutoSwap;
    /**
     * @internal
     */
    readonly _messenger: Messenger;
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param prices Swap pricing handler
     * @param tokens
     * @param versionedContracts
     * @param lnApi
     * @param messenger
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], prices: ISwapPrice, tokens: WrapperCtorTokens, versionedContracts: {
        [version: string]: {
            swapContract: T["Contract"];
            swapDataConstructor: new (data: any) => T["Data"];
        };
    }, lnApi: LightningNetworkApi, messenger: Messenger, options?: AllOptional<FromBTCLNAutoWrapperOptions>, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * @inheritDoc
     * @internal
     */
    protected processEventInitialize(swap: FromBTCLNAutoSwap<T>, event: InitializeEvent<T["Data"]>): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    protected processEventClaim(swap: FromBTCLNAutoSwap<T>, event: ClaimEvent<T["Data"]>): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    protected processEventRefund(swap: FromBTCLNAutoSwap<T>, event: RefundEvent<T["Data"]>): Promise<boolean>;
    /**
     * Pre-fetches claimer (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param signer Smartchain signer address initiating the swap
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     *
     * @param contractVersions
     * @private
     */
    private preFetchClaimerBounty;
    /**
     * Verifies response returned from intermediary
     *
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param decodedPr Decoded bolt11 lightning network invoice
     * @param paymentHash Expected payment hash of the bolt11 lightning network invoice
     * @param claimerBounty Claimer bounty as request by the user
     *
     * @throws {IntermediaryError} in case the response is invalid
     *
     * @private
     */
    private verifyReturnedData;
    /**
     * Returns a newly created Lightning -> Smart chain swap using the HTLC based escrow swap protocol,
     *  where watchtowers handle the automatic settlement of the swap on the destination chain. Also allows
     *  specifying additional "gas drop" native token that the receipient receives on the destination chain
     *  in the `options` argument. The user has to pay a bolt11 invoice on the input lightning network side.
     *
     * @param recipient Recipient's address on the destination chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     * @param preFetches Optional pre-fetches for speeding up the quoting process (mainly used internally)
     */
    create(recipient: string, amountData: AmountData, lps: Intermediary[], options?: FromBTCLNAutoOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal, preFetches?: {
        pricePrefetchPromise: Promise<bigint | undefined>;
        usdPricePrefetchPromise: Promise<number | undefined>;
        claimerBountyPrefetch: {
            [contractVersion: string]: Promise<bigint | undefined>;
        };
        gasTokenPricePrefetchPromise?: Promise<bigint | undefined>;
    }): {
        quote: Promise<FromBTCLNAutoSwap<T>>;
        intermediary: Intermediary;
    }[];
    /**
     * Returns a newly created Lightning -> Smart chain swap using the HTLC based escrow swap protocol,
     *  where watchtowers handle the automatic settlement of the swap on the destination chain. Also allows
     *  specifying additional "gas drop" native token that the receipient receives on the destination chain
     *  in the `options` argument. The swap is created with an LNURL-withdraw link which will be used to pay
     *  the generated bolt11 invoice automatically when {@link FromBTCLNSwap.waitForPayment} is called on the
     *  swap.
     *
     * @param recipient Recipient's address on the destination chain
     * @param lnurl LNURL-withdraw link to pull the funds from
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    createViaLNURL(recipient: string, lnurl: string | LNURLWithdrawParamsWithUrl, amountData: AmountData, lps: Intermediary[], options?: FromBTCLNAutoOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): Promise<{
        quote: Promise<FromBTCLNAutoSwap<T>>;
        intermediary: Intermediary;
    }[]>;
    /**
     * @inheritDoc
     * @internal
     */
    protected _checkPastSwaps(pastSwaps: FromBTCLNAutoSwap<T>[]): Promise<{
        changedSwaps: FromBTCLNAutoSwap<T>[];
        removeSwaps: FromBTCLNAutoSwap<T>[];
    }>;
    /**
     * @inheritDoc
     */
    recoverFromSwapDataAndState(init: {
        data: T["Data"];
        getInitTxId: () => Promise<string>;
        getTxBlock: () => Promise<{
            blockTime: number;
            blockHeight: number;
        }>;
    }, state: SwapCommitState, contractVersion: string, lp?: Intermediary): Promise<FromBTCLNAutoSwap<T> | null>;
}
