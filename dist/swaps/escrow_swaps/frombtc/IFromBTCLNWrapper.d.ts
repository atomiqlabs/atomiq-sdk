/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { ChainType, LightningNetworkApi, LNNodeLiquidity, SwapData } from "@atomiqlabs/base";
import { IFromBTCDefinition, IFromBTCWrapper } from "./IFromBTCWrapper";
import { ISwapWrapperOptions, WrapperCtorTokens } from "../../ISwapWrapper";
import { UnifiedSwapStorage } from "../../../storage/UnifiedSwapStorage";
import { UnifiedSwapEventListener } from "../../../events/UnifiedSwapEventListener";
import { ISwapPrice } from "../../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { Buffer } from "buffer";
import { Intermediary } from "../../../intermediaries/Intermediary";
import { PaymentRequestObject, TagsObject } from "@atomiqlabs/bolt11";
import { IEscrowSwap } from "../IEscrowSwap";
import { LNURLWithdrawParamsWithUrl } from "../../../types/lnurl/LNURLWithdraw";
export type IFromBTCLNDefinition<T extends ChainType, W extends IFromBTCLNWrapper<T, any>, S extends IEscrowSwap<T>> = IFromBTCDefinition<T, W, S>;
/**
 * Base class for wrappers of escrow-based Lightning -> Smart chain swaps
 *
 * @category Swaps
 */
export declare abstract class IFromBTCLNWrapper<T extends ChainType, D extends IFromBTCLNDefinition<T, IFromBTCLNWrapper<T, D>, IEscrowSwap<T, D>>, O extends ISwapWrapperOptions = ISwapWrapperOptions> extends IFromBTCWrapper<T, D, O> {
    /**
     * @internal
     */
    protected readonly lnApi: LightningNetworkApi;
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Swap pricing handler
     * @param tokens
     * @param swapDataDeserializer Deserializer for SwapData
     * @param lnApi
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], contract: T["Contract"], prices: ISwapPrice, tokens: WrapperCtorTokens, swapDataDeserializer: new (data: any) => T["Data"], lnApi: LightningNetworkApi, options: O, events?: EventEmitter<{
        swapState: [IEscrowSwap];
    }>);
    /**
     * Generates a new 32-byte secret to be used as pre-image for lightning network invoice & HTLC swap
     *
     * @returns Hash pre-image & payment hash
     *
     * @internal
     */
    protected getSecretAndHash(): {
        secret: Buffer;
        paymentHash: Buffer;
    };
    /**
     * Pre-fetches intermediary's LN node capacity, doesn't throw, instead returns null
     *
     * @param pubkeyPromise Promise that resolves when we receive "lnPublicKey" param from the intermediary through
     *  streaming
     *
     * @returns LN Node liquidity
     *
     * @internal
     */
    protected preFetchLnCapacity(pubkeyPromise: Promise<string | null>): Promise<LNNodeLiquidity | null>;
    /**
     * Verifies whether the intermediary's lightning node has enough inbound capacity to receive the LN payment
     *
     * @param lp Intermediary
     * @param decodedPr Decoded bolt11 lightning network invoice
     * @param lnCapacityPrefetchPromise Pre-fetch for LN node capacity, preFetchLnCapacity()
     * @param abortSignal Abort signal
     *
     * @throws {IntermediaryError} if the lightning network node doesn't have enough inbound liquidity
     * @throws {Error} if the lightning network node's inbound liquidity might be enough, but the swap would
     *  deplete more than half of the liquidity
     *
     * @internal
     */
    protected verifyLnNodeCapacity(lp: Intermediary, decodedPr: PaymentRequestObject & {
        tagsObject: TagsObject;
    }, lnCapacityPrefetchPromise?: Promise<LNNodeLiquidity | null>, abortSignal?: AbortSignal): Promise<void>;
    /**
     * Parses and fetches lnurl withdraw params from the specified lnurl
     *
     * @param lnurl LNURL to be parsed and fetched
     * @param abortSignal Abort signal
     *
     * @throws {UserError} if the LNURL is invalid or if it's not a LNURL-withdraw
     *
     * @internal
     */
    protected getLNURLWithdraw(lnurl: string | LNURLWithdrawParamsWithUrl, abortSignal: AbortSignal): Promise<LNURLWithdrawParamsWithUrl>;
    /**
     * Returns the swap expiry, leaving enough time for the user to claim the HTLC
     *
     * @param data Parsed swap data
     *
     * @internal
     */
    _getHtlcTimeout(data: SwapData): bigint;
}
