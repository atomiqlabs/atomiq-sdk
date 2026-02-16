import {ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens} from "../ISwapWrapper";
import {
    ChainType,
    ClaimEvent,
    InitializeEvent,
    RefundEvent,
    SignatureData,
    SwapCommitState,
    SwapEvent
} from "@atomiqlabs/base";
import {ISwap} from "../ISwap";
import {UnifiedSwapStorage} from "../../storage/UnifiedSwapStorage";
import {UnifiedSwapEventListener} from "../../events/UnifiedSwapEventListener";
import {ISwapPrice} from "../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {SwapType} from "../../enums/SwapType";
import {IEscrowSwap} from "./IEscrowSwap";
import {Intermediary} from "../../intermediaries/Intermediary";

export type IEscrowSwapDefinition<T extends ChainType, W extends IEscrowSwapWrapper<T, any>, S extends IEscrowSwap<T>> = SwapTypeDefinition<T, W, S>;

/**
 * Base class for wrappers of escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps
 */
export abstract class IEscrowSwapWrapper<
    T extends ChainType,
    D extends IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSwap<T, D>>,
    O extends ISwapWrapperOptions = ISwapWrapperOptions
> extends ISwapWrapper<T, D, O> {
    readonly abstract TYPE: SwapType;

    /**
     * @internal
     */
    readonly _contract: T["Contract"];
    /**
     * @internal
     */
    readonly _swapDataDeserializer: new (data: any) => T["Data"];

    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        contract: T["Contract"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        swapDataDeserializer: new (data: any) => T["Data"],
        options: O,
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, events);
        this._swapDataDeserializer = swapDataDeserializer;
        this._contract = contract;
    }

    /**
     * Pre-fetches signature verification data from the server's pre-sent promise, doesn't throw, instead returns null
     *
     * @param signDataPrefetch Promise that resolves when we receive "signDataPrefetch" from the LP in streaming mode
     * @returns Pre-fetched signature verification data or null if failed
     *
     * @internal
     */
    protected preFetchSignData(signDataPrefetch: Promise<any | null>): Promise<T["PreFetchVerification"] | undefined> {
        if(this._contract.preFetchForInitSignatureVerification==null) return Promise.resolve(undefined);
        return signDataPrefetch.then(obj => {
            if(obj==null) return undefined;
            return this._contract.preFetchForInitSignatureVerification!(obj);
        }).catch(e => {
            this.logger.error("preFetchSignData(): Error: ", e);
        });
    }

    /**
     * Verifies swap initialization signature returned by the intermediary
     *
     * @param initiator A smart chain account initiating the swap
     * @param data Parsed swap data from the intermediary
     * @param signature Response of the intermediary
     * @param feeRatePromise Pre-fetched fee rate promise
     * @param preFetchSignatureVerificationData Pre-fetched signature verification data
     * @param abortSignal
     * @returns Swap initialization signature expiry
     * @throws {SignatureVerificationError} when swap init signature is invalid
     *
     * @internal
     */
    protected async verifyReturnedSignature(
        initiator: string,
        data: T["Data"],
        signature: SignatureData,
        feeRatePromise: Promise<any>,
        preFetchSignatureVerificationData: Promise<any>,
        abortSignal?: AbortSignal
    ): Promise<number> {
        const [feeRate, preFetchedSignatureData] = await Promise.all([feeRatePromise, preFetchSignatureVerificationData]);
        await this._contract.isValidInitAuthorization(initiator, data, signature, feeRate, preFetchedSignatureData);
        return await this._contract.getInitAuthorizationExpiry(data, signature, preFetchedSignatureData);
    }

    /**
     * Processes InitializeEvent for a given swap
     * @param swap
     * @param event
     * @returns Whether the swap was updated/changed
     *
     * @internal
     */
    protected abstract processEventInitialize(swap: D["Swap"], event: InitializeEvent<T["Data"]>): Promise<boolean>;

    /**
     * Processes ClaimEvent for a given swap
     * @param swap
     * @param event
     * @returns Whether the swap was updated/changed
     *
     * @internal
     */
    protected abstract processEventClaim(swap: D["Swap"], event: ClaimEvent<T["Data"]>): Promise<boolean>;

    /**
     * Processes RefundEvent for a given swap
     * @param swap
     * @param event
     * @returns Whether the swap was updated/changed
     *
     * @internal
     */
    protected abstract processEventRefund(swap: D["Swap"], event: RefundEvent<T["Data"]>): Promise<boolean>;

    /**
     * Processes a single SC on-chain event
     * @param event
     * @param swap
     *
     * @internal
     */
    protected async processEvent(event: SwapEvent<T["Data"]>, swap: D["Swap"]): Promise<void> {
        if(swap==null) return;

        let swapChanged: boolean = false;
        if(event instanceof InitializeEvent) {
            swapChanged = await this.processEventInitialize(swap, event);
            if(event.meta?.txId!=null && swap._commitTxId!==event.meta.txId) {
                swap._commitTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(event instanceof ClaimEvent) {
            swapChanged = await this.processEventClaim(swap, event);
            if(event.meta?.txId!=null && swap._claimTxId!==event.meta.txId) {
                swap._claimTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(event instanceof RefundEvent) {
            swapChanged = await this.processEventRefund(swap, event);
            if(event.meta?.txId!=null && swap._refundTxId!==event.meta.txId) {
                swap._refundTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }

        this.logger.info("processEvents(): "+event.constructor.name+" processed for "+swap.getId()+" swap: ", swap);

        if(swapChanged) {
            await swap._saveAndEmit();
        }
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected async _checkPastSwaps(pastSwaps: D["Swap"][]): Promise<{ changedSwaps: D["Swap"][]; removeSwaps: D["Swap"][] }> {
        const changedSwaps: D["Swap"][] = [];
        const removeSwaps: D["Swap"][] = [];

        const swapExpiredStatus: {[id: string]: boolean} = {};

        const checkStatusSwaps: (D["Swap"] & {_data: T["Data"]})[] = [];

        for(let pastSwap of pastSwaps) {
            if(pastSwap._shouldFetchExpiryStatus()) {
                //Check expiry
                swapExpiredStatus[pastSwap.getId()] = await pastSwap._verifyQuoteDefinitelyExpired();
            }
            if(pastSwap._shouldFetchOnchainState()) {
                //Add to swaps for which status should be checked
                if(pastSwap._data!=null) checkStatusSwaps.push(pastSwap as (D["Swap"] & {_data: T["Data"]}));
            }
        }

        const swapStatuses = await this._contract.getCommitStatuses(checkStatusSwaps.map(val => ({signer: val._getInitiator(), swapData: val._data})));

        for(let pastSwap of checkStatusSwaps) {
            const escrowHash = pastSwap.getEscrowHash();
            const shouldSave = await pastSwap._sync(
                false,
                swapExpiredStatus[pastSwap.getId()],
                escrowHash==null ? undefined : swapStatuses[escrowHash]
            );
            if(shouldSave) {
                if(pastSwap.isQuoteExpired()) {
                    removeSwaps.push(pastSwap);
                } else {
                    changedSwaps.push(pastSwap);
                }
            }
        }

        return {
            changedSwaps,
            removeSwaps
        };
    }

    /**
     * Recovers a swap from smart chain on-chain data, please note that not all values for the recovered
     *  swaps might be populated, as some data is purely off-chain and can never be recovered purely
     *  from on-chain data.
     *
     * @param init Swap escrow initialization transaction and swap data
     * @param state Current on-chain state of the swap
     * @param lp Intermediary (LP) used as a counterparty for the swap
     */
    public abstract recoverFromSwapDataAndState(
        init: {
            data: T["Data"],
            getInitTxId: () => Promise<string>,
            getTxBlock: () => Promise<{blockTime: number, blockHeight: number}>
        },
        state: SwapCommitState,
        lp?: Intermediary
    ): Promise<D["Swap"] | null>;

}