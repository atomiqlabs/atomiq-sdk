"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IEscrowSwapWrapper = void 0;
const ISwapWrapper_1 = require("../ISwapWrapper");
const base_1 = require("@atomiqlabs/base");
/**
 * Base class for wrappers of escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives)
 *
 * @category Swaps/Abstract
 */
class IEscrowSwapWrapper extends ISwapWrapper_1.ISwapWrapper {
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, versionedContracts, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, options, events);
        /**
         * @internal
         */
        this._contract = (version) => {
            const _version = version ?? "v1";
            const data = this._versionedContracts[_version];
            if (data == null)
                throw new Error(`Invalid contract version ${_version} requested`);
            return data.swapContract;
        };
        /**
         * @internal
         */
        this._swapDataDeserializer = (version) => {
            const _version = version ?? "v1";
            const data = this._versionedContracts[_version];
            if (data == null)
                throw new Error(`Invalid contract version ${_version} requested`);
            return data.swapDataConstructor;
        };
        //TODO: Properly populate in constructor
        this._versionedContracts = {};
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
    preFetchSignData(signDataPrefetch, contractVersion) {
        if (this._contract(contractVersion).preFetchForInitSignatureVerification == null) {
            // Catch promise rejections, should they happen
            signDataPrefetch.catch(() => { });
            return Promise.resolve(undefined);
        }
        return signDataPrefetch.then(obj => {
            if (obj == null)
                return undefined;
            return this._contract(contractVersion).preFetchForInitSignatureVerification(obj);
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
    async verifyReturnedSignature(initiator, data, signature, feeRatePromise, preFetchSignatureVerificationData, contractVersion, abortSignal) {
        const [feeRate, preFetchedSignatureData] = await Promise.all([feeRatePromise, preFetchSignatureVerificationData]);
        await this._contract(contractVersion).isValidInitAuthorization(initiator, data, signature, feeRate, preFetchedSignatureData);
        return await this._contract(contractVersion).getInitAuthorizationExpiry(data, signature, preFetchedSignatureData);
    }
    /**
     * Processes a single SC on-chain event
     * @param event
     * @param swap
     *
     * @internal
     */
    async processEvent(event, swap) {
        if (swap == null)
            return;
        let swapChanged = false;
        if (event instanceof base_1.InitializeEvent) {
            swapChanged = await this.processEventInitialize(swap, event);
            if (event.meta?.txId != null && swap._commitTxId !== event.meta.txId) {
                swap._commitTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if (event instanceof base_1.ClaimEvent) {
            swapChanged = await this.processEventClaim(swap, event);
            if (event.meta?.txId != null && swap._claimTxId !== event.meta.txId) {
                swap._claimTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if (event instanceof base_1.RefundEvent) {
            swapChanged = await this.processEventRefund(swap, event);
            if (event.meta?.txId != null && swap._refundTxId !== event.meta.txId) {
                swap._refundTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        this.logger.info("processEvents(): " + event.constructor.name + " processed for " + swap.getId() + " swap: ", swap);
        if (swapChanged) {
            await swap._saveAndEmit();
        }
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _checkPastSwaps(pastSwaps) {
        const changedSwaps = [];
        const removeSwaps = [];
        const swapExpiredStatus = {};
        const checkStatusSwaps = {};
        for (let pastSwap of pastSwaps) {
            if (pastSwap._shouldFetchExpiryStatus()) {
                //Check expiry
                swapExpiredStatus[pastSwap.getId()] = await pastSwap._verifyQuoteDefinitelyExpired();
            }
            if (pastSwap._shouldFetchOnchainState()) {
                //Add to swaps for which status should be checked
                if (pastSwap._data != null)
                    (checkStatusSwaps[pastSwap._contractVersion ?? "v1"] ??= []).push(pastSwap);
            }
        }
        for (let version in checkStatusSwaps) {
            if (this._versionedContracts[version] == null) {
                this.logger.warn(`_checkPastSwaps(): No contract was found for ${this.chainIdentifier} version ${version}! Skipping these swaps!`);
                continue;
            }
            const _checkStatusSwap = checkStatusSwaps[version];
            const swapStatuses = await this._contract(version).getCommitStatuses(_checkStatusSwap.map(val => ({
                signer: val._getInitiator(),
                swapData: val._data
            })));
            for (let pastSwap of _checkStatusSwap) {
                const escrowHash = pastSwap.getEscrowHash();
                const shouldSave = await pastSwap._sync(false, swapExpiredStatus[pastSwap.getId()], escrowHash == null ? undefined : swapStatuses[escrowHash]);
                if (shouldSave) {
                    if (pastSwap.isQuoteExpired()) {
                        removeSwaps.push(pastSwap);
                    }
                    else {
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
}
exports.IEscrowSwapWrapper = IEscrowSwapWrapper;
