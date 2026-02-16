/// <reference types="node" />
import { ToBTCLNSwap } from "./ToBTCLNSwap";
import { IToBTCDefinition, IToBTCWrapper } from "../IToBTCWrapper";
import { ChainType, SwapCommitState } from "@atomiqlabs/base";
import { Intermediary } from "../../../../intermediaries/Intermediary";
import { ISwapWrapperOptions, WrapperCtorTokens } from "../../../ISwapWrapper";
import { ISwapPrice } from "../../../../prices/abstract/ISwapPrice";
import { EventEmitter } from "events";
import { SwapType } from "../../../../enums/SwapType";
import { UnifiedSwapEventListener } from "../../../../events/UnifiedSwapEventListener";
import { UnifiedSwapStorage } from "../../../../storage/UnifiedSwapStorage";
import { ISwap } from "../../../ISwap";
import { AmountData } from "../../../../types/AmountData";
import { LNURLPayParamsWithUrl } from "../../../../types/lnurl/LNURLPay";
import { AllOptional } from "../../../../utils/TypeUtils";
import { LightningInvoiceCreateService } from "../../../../types/wallets/LightningInvoiceCreateService";
export type ToBTCLNOptions = {
    expirySeconds?: number;
    maxFee?: bigint | Promise<bigint>;
    expiryTimestamp?: bigint;
    maxRoutingPPM?: bigint;
    maxRoutingBaseFee?: bigint;
};
export type ToBTCLNWrapperOptions = ISwapWrapperOptions & {
    lightningBaseFee: number;
    lightningFeePPM: number;
    paymentTimeoutSeconds: number;
};
export type ToBTCLNDefinition<T extends ChainType> = IToBTCDefinition<T, ToBTCLNWrapper<T>, ToBTCLNSwap<T>>;
/**
 * Escrow based (HTLC) swap for Smart chains -> Bitcoin lightning
 *
 * @category Swaps
 */
