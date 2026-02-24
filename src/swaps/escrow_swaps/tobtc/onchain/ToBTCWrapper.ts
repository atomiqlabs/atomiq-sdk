import {ToBTCSwap, ToBTCSwapInit} from "./ToBTCSwap";
import {IToBTCDefinition, IToBTCWrapper} from "../IToBTCWrapper";
import {
    BigIntBufferUtils,
    BitcoinRpc,
    ChainSwapType,
    ChainType,
    SwapCommitState
} from "@atomiqlabs/base";
import {Intermediary, SingleChainReputationType} from "../../../../intermediaries/Intermediary";
import {ISwapPrice} from "../../../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {ISwapWrapperOptions, WrapperCtorTokens} from "../../../ISwapWrapper";
import {Buffer} from "buffer";
import {UserError} from "../../../../errors/UserError";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {SwapType} from "../../../../enums/SwapType";
import {extendAbortController, randomBytes, throwIfUndefined} from "../../../../utils/Utils";
import {toOutputScript} from "../../../../utils/BitcoinUtils";
import {IntermediaryAPI, ToBTCResponseType} from "../../../../intermediaries/apis/IntermediaryAPI";
import {RequestError} from "../../../../errors/RequestError";
import {BTC_NETWORK, TEST_NETWORK} from "@scure/btc-signer/utils";
import {UnifiedSwapEventListener} from "../../../../events/UnifiedSwapEventListener";
import {UnifiedSwapStorage} from "../../../../storage/UnifiedSwapStorage";
import {ISwap} from "../../../ISwap";
import {AmountData} from "../../../../types/AmountData";
import {tryWithRetries} from "../../../../utils/RetryUtils";
import {AllOptional, AllRequired} from "../../../../utils/TypeUtils";
import {ToBTCSwapState} from "../IToBTCSwap";

export type ToBTCOptions = {
    confirmationTarget?: number,
    confirmations?: number
}

export type ToBTCWrapperOptions = ISwapWrapperOptions & {
    safetyFactor: number,
    maxConfirmations: number,
    bitcoinNetwork: BTC_NETWORK,

    bitcoinBlocktime: number,

    maxExpectedOnchainSendSafetyFactor: number,
    maxExpectedOnchainSendGracePeriodBlocks: number,
};

export type ToBTCDefinition<T extends ChainType> = IToBTCDefinition<T, ToBTCWrapper<T>, ToBTCSwap<T>>;

