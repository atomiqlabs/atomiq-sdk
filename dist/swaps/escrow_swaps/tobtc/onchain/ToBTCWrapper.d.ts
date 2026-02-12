/// <reference types="node" />
import { ToBTCSwap } from "./ToBTCSwap";
import { IToBTCDefinition, IToBTCWrapper } from "../IToBTCWrapper";
import { BitcoinRpc, ChainType, SwapCommitState } from "@atomiqlabs/base";
import { Intermediary } from "../../../../intermediaries/Intermediary";
import { ISwapPrice } from "../../../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { ISwapWrapperOptions, WrapperCtorTokens } from "../../../ISwapWrapper";
import { SwapType } from "../../../../enums/SwapType";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { UnifiedSwapEventListener } from "../../../../events/UnifiedSwapEventListener";
import { UnifiedSwapStorage } from "../../../../storage/UnifiedSwapStorage";
import { ISwap } from "../../../ISwap";
import { AmountData } from "../../../../types/AmountData";
import { AllOptional } from "../../../../utils/TypeUtils";
export type ToBTCOptions = {
    confirmationTarget?: number;
    confirmations?: number;
};
export type ToBTCWrapperOptions = ISwapWrapperOptions & {
    safetyFactor: number;
    maxConfirmations: number;
    bitcoinNetwork: BTC_NETWORK;
    bitcoinBlocktime: number;
    maxExpectedOnchainSendSafetyFactor: number;
    maxExpectedOnchainSendGracePeriodBlocks: number;
};
export type ToBTCDefinition<T extends ChainType> = IToBTCDefinition<T, ToBTCWrapper<T>, ToBTCSwap<T>>;
/**
 * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
 *
 * @category Swaps
 */
export declare class ToBTCWrapper<T extends ChainType> extends IToBTCWrapper<T, ToBTCDefinition<T>, ToBTCWrapperOptions> {
    readonly TYPE: SwapType.TO_BTC;
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof ToBTCSwap;
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpc<any>;
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents Smart chain on-chain event listener
     * @param chain
     * @param contract Chain specific swap contract
     * @param prices Swap pricing handler
     * @param tokens
     * @param swapDataDeserializer Deserializer for chain specific SwapData
     * @param btcRpc Bitcoin RPC api
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], contract: T["Contract"], prices: ISwapPrice, tokens: WrapperCtorTokens, swapDataDeserializer: new (data: any) => T["Data"], btcRpc: BitcoinRpc<any>, options?: AllOptional<ToBTCWrapperOptions>, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    /**
     * Returns randomly generated random bitcoin transaction nonce to be used for BTC on-chain swaps
     *
     * @returns Escrow nonce
     *
     * @private
     */
    private getRandomNonce;
    /**
     * Converts bitcoin address to its corresponding output script
     *
     * @param addr Bitcoin address to get the output script for
     *
     * @returns Output script as Buffer
     * @throws {UserError} if invalid address is specified
     *
     * @private
     */
    private btcAddressToOutputScript;
    /**
     * Verifies returned LP data
     *
     * @param signer
     * @param resp LP's response
     * @param amountData
     * @param lp
     * @param options Options as passed to the swap create function
     * @param data LP's returned parsed swap data
     * @param hash Payment hash of the swap
     *
     * @throws {IntermediaryError} if returned data are not correct
     *
     * @private
     */
    private verifyReturnedData;
    /**
     * Returns a newly created Smart chain -> Bitcoin swap using the PrTLC based escrow swap protocol,
     *  with the passed amount.
     *
     * @param signer Source chain signer address initiating the swap
     * @param recipient Recipient bitcoin on-chain address
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    create(signer: string, recipient: string, amountData: AmountData, lps: Intermediary[], options?: ToBTCOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): {
        quote: Promise<ToBTCSwap<T>>;
        intermediary: Intermediary;
    }[];
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
    }, state: SwapCommitState, lp?: Intermediary): Promise<ToBTCSwap<T> | null>;
}
