import {ISwapWrapper, ISwapWrapperOptions, SwapTypeDefinition, WrapperCtorTokens} from "../ISwapWrapper";
import {
    ChainType,
    ClaimEvent,
    InitializeEvent,
    RefundEvent,
    SignatureData,
    SignatureVerificationError, SwapCommitState, SwapEvent
} from "@atomiqlabs/base";
import {ISwap} from "../ISwap";
import {UnifiedSwapStorage} from "../../storage/UnifiedSwapStorage";
import {UnifiedSwapEventListener} from "../../events/UnifiedSwapEventListener";
import {ISwapPrice} from "../../prices/abstract/ISwapPrice";
import {EventEmitter} from "events";
import {SwapType} from "../../enums/SwapType";
import {IEscrowSwap} from "./IEscrowSwap";
import {Intermediary} from "../../intermediaries/Intermediary";
import {AmountData} from "../../types/AmountData";
import {tryWithRetries} from "../../utils/RetryUtils";

export type IEscrowSwapDefinition<T extends ChainType, W extends IEscrowSwapWrapper<T, any>, S extends IEscrowSwap<T>> = SwapTypeDefinition<T, W, S>;

export abstract class IEscrowSwapWrapper<
    T extends ChainType,
    D extends IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSwap<T, D>>,
    O extends ISwapWrapperOptions = ISwapWrapperOptions
> extends ISwapWrapper<T, D, O> {
    readonly abstract TYPE: SwapType;

    readonly contract: T["Contract"];
    readonly swapDataDeserializer: new (data: any) => T["Data"];

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
        this.swapDataDeserializer = swapDataDeserializer;
        this.contract = contract;
    }

    /**
     * Pre-fetches signature verification data from the server's pre-sent promise, doesn't throw, instead returns null
     *
     * @param signDataPrefetch Promise that resolves when we receive "signDataPrefetch" from the LP in streaming mode
     * @protected
     * @returns Pre-fetched signature verification data or null if failed
     */
    protected preFetchSignData(signDataPrefetch: Promise<any | null>): Promise<T["PreFetchVerification"] | undefined> {
        if(this.contract.preFetchForInitSignatureVerification==null) return Promise.resolve(undefined);
        return signDataPrefetch.then(obj => {
            if(obj==null) return undefined;
            return this.contract.preFetchForInitSignatureVerification!(obj);
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
     * @protected
     * @returns Swap initialization signature expiry
     * @throws {SignatureVerificationError} when swap init signature is invalid
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
        await tryWithRetries(
            () => this.contract.isValidInitAuthorization(initiator, data, signature, feeRate, preFetchedSignatureData),
            undefined,
            SignatureVerificationError,
            abortSignal
        );
        return await tryWithRetries(
            () => this.contract.getInitAuthorizationExpiry(data, signature, preFetchedSignatureData),
            undefined,
            SignatureVerificationError,
            abortSignal
        );
    }

    /**
     * Processes InitializeEvent for a given swap
     * @param swap
     * @param event
     * @protected
     * @returns Whether the swap was updated/changed
     */
    protected abstract processEventInitialize(swap: D["Swap"], event: InitializeEvent<T["Data"]>): Promise<boolean>;

    /**
     * Processes ClaimEvent for a given swap
     * @param swap
     * @param event
     * @protected
     * @returns Whether the swap was updated/changed
     */
    protected abstract processEventClaim(swap: D["Swap"], event: ClaimEvent<T["Data"]>): Promise<boolean>;

    /**
     * Processes RefundEvent for a given swap
     * @param swap
     * @param event
     * @protected
     * @returns Whether the swap was updated/changed
     */
    protected abstract processEventRefund(swap: D["Swap"], event: RefundEvent<T["Data"]>): Promise<boolean>;

    /**
     * Processes a single SC on-chain event
     * @private
     * @param event
     * @param swap
     */
    protected async processEvent(event: SwapEvent<T["Data"]>, swap: D["Swap"]): Promise<void> {
        if(swap==null) return;

        let swapChanged: boolean = false;
        if(event instanceof InitializeEvent) {
            swapChanged = await this.processEventInitialize(swap, event);
            if(event.meta?.txId!=null && swap.commitTxId!==event.meta.txId) {
                swap.commitTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(event instanceof ClaimEvent) {
            swapChanged = await this.processEventClaim(swap, event);
            if(event.meta?.txId!=null && swap.claimTxId!==event.meta.txId) {
                swap.claimTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if(event instanceof RefundEvent) {
            swapChanged = await this.processEventRefund(swap, event);
            if(event.meta?.txId!=null && swap.refundTxId!==event.meta.txId) {
                swap.refundTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }

        this.logger.info("processEvents(): "+event.constructor.name+" processed for "+swap.getId()+" swap: ", swap);

        if(swapChanged) {
            await swap._saveAndEmit();
        }
    }

    protected async _checkPastSwaps(pastSwaps: D["Swap"][]): Promise<{ changedSwaps: D["Swap"][]; removeSwaps: D["Swap"][] }> {
        const changedSwaps: D["Swap"][] = [];
        const removeSwaps: D["Swap"][] = [];

        const swapExpiredStatus: {[id: string]: boolean} = {};

        const checkStatusSwaps: (D["Swap"] & {data: T["Data"]})[] = [];

        for(let pastSwap of pastSwaps) {
            if(pastSwap._shouldFetchExpiryStatus()) {
                //Check expiry
                swapExpiredStatus[pastSwap.getId()] = await pastSwap._verifyQuoteDefinitelyExpired();
            }
            if(pastSwap._shouldFetchCommitStatus()) {
                //Add to swaps for which status should be checked
                if(pastSwap.data!=null) checkStatusSwaps.push(pastSwap as (D["Swap"] & {data: T["Data"]}));
            }
        }

        const swapStatuses = await this.contract.getCommitStatuses(checkStatusSwaps.map(val => ({signer: val._getInitiator(), swapData: val.data})));

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

    recoverFromSwapDataAndState(
        init: {data: T["Data"], getInitTxId: () => Promise<string>, getTxBlock: () => Promise<{blockTime: number, blockHeight: number}>},
        state: SwapCommitState,
        lp?: Intermediary
    ): Promise<D["Swap"] | null> {
        return Promise.resolve(null);
    }

}