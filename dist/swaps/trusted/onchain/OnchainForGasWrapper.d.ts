/// <reference types="node" />
import { ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens } from "../../ISwapWrapper";
import { BitcoinRpcWithAddressIndex, ChainType } from "@atomiqlabs/base";
import { OnchainForGasSwap, OnchainForGasSwapState } from "./OnchainForGasSwap";
import { ISwapPrice } from "../../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { Intermediary } from "../../../intermediaries/Intermediary";
import { SwapType } from "../../../enums/SwapType";
import { UnifiedSwapEventListener } from "../../../events/UnifiedSwapEventListener";
import { UnifiedSwapStorage } from "../../../storage/UnifiedSwapStorage";
import { ISwap } from "../../ISwap";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
export type OnchainForGasWrapperOptions = ISwapWrapperOptions & {
    bitcoinNetwork: BTC_NETWORK;
};
export type OnchainForGasSwapTypeDefinition<T extends ChainType> = SwapTypeDefinition<T, OnchainForGasWrapper<T>, OnchainForGasSwap<T>>;
/**
 * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the
 *  destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare class OnchainForGasWrapper<T extends ChainType> extends ISwapWrapper<T, OnchainForGasSwapTypeDefinition<T>, OnchainForGasWrapperOptions> {
    readonly TYPE: SwapType.TRUSTED_FROM_BTC;
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof OnchainForGasSwap;
    /**
     * @internal
     */
    readonly _pendingSwapStates: OnchainForGasSwapState[];
    /**
     * @internal
     */
    protected readonly tickSwapState: undefined;
    /**
     * @internal
     */
    protected processEvent: undefined;
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpcWithAddressIndex<any>;
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param prices Pricing to use
     * @param tokens
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], prices: ISwapPrice, tokens: WrapperCtorTokens, btcRpc: BitcoinRpcWithAddressIndex<any>, options: OnchainForGasWrapperOptions, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * Returns a newly created trusted Bitcoin on-chain -> Smart chain swap, receiving
     *  the specified amount of native token on the destination chain.
     *
     * @param recipient Address of the recipient on the smart chain destination chain
     * @param amount Amount of native token to receive in base units
     * @param lpOrUrl Intermediary (LP) to use for the swap
     * @param refundAddress Bitcoin address to receive refund on in case the intermediary (LP) cannot execute the swap
     */
    create(recipient: string, amount: bigint, lpOrUrl: Intermediary | string, refundAddress?: string): Promise<OnchainForGasSwap<T>>;
}