/**
 * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export class ToBTCWrapper<T extends ChainType> extends IToBTCWrapper<T, ToBTCDefinition<T>, ToBTCWrapperOptions> {
    public readonly TYPE: SwapType.TO_BTC = SwapType.TO_BTC;
    /**
     * @internal
     */
    readonly _swapDeserializer = ToBTCSwap;
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
    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        contract: T["Contract"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        swapDataDeserializer: new (data: any) => T["Data"],
        btcRpc: BitcoinRpc<any>,
        options?: AllOptional<ToBTCWrapperOptions>,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(
            chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer,
            {
                bitcoinNetwork: options?.bitcoinNetwork ?? TEST_NETWORK,
                safetyFactor: options?.safetyFactor ?? 2,
                maxConfirmations: options?.maxConfirmations ?? 6,
                bitcoinBlocktime: options?.bitcoinBlocktime ?? (60*10),
                maxExpectedOnchainSendSafetyFactor: options?.maxExpectedOnchainSendSafetyFactor ?? 4,
                maxExpectedOnchainSendGracePeriodBlocks: options?.maxExpectedOnchainSendGracePeriodBlocks ?? 12,
            },
            events
        );
        this._btcRpc = btcRpc;
    }

    /**
     * Returns randomly generated random bitcoin transaction nonce to be used for BTC on-chain swaps
     *
     * @returns Escrow nonce
     *
     * @private
     */
    private getRandomNonce(): bigint {
        const firstPart = BigInt(Math.floor((Date.now()/1000)) - 700000000);

        return (firstPart << 24n) | BigIntBufferUtils.fromBuffer(randomBytes(3));
    }

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
    private btcAddressToOutputScript(addr: string): Buffer {
        try {
            return toOutputScript(this._options.bitcoinNetwork, addr);
        } catch (e) {
            throw new UserError("Invalid address specified");
        }
    }

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
    private verifyReturnedData(
        signer: string,
        resp: ToBTCResponseType,
        amountData: AmountData,
        lp: Intermediary,
        options: AllRequired<ToBTCOptions>,
        data: T["Data"],
        hash: string
    ): void {
        if(resp.totalFee !== (resp.swapFee + resp.networkFee)) throw new IntermediaryError("Invalid totalFee returned");

        if(amountData.exactIn) {
            if(resp.total !== amountData.amount) throw new IntermediaryError("Invalid total returned");
        } else {
            if(resp.amount !== amountData.amount) throw new IntermediaryError("Invalid amount returned");
        }

        const maxAllowedBlockDelta: bigint = BigInt(
            options.confirmations +
            options.confirmationTarget +
            this._options.maxExpectedOnchainSendGracePeriodBlocks
        );
        const maxAllowedExpiryDelta: bigint = maxAllowedBlockDelta
            * BigInt(this._options.maxExpectedOnchainSendSafetyFactor)
            * BigInt(this._options.bitcoinBlocktime);
        const currentTimestamp: bigint = BigInt(Math.floor(Date.now()/1000));
        const maxAllowedExpiryTimestamp: bigint = currentTimestamp + maxAllowedExpiryDelta;

        if(data.getExpiry() > maxAllowedExpiryTimestamp) {
            throw new IntermediaryError("Expiry time returned too high!");
        }

        if(
            data.getAmount() !== resp.total ||
            data.getClaimHash()!==hash ||
            data.getType()!==ChainSwapType.CHAIN_NONCED ||
            !data.isPayIn() ||
            !data.isToken(amountData.token) ||
            !data.isClaimer(lp.getAddress(this.chainIdentifier)) ||
            !data.isOfferer(signer) ||
            data.getTotalDeposit() !== 0n
        ) {
            throw new IntermediaryError("Invalid data returned");
        }
    }

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
    create(
        signer: string,
        recipient: string,
        amountData: AmountData,
        lps: Intermediary[],
        options?: ToBTCOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): {
        quote: Promise<ToBTCSwap<T>>,
        intermediary: Intermediary
    }[] {
        if(!this.isInitialized) throw new Error("Not initialized, call init() first!");
        const _options: AllRequired<ToBTCOptions> = {
            confirmationTarget: options?.confirmationTarget ?? 3,
            confirmations: options?.confirmations ?? 2
        };

        const nonce: bigint = this.getRandomNonce();
        const outputScript: Buffer = this.btcAddressToOutputScript(recipient);
        const _hash: string | undefined = !amountData.exactIn ?
            this._contract.getHashForOnchain(outputScript, amountData.amount, _options.confirmations, nonce).toString("hex") :
            undefined;

        const _abortController = extendAbortController(abortSignal);
        const pricePreFetchPromise: Promise<bigint | undefined> = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise: Promise<number | undefined> = this.preFetchUsdPrice(_abortController.signal);
        const feeRatePromise: Promise<string | undefined> = this.preFetchFeeRate(signer, amountData, _hash, _abortController);
        const _signDataPromise: Promise<T["PreFetchVerification"] | undefined> | undefined = this._contract.preFetchBlockDataForSignatures==null ?
            this.preFetchSignData(Promise.resolve(true)) :
            undefined;

        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if(lp.services[SwapType.TO_BTC]==null) throw new Error("LP service for processing to btc swaps not found!");

                    const abortController = extendAbortController(_abortController.signal);
                    const reputationPromise: Promise<SingleChainReputationType | undefined> = this.preFetchIntermediaryReputation(amountData, lp, abortController);

                    try {
                        const {signDataPromise, resp} = await tryWithRetries(async(retryCount) => {
                            const {signDataPrefetch, response} = IntermediaryAPI.initToBTC(this.chainIdentifier, lp.url, {
                                btcAddress: recipient,
                                amount: amountData.amount,
                                confirmationTarget: _options.confirmationTarget,
                                confirmations: _options.confirmations,
                                nonce: nonce,
                                token: amountData.token,
                                offerer: signer,
                                exactIn: amountData.exactIn,
                                feeRate: throwIfUndefined(feeRatePromise),
                                additionalParams
                            }, this._options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined);

                            return {
                                signDataPromise: _signDataPromise ?? this.preFetchSignData(signDataPrefetch),
                                resp: await response
                            };
                        }, undefined, RequestError, abortController.signal);

                        let hash: string = _hash ?? this._contract.getHashForOnchain(outputScript, resp.amount, _options.confirmations, nonce).toString("hex");

                        const data: T["Data"] = new this._swapDataDeserializer(resp.data);
                        data.setOfferer(signer);

                        this.verifyReturnedData(signer, resp, amountData, lp, _options, data, hash);
                        const [pricingInfo, signatureExpiry, reputation] = await Promise.all([
                            this.verifyReturnedPrice(
                                lp.services[SwapType.TO_BTC], true, resp.amount, data.getAmount(),
                                amountData.token, resp, pricePreFetchPromise, usdPricePrefetchPromise, abortController.signal
                            ),
                            this.verifyReturnedSignature(signer, data, resp, feeRatePromise, signDataPromise, abortController.signal),
                            reputationPromise
                        ]);
                        abortController.signal.throwIfAborted();

                        if(reputation!=null) lp.reputation[amountData.token.toString()] = reputation;

                        const inputWithoutFees = data.getAmount() - resp.swapFee - resp.networkFee;
                        const swapFeeBtc = resp.swapFee * resp.amount / inputWithoutFees;
                        const networkFeeBtc = resp.networkFee * resp.amount / inputWithoutFees

                        const quote = new ToBTCSwap<T>(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: signatureExpiry,
                            swapFee: resp.swapFee,
                            swapFeeBtc,
                            feeRate: (await feeRatePromise)!,
                            signatureData: resp,
                            data,
                            networkFee: resp.networkFee,
                            networkFeeBtc,
                            address: recipient,
                            amount: resp.amount,
                            confirmationTarget: _options.confirmationTarget,
                            satsPerVByte: Number(resp.satsPervByte),
                            exactIn: amountData.exactIn,
                            requiredConfirmations: _options.confirmations,
                            nonce
                        } as ToBTCSwapInit<T["Data"]>);
                        await quote._save();
                        return quote;
                    } catch (e) {
                        abortController.abort(e);
                        throw e;
                    }
                })()
            }
        });
    }

    /**
     * @inheritDoc
     */
    async recoverFromSwapDataAndState(
        init: {data: T["Data"], getInitTxId: () => Promise<string>, getTxBlock: () => Promise<{blockTime: number, blockHeight: number}>},
        state: SwapCommitState,
        lp?: Intermediary
    ): Promise<ToBTCSwap<T> | null> {
        const data = init.data;

        const swapInit: ToBTCSwapInit<T["Data"]> = {
            pricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100_000_000_000_000n,
                realPriceUSatPerToken: 100_000_000_000_000n,
                differencePPM: 0n,
                feePPM: 0n,
            },
            url: lp?.url,
            expiry: 0,
            swapFee: 0n,
            swapFeeBtc: 0n,
            confirmationTarget: 1,
            satsPerVByte: 0,
            feeRate: "",
            signatureData: undefined,
            nonce: data.getNonceHint() ?? undefined,
            requiredConfirmations: data.getConfirmationsHint() ?? undefined,
            data,
            networkFee: 0n,
            networkFeeBtc: 0n,
            exactIn: true
        };
        const swap = new ToBTCSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = ToBTCSwapState.COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }

}