export declare class ToBTCLNWrapper<T extends ChainType> extends IToBTCWrapper<T, ToBTCLNDefinition<T>, ToBTCLNWrapperOptions> {
    readonly TYPE: SwapType.TO_BTCLN;
    /**
     * @internal
     */
    readonly _swapDeserializer: typeof ToBTCLNSwap;
    constructor(chainIdentifier: string, unifiedStorage: UnifiedSwapStorage<T>, unifiedChainEvents: UnifiedSwapEventListener<T>, chain: T["ChainInterface"], contract: T["Contract"], prices: ISwapPrice, tokens: WrapperCtorTokens, swapDataDeserializer: new (data: any) => T["Data"], options?: AllOptional<ToBTCLNWrapperOptions>, events?: EventEmitter<{
        swapState: [ISwap];
    }>);
    private toRequiredSwapOptions;
    /**
     * Verifies whether a given payment hash was already paid by checking the local
     *  storage of known swaps
     *
     * @param paymentHash Payment hash to check
     *
     * @private
     */
    private checkPaymentHashWasPaid;
    /**
     * Calculates maximum lightning network routing fee based on amount
     *
     * @param amount BTC amount of the swap in satoshis
     * @param overrideBaseFee Override wrapper's default base fee
     * @param overrideFeePPM Override wrapper's default PPM
     *
     * @returns Maximum lightning routing fee in sats
     *
     * @private
     */
    private calculateFeeForAmount;
    /**
     * Verifies returned LP data
     *
     * @param signer
     * @param resp Response as returned by the LP
     * @param parsedPr Parsed bolt11 lightning invoice
     * @param token Smart chain token to be used in the swap
     * @param lp
     * @param options Swap options as passed to the swap create function
     * @param data Parsed swap data returned by the LP
     * @param requiredTotal Required total to be paid on the input (for exactIn swaps)
     *
     * @throws {IntermediaryError} In case the response is not valid
     *
     * @private
     */
    private verifyReturnedData;
    /**
     * Returns the quote/swap from a given intermediary
     *
     * @param signer Smartchain signer initiating the swap
     * @param amountData
     * @param lp Intermediary
     * @param pr bolt11 lightning network invoice
     * @param parsedPr Parsed bolt11 lightning network invoice
     * @param options Options as passed to the swap create function
     * @param preFetches
     * @param abort Abort signal or controller, if AbortController is passed it is used as-is, when AbortSignal is passed
     *  it is extended with extendAbortController and then used
     * @param additionalParams Additional params that should be sent to the LP
     *
     * @private
     */
    private getIntermediaryQuote;
    /**
     * Returns a newly created Smart chain -> Lightning swap using the HTLC based escrow swap protocol,
     *  the amount is parsed from the provided lightning network payment request (bolt11 invoice)
     *
     * @param signer Source chain signer address initiating the swap
     * @param recipient BOLT11 payment request (bitcoin lightning invoice) you wish to pay
     * @param amountData Token to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     * @param preFetches Optional existing pre-fetch promises for the swap (only used internally for LNURL swaps)
     */
    create(signer: string, recipient: string, amountData: Omit<AmountData, "amount">, lps: Intermediary[], options?: ToBTCLNOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal, preFetches?: {
        feeRatePromise: Promise<string | undefined>;
        pricePreFetchPromise: Promise<bigint | undefined>;
        usdPricePrefetchPromise: Promise<number | undefined>;
        signDataPrefetchPromise?: Promise<T["PreFetchVerification"] | undefined>;
    }): Promise<{
        quote: Promise<ToBTCLNSwap<T>>;
        intermediary: Intermediary;
    }[]>;
    /**
     * Parses and fetches lnurl pay params from the specified lnurl
     *
     * @param lnurl LNURL to be parsed and fetched
     * @param abortSignal Abort signal
     * @throws {UserError} if the LNURL is invalid or if it's not a LNURL-pay
     *
     * @private
     */
    private getLNURLPay;
    /**
     * Returns the quote/swap from the given LP
     *
     * @param signer Source chain signer address initiating the swap
     * @param amountData Token to swap
     * @param invoiceCreateService Service for creating fixed amount invoices
     * @param lp Intermediary (LPs) to get the quote from
     * @param dummyPr Dummy minimum value bolt11 lightning invoice returned from the LNURL-pay, used to estimate
     *  network fees for an actual invoice
     * @param options Optional additional quote options
     * @param preFetches Optional existing pre-fetch promises for the swap (only used internally for LNURL swaps)
     * @param abortSignal Abort signal
     * @param additionalParams Additional params to be sent to the intermediary
     *
     * @private
     */
    private getIntermediaryQuoteExactIn;
    /**
     * Returns a newly created Smart chain -> Lightning swap using the HTLC based escrow swap protocol via
     *  invoice creation service. This allows exactIn swaps by requesting the desired fixed amount lightning
     *  network invoice from the service.
     *
     * @param signer Source chain signer address initiating the swap
     * @param invoiceCreateServicePromise Service to request destination lightning network invoices from
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    createViaInvoiceCreateService(signer: string, invoiceCreateServicePromise: Promise<LightningInvoiceCreateService>, amountData: AmountData, lps: Intermediary[], options?: ToBTCLNOptions, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): Promise<{
        quote: Promise<ToBTCLNSwap<T>>;
        intermediary: Intermediary;
    }[]>;
    /**
     * Returns a newly created Smart chain -> Lightning swap using the HTLC based escrow swap protocol. Pays to
     *  an LNURL-pay link. This allows exactIn swaps by requesting the desired fixed amount lightning
     *  network invoice from the LNURL service.
     *
     * @param signer Source chain signer address initiating the swap
     * @param lnurl LNURL-pay link of the recipient
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    createViaLNURL(signer: string, lnurl: string | LNURLPayParamsWithUrl, amountData: AmountData, lps: Intermediary[], options?: ToBTCLNOptions & {
        comment?: string;
    }, additionalParams?: Record<string, any>, abortSignal?: AbortSignal): Promise<{
        quote: Promise<ToBTCLNSwap<T>>;
        intermediary: Intermediary;
    }[]>;
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
    }, state: SwapCommitState, lp?: Intermediary): Promise<ToBTCLNSwap<T> | null>;
}
