import {IFromBTCWrapper} from "../IFromBTCWrapper";
import {FromBTCSwap, FromBTCSwapInit, FromBTCSwapState} from "./FromBTCSwap";
import {
    ChainSwapType,
    ChainType,
    ClaimEvent,
    InitializeEvent,
    RefundEvent,
    RelaySynchronizer,
    SwapData,
    BtcRelay, BitcoinRpcWithAddressIndex, SwapCommitState
} from "@atomiqlabs/base";
import {EventEmitter} from "events";
import {Intermediary} from "../../../../intermediaries/Intermediary";
import {ISwapPrice} from "../../../../prices/abstract/ISwapPrice";
import {ISwapWrapperOptions, WrapperCtorTokens} from "../../../ISwapWrapper";
import {Buffer} from "buffer";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {SwapType} from "../../../../enums/SwapType";
import {
    extendAbortController,
    randomBytes,
    throwIfUndefined
} from "../../../../utils/Utils";
import { toOutputScript} from "../../../../utils/BitcoinUtils";
import {FromBTCResponseType, IntermediaryAPI} from "../../../../intermediaries/apis/IntermediaryAPI";
import {RequestError} from "../../../../errors/RequestError";
import {BTC_NETWORK, TEST_NETWORK} from "@scure/btc-signer/utils";
import {UnifiedSwapEventListener} from "../../../../events/UnifiedSwapEventListener";
import {UnifiedSwapStorage} from "../../../../storage/UnifiedSwapStorage";
import {ISwap} from "../../../ISwap";
import {IClaimableSwapWrapper} from "../../../IClaimableSwapWrapper";
import {IFromBTCSelfInitDefinition} from "../IFromBTCSelfInitSwap";
import {AmountData} from "../../../../types/AmountData";
import {tryWithRetries} from "../../../../utils/RetryUtils";
import {AllOptional, AllRequired} from "../../../../utils/TypeUtils";

export type FromBTCOptions = {
    feeSafetyFactor?: bigint,
    blockSafetyFactor?: number,
    unsafeZeroWatchtowerFee?: boolean
};

export type FromBTCWrapperOptions = ISwapWrapperOptions & {
    safetyFactor: number,
    blocksTillTxConfirms: number,
    maxConfirmations: number,
    minSendWindow: number,
    bitcoinNetwork: BTC_NETWORK,
    bitcoinBlocktime: number
};

export type FromBTCDefinition<T extends ChainType> = IFromBTCSelfInitDefinition<T, FromBTCWrapper<T>, FromBTCSwap<T>>;

/**
 * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation
 *  of the swap escrow on the destination chain.
 *
 * @category Swaps
 */
export class FromBTCWrapper<
    T extends ChainType
