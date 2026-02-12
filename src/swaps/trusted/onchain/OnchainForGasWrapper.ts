import {ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens} from "../../ISwapWrapper";
import {TrustedIntermediaryAPI} from "../../../intermediaries/apis/TrustedIntermediaryAPI";
import {IntermediaryError} from "../../../errors/IntermediaryError";
import {BitcoinRpcWithAddressIndex, ChainType} from "@atomiqlabs/base";
import {OnchainForGasSwap, OnchainForGasSwapInit, OnchainForGasSwapState} from "./OnchainForGasSwap";
import {ISwapPrice} from "../../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {Intermediary} from "../../../intermediaries/Intermediary";
import {SwapType} from "../../../enums/SwapType";
import {UnifiedSwapEventListener} from "../../../events/UnifiedSwapEventListener";
import {UnifiedSwapStorage} from "../../../storage/UnifiedSwapStorage";
import {ISwap} from "../../ISwap";
import {BTC_NETWORK} from "@scure/btc-signer/utils";

export type OnchainForGasWrapperOptions = ISwapWrapperOptions & {
    bitcoinNetwork: BTC_NETWORK
};

export type OnchainForGasSwapTypeDefinition<T extends ChainType> = SwapTypeDefinition<T, OnchainForGasWrapper<T>, OnchainForGasSwap<T>>;

/**
 * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the
 *  destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps
 */
export class OnchainForGasWrapper<T extends ChainType> extends ISwapWrapper<T, OnchainForGasSwapTypeDefinition<T>, OnchainForGasWrapperOptions> {
    public readonly TYPE: SwapType.TRUSTED_FROM_BTC = SwapType.TRUSTED_FROM_BTC;
    /**
     * @internal
     */
    readonly _swapDeserializer = OnchainForGasSwap;

    /**
     * @internal
     */
    readonly _pendingSwapStates = [OnchainForGasSwapState.PR_CREATED];
    /**
     * @internal
     */
    protected readonly tickSwapState = undefined;
    /**
     * @internal
     */
    protected processEvent = undefined;

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
    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        btcRpc: BitcoinRpcWithAddressIndex<any>,
        options: OnchainForGasWrapperOptions,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, events);
        this._btcRpc = btcRpc;
    }

    /**
     * Returns a newly created trusted Bitcoin on-chain -> Smart chain swap, receiving
     *  the specified amount of native token on the destination chain.
     *
     * @param recipient Address of the recipient on the smart chain destination chain
     * @param amount Amount of native token to receive in base units
     * @param lpOrUrl Intermediary (LP) to use for the swap
     * @param refundAddress Bitcoin address to receive refund on in case the intermediary (LP) cannot execute the swap
     */
    async create(recipient: string, amount: bigint, lpOrUrl: Intermediary | string, refundAddress?: string): Promise<OnchainForGasSwap<T>> {
        if(!this.isInitialized) throw new Error("Not initialized, call init() first!");

        const lpUrl = typeof(lpOrUrl)==="string" ? lpOrUrl : lpOrUrl.url;

        const token = this._chain.getNativeCurrencyAddress();

        const resp = await TrustedIntermediaryAPI.initTrustedFromBTC(this.chainIdentifier, lpUrl, {
            address: recipient,
            amount,
            refundAddress,
            token
        }, this._options.getRequestTimeout);

        if(resp.total !== amount) throw new IntermediaryError("Invalid total returned");

        const pricingInfo = await this.verifyReturnedPrice(
            typeof(lpOrUrl)==="string" || lpOrUrl.services[SwapType.TRUSTED_FROM_BTC]==null ?
                {swapFeePPM: 10000, swapBaseFee: 10} :
                lpOrUrl.services[SwapType.TRUSTED_FROM_BTC],
            false, resp.amountSats,
            amount, this._chain.getNativeCurrencyAddress(), {}
        );

        const quote = new OnchainForGasSwap(this, {
            paymentHash: resp.paymentHash,
            sequence: resp.sequence,
            address: resp.btcAddress,
            inputAmount: resp.amountSats,
            outputAmount: resp.total,
            recipient,
            refundAddress,
            pricingInfo,
            url: lpUrl,
            expiry: resp.expiresAt,
            swapFee: resp.swapFee,
            swapFeeBtc: resp.swapFeeSats,
            exactIn: false,
            token
        } as OnchainForGasSwapInit);
        await quote._save();
        return quote;
    }

}
