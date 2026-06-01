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
 * @category Swaps/Abstract
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
    readonly _contract: (version?: string) => T["Contract"] = (version?: string) => {
        const _version = version ?? "v1";
        const data = this._versionedContracts[_version];
        if(data==null) throw new Error(`Invalid contract version ${_version} requested`);
        return data.swapContract;
    };
    /**
     * @internal
     */
    readonly _swapDataDeserializer: (version?: string) => new (data: any) => T["Data"] = (version?: string) => {
        const _version = version ?? "v1";
        const data = this._versionedContracts[_version];
        if(data==null) throw new Error(`Invalid contract version ${_version} requested`);
        return data.swapDataConstructor;
    };

    //TODO: Properly populate in constructor
    readonly _versionedContracts: {
        [version: string]: {
            swapContract: T["Contract"],
            swapDataConstructor: new (data: any) => T["Data"]
        }
    } = {};

    constructor(
        chainIdentifier: string,
        unifiedStorage: UnifiedSwapStorage<T>,
        unifiedChainEvents: UnifiedSwapEventListener<T>,
        chain: T["ChainInterface"],
        prices: ISwapPrice,
        tokens: WrapperCtorTokens,
        options: O,
        versionedContracts: {
            [version: string]: {
                swapContract: T["Contract"],
                swapDataConstructor: new (data: any) => T["Data"]
            }
        },
        events?: EventEmitter<{swapState: [ISwap]}>
    ) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, events);
        this._versionedContracts = versionedContracts;
    }

    /**
     * Pre-fetches signature verification data from the server's pre-sent promise, doesn't throw, instead returns null
     *
     * @param signDataPrefetch Promise that resolves when we receive "signDataPrefetch" from the LP in streaming mode
     * @param contractVersion
     * @returns Pre-fetched signature verification data or null if failed
     *
     * @internal
     */
    protected preFetchSignData(signDataPrefetch: Promise<any | null>, contractVersion: string): Promise<T["PreFetchVerification"] | undefined> {
        if(this._contract(contractVersion).preFetchForInitSignatureVerification==null) {
            // Catch promise rejections, should they happen
            signDataPrefetch.catch(() => {});
            return Promise.resolve(undefined);
        }
        return signDataPrefetch.then(obj => {
            if(obj==null) return undefined;
            return this._contract(contractVersion).preFetchForInitSignatureVerification!(obj);
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
     * @param contractVersion
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
        contractVersion: string,
        abortSignal?: AbortSignal,
    ): Promise<number> {
        const [feeRate, preFetchedSignatureData] = await Promise.all([feeRatePromise, preFetchSignatureVerificationData]);
        await this._contract(contractVersion).isValidInitAuthorization(initiator, data, signature, feeRate, preFetchedSignatureData);
        return await this._contract(contractVersion).getInitAuthorizationExpiry(data, signature, preFetchedSignatureData);
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

        const checkStatusSwaps: {[contractVersion: string]: (D["Swap"] & {_data: T["Data"]})[]} = {};

        for(let pastSwap of pastSwaps) {
            if(pastSwap._shouldFetchExpiryStatus()) {
                //Check expiry
                swapExpiredStatus[pastSwap.getId()] = await pastSwap._verifyQuoteDefinitelyExpired();
            }
            if(pastSwap._shouldFetchOnchainState()) {
                //Add to swaps for which status should be checked
                if(pastSwap._data!=null) (checkStatusSwaps[pastSwap._contractVersion ?? "v1"] ??= []).push(pastSwap as (D["Swap"] & {_data: T["Data"]}));
            }
        }

        for(let version in checkStatusSwaps) {
            if(this._versionedContracts[version]==null) {
                this.logger.warn(`_checkPastSwaps(): No contract was found for ${this.chainIdentifier} version ${version}! Skipping these swaps!`);
                continue;
            }

            const _checkStatusSwap = checkStatusSwaps[version];
            const swapStatuses = await this._contract(version).getCommitStatuses(
                _checkStatusSwap.map(val => ({
                    signer: val._getInitiator(),
                    swapData: val._data
                }))
            );

            for(let pastSwap of _checkStatusSwap) {
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
        contractVersion: string,
        lp?: Intermediary
    ): Promise<D["Swap"] | null>;

}