> extends IFromBTCWrapper<T, FromBTCDefinition<T>, FromBTCWrapperOptions> implements IClaimableSwapWrapper<FromBTCSwap<T>> {
    public readonly TYPE: SwapType.FROM_BTC = SwapType.FROM_BTC;

    /**
     * @internal
     */
    protected readonly tickSwapState = [FromBTCSwapState.PR_CREATED, FromBTCSwapState.CLAIM_COMMITED, FromBTCSwapState.EXPIRED];

    /**
     * @internal
     */
    readonly _pendingSwapStates = [
        FromBTCSwapState.PR_CREATED,
        FromBTCSwapState.QUOTE_SOFT_EXPIRED,
        FromBTCSwapState.CLAIM_COMMITED,
        FromBTCSwapState.BTC_TX_CONFIRMED,
        FromBTCSwapState.EXPIRED
    ];
    /**
     * @internal
     */
    readonly _claimableSwapStates = [FromBTCSwapState.BTC_TX_CONFIRMED];
    /**
     * @internal
     */
    readonly _swapDeserializer = FromBTCSwap;
    /**
     * @internal
     */
    readonly _synchronizer: RelaySynchronizer<any, T["TX"], any>;
    /**
     * @internal
     */
    readonly _btcRpc: BitcoinRpcWithAddressIndex<any>;

    private readonly btcRelay: BtcRelay<any, T["TX"], any>;

    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Pricing to use
     * @param tokens
     * @param swapDataDeserializer Deserializer for SwapData
     * @param btcRelay
     * @param synchronizer Btc relay synchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
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
        btcRelay: BtcRelay<any, T["TX"], any>,
        synchronizer: RelaySynchronizer<any, T["TX"], any>,
        btcRpc: BitcoinRpcWithAddressIndex<any>,
        options?: AllOptional<FromBTCWrapperOptions>,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(
            chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, swapDataDeserializer,
            {
                bitcoinNetwork: options?.bitcoinNetwork ?? TEST_NETWORK,
                safetyFactor: options?.safetyFactor ?? 2,
                blocksTillTxConfirms: options?.blocksTillTxConfirms ?? 12,
                maxConfirmations: options?.maxConfirmations ?? 6,
                minSendWindow: options?.minSendWindow ?? 30*60, //Minimum time window for user to send in the on-chain funds for From BTC swap
                bitcoinBlocktime: options?.bitcoinBlocktime ?? 10*60
            },
            events
        );
        this.btcRelay = btcRelay;
        this._synchronizer = synchronizer;
        this._btcRpc = btcRpc;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventInitialize(swap: FromBTCSwap<T>, event: InitializeEvent<T["Data"]>): Promise<boolean> {
        if(swap._state===FromBTCSwapState.PR_CREATED || swap._state===FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = FromBTCSwapState.CLAIM_COMMITED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected async processEventClaim(swap: FromBTCSwap<T>, event: ClaimEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==FromBTCSwapState.FAILED && swap._state!==FromBTCSwapState.CLAIM_CLAIMED) {
            await swap._setBitcoinTxId(Buffer.from(event.result, "hex").reverse().toString("hex")).catch(e => {
                this.logger.warn("processEventClaim(): Error setting bitcoin txId: ", e);
            });
            swap._state = FromBTCSwapState.CLAIM_CLAIMED;
            return true;
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected processEventRefund(swap: FromBTCSwap<T>, event: RefundEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==FromBTCSwapState.CLAIM_CLAIMED && swap._state!==FromBTCSwapState.FAILED) {
            swap._state = FromBTCSwapState.FAILED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    /**
     * Returns the swap expiry, leaving enough time for the user to send a transaction and for it to confirm
     *
     * @param data Swap data
     * @param requiredConfirmations Confirmations required on the bitcoin side to settle the swap
     *
     * @internal
     */
    _getOnchainSendTimeout(data: SwapData, requiredConfirmations: number): bigint {
        const tsDelta = (this._options.blocksTillTxConfirms + requiredConfirmations) * this._options.bitcoinBlocktime * this._options.safetyFactor;
        return data.getExpiry() - BigInt(tsDelta);
    }

    /**
     * Pre-fetches claimer (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param signer Smartchain signer address initiating the swap
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     *
     * @private
     */
    private async preFetchClaimerBounty(
        signer: string,
        amountData: AmountData,
        options: AllRequired<FromBTCOptions>,
        abortController: AbortController
    ): Promise<{
        feePerBlock: bigint,
        safetyFactor: number,
        startTimestamp: bigint,
        addBlock: number,
        addFee: bigint
    } | undefined> {
        const startTimestamp = BigInt(Math.floor(Date.now()/1000));

        if(options.unsafeZeroWatchtowerFee) {
            return {
                feePerBlock: 0n,
                safetyFactor: options.blockSafetyFactor,
                startTimestamp: startTimestamp,
                addBlock: 0,
                addFee: 0n
            }
        }

        const dummyAmount = BigInt(Math.floor(Math.random()* 0x1000000));
        const dummySwapData = await this._contract.createSwapData(
            ChainSwapType.CHAIN, signer, signer, amountData.token,
            dummyAmount, this._contract.getHashForOnchain(randomBytes(20), dummyAmount, 3).toString("hex"),
            this.getRandomSequence(), startTimestamp, false, true,
            BigInt(Math.floor(Math.random() * 0x10000)), BigInt(Math.floor(Math.random() * 0x10000))
        );

        try {
            const [feePerBlock, btcRelayData, currentBtcBlock, claimFeeRate] = await Promise.all([
                this.btcRelay.getFeePerBlock(),
                this.btcRelay.getTipData(),
                this._btcRpc.getTipHeight(),
                this._contract.getClaimFee(signer, dummySwapData)
            ]);

            if(btcRelayData==null) throw new Error("Btc relay not initialized!");

            const currentBtcRelayBlock = btcRelayData.blockheight;
            const addBlock = Math.max(currentBtcBlock-currentBtcRelayBlock, 0);
            return {
                feePerBlock: feePerBlock * options.feeSafetyFactor,
                safetyFactor: options.blockSafetyFactor,
                startTimestamp: startTimestamp,
                addBlock,
                addFee: claimFeeRate * options.feeSafetyFactor
            }
        } catch (e) {
            abortController.abort(e);
            return undefined;
        }
    }

    /**
     * Returns calculated claimer bounty calculated from the claimer bounty data as fetched from preFetchClaimerBounty()
     *
     * @param data Parsed swap data returned from the intermediary
     * @param options Options as passed to the swap creation function
     * @param claimerBounty Claimer bounty data as fetched from {@link preFetchClaimerBounty} function
     *
     * @private
     */
    private getClaimerBounty(
        data: T["Data"],
        options: AllRequired<FromBTCOptions>,
        claimerBounty: {
            feePerBlock: bigint,
            safetyFactor: number,
            startTimestamp: bigint,
            addBlock: number,
            addFee: bigint
        }
    ) : bigint {
        const tsDelta = data.getExpiry() - claimerBounty.startTimestamp;
        const blocksDelta = tsDelta / BigInt(this._options.bitcoinBlocktime) * BigInt(options.blockSafetyFactor);
        const totalBlock = blocksDelta + BigInt(claimerBounty.addBlock);
        return claimerBounty.addFee + (totalBlock * claimerBounty.feePerBlock);
    }

    /**
     * Verifies response returned from intermediary
     *
     * @param signer
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param data Parsed swap data returned by the intermediary
     * @param sequence Required swap sequence
     * @param claimerBounty Claimer bount data as returned from the preFetchClaimerBounty() pre-fetch promise
     * @param depositToken
     *
     * @throws {IntermediaryError} in case the response is invalid
     *
     * @private
     */
    private verifyReturnedData(
        signer: string,
        resp: FromBTCResponseType,
        amountData: AmountData,
        lp: Intermediary,
        options: AllRequired<FromBTCOptions>,
        data: T["Data"],
        sequence: bigint,
        claimerBounty: {
            feePerBlock: bigint,
            safetyFactor: number,
            startTimestamp: bigint,
            addBlock: number,
            addFee: bigint
        },
        depositToken: string
    ): void {
        if(amountData.exactIn) {
            if(resp.amount !== amountData.amount) throw new IntermediaryError("Invalid amount returned");
        } else {
            if(resp.total !== amountData.amount) throw new IntermediaryError("Invalid total returned");
        }

        const requiredConfirmations = resp.confirmations;
        if(requiredConfirmations>this._options.maxConfirmations) throw new IntermediaryError("Requires too many confirmations");

        const totalClaimerBounty = this.getClaimerBounty(data, options, claimerBounty);

        if(
            data.getClaimerBounty() !== totalClaimerBounty ||
            data.getType()!=ChainSwapType.CHAIN ||
            data.getSequence() !== sequence ||
            data.getAmount() !== resp.total ||
            data.isPayIn() ||
            !data.isToken(amountData.token) ||
            !data.isOfferer(lp.getAddress(this.chainIdentifier)) ||
            !data.isClaimer(signer) ||
            !data.isDepositToken(depositToken) ||
            data.hasSuccessAction()
        ) {
            throw new IntermediaryError("Invalid data returned");
        }

        //Check that we have enough time to send the TX and for it to confirm
        const expiry = this._getOnchainSendTimeout(data, requiredConfirmations);
        const currentTimestamp = BigInt(Math.floor(Date.now()/1000));
        if((expiry - currentTimestamp) < BigInt(this._options.minSendWindow)) {
            throw new IntermediaryError("Send window too low");
        }

        const lockingScript = toOutputScript(this._options.bitcoinNetwork, resp.btcAddress);
        const desiredExtraData = this._contract.getExtraData(lockingScript, resp.amount, requiredConfirmations);
        const desiredClaimHash = this._contract.getHashForOnchain(lockingScript, resp.amount, requiredConfirmations);
        if(!desiredClaimHash.equals(Buffer.from(data.getClaimHash(), "hex"))) {
            throw new IntermediaryError("Invalid claim hash returned!");
        }
        const extraData = data.getExtraData();
        if(extraData==null || !desiredExtraData.equals(Buffer.from(extraData, "hex"))) {
            throw new IntermediaryError("Invalid extra data returned!");
        }
    }

    /**
     * Returns a newly created legacy Bitcoin -> Smart chain swap using the PrTLC based escrow swap protocol,
     *  with the passed amount.
     *
     * @param recipient Smart chain signer's address on the destination chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    create(
        recipient: string,
        amountData: AmountData,
        lps: Intermediary[],
        options?: FromBTCOptions,
        additionalParams?: Record<string, any>,
        abortSignal?: AbortSignal
    ): {
        quote: Promise<FromBTCSwap<T>>,
        intermediary: Intermediary
    }[] {
        const _options: AllRequired<FromBTCOptions> = {
            blockSafetyFactor: options?.blockSafetyFactor ?? 1,
            feeSafetyFactor: options?.feeSafetyFactor ?? 2n,
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false
        };

        const sequence: bigint = this.getRandomSequence();

        const _abortController = extendAbortController(abortSignal);
        const pricePrefetchPromise: Promise<bigint | undefined> = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise: Promise<number | undefined> = this.preFetchUsdPrice(_abortController.signal);
        const claimerBountyPrefetchPromise = this.preFetchClaimerBounty(recipient, amountData, _options, _abortController);
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const feeRatePromise: Promise<string | undefined> = this.preFetchFeeRate(recipient, amountData, undefined, _abortController);
        const _signDataPromise: Promise<T["PreFetchVerification"] | undefined> | undefined = this._contract.preFetchBlockDataForSignatures==null ?
            this.preFetchSignData(Promise.resolve(true)) :
            undefined;

        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (async () => {
                    if(lp.services[SwapType.FROM_BTC]==null) throw new Error("LP service for processing from btc swaps not found!");

                    const abortController = extendAbortController(_abortController.signal);
                    const liquidityPromise: Promise<bigint | undefined> = this.preFetchIntermediaryLiquidity(amountData, lp, abortController);

                    try {
                        const {signDataPromise, resp} = await tryWithRetries(async(retryCount: number) => {
                            const {signDataPrefetch, response} = IntermediaryAPI.initFromBTC(
                                this.chainIdentifier, lp.url, nativeTokenAddress,
                                {
                                    claimer: recipient,
                                    amount: amountData.amount,
                                    token: amountData.token.toString(),

                                    exactOut: !amountData.exactIn,
                                    sequence,

                                    claimerBounty: throwIfUndefined(claimerBountyPrefetchPromise),
                                    feeRate: throwIfUndefined(feeRatePromise),
                                    additionalParams
                                },
                                this._options.postRequestTimeout, abortController.signal, retryCount>0 ? false : undefined
                            );

                            return {
                                signDataPromise: _signDataPromise ?? this.preFetchSignData(signDataPrefetch),
                                resp: await response
                            };
                        }, undefined, e => e instanceof RequestError, abortController.signal);

                        const data: T["Data"] = new this._swapDataDeserializer(resp.data);
                        data.setClaimer(recipient);

                        this.verifyReturnedData(recipient, resp, amountData, lp, _options, data, sequence, (await claimerBountyPrefetchPromise)!, nativeTokenAddress);
                        const [pricingInfo, signatureExpiry] = await Promise.all([
                            //Get intermediary's liquidity
                            this.verifyReturnedPrice(
                                lp.services[SwapType.FROM_BTC], false, resp.amount, resp.total,
                                amountData.token, {}, pricePrefetchPromise, usdPricePrefetchPromise, abortController.signal
                            ),
                            this.verifyReturnedSignature(recipient, data, resp, feeRatePromise, signDataPromise, abortController.signal),
                            this.verifyIntermediaryLiquidity(data.getAmount(), throwIfUndefined(liquidityPromise)),
                        ]);

                        const quote = new FromBTCSwap<T>(this, {
                            pricingInfo,
                            url: lp.url,
                            expiry: signatureExpiry,
                            swapFee: resp.swapFee,
                            swapFeeBtc: resp.swapFee * resp.amount / (data.getAmount() - resp.swapFee),
                            feeRate: (await feeRatePromise)!,
                            signatureData: resp,
                            data,
                            address: resp.btcAddress,
                            amount: resp.amount,
                            exactIn: amountData.exactIn ?? true,
                            requiredConfirmations: resp.confirmations
                        } as FromBTCSwapInit<T["Data"]>);
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
    ): Promise<FromBTCSwap<T> | null> {
        const data = init.data;

        const swapInit: FromBTCSwapInit<T["Data"]> = {
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
            feeRate: "",
            signatureData: undefined,
            data,
            exactIn: false
        }
        const swap = new FromBTCSwap(this, swapInit);
        swap._commitTxId = await init.getInitTxId();
        const blockData = await init.getTxBlock();
        swap.createdAt = blockData.blockTime * 1000;
        swap._setInitiated();
        swap._state = FromBTCSwapState.CLAIM_COMMITED;
        await swap._sync(false, false, state);
        await swap._save();
        return swap;
    }

}
