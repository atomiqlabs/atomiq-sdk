"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MempoolBtcRelaySynchronizer = void 0;
const Logger_1 = require("../../../utils/Logger");
const TimeoutUtils_1 = require("../../../utils/TimeoutUtils");
const logger = (0, Logger_1.getLogger)("MempoolBtcRelaySynchronizer: ");
class MempoolBtcRelaySynchronizer {
    constructor(btcRelay, bitcoinRpc) {
        this.btcRelay = btcRelay;
        this.bitcoinRpc = bitcoinRpc;
    }
    async syncToLatestTxs(signer, feeRate) {
        const tipData = await this.btcRelay.getTipData();
        if (tipData == null)
            throw new Error("BtcRelay tip data not found - probably not initialized?");
        const latestKnownBlockLogData = await this.btcRelay.retrieveLatestKnownBlockLog();
        if (latestKnownBlockLogData == null)
            throw new Error("Failed to get latest known block log");
        const { resultStoredHeader, resultBitcoinHeader } = latestKnownBlockLogData;
        let cacheData = {
            forkId: resultStoredHeader.getBlockheight() < tipData.blockheight ? -1 : 0,
            lastStoredHeader: resultStoredHeader,
            computedCommitedHeaders: []
        };
        let spvTipBlockHeader = latestKnownBlockLogData.resultBitcoinHeader;
        logger.debug("Retrieved stored header with commitment: ", cacheData.lastStoredHeader);
        logger.debug("SPV tip bitcoin RPC block header: ", spvTipBlockHeader);
        let spvTipBlockHeight = spvTipBlockHeader.height;
        const txsList = [];
        const blockHeaderMap = {
            [resultBitcoinHeader.getHeight()]: resultBitcoinHeader
        };
        const computedHeaderMap = {
            [resultStoredHeader.getBlockheight()]: resultStoredHeader
        };
        let startForkId = undefined;
        let forkFee = feeRate;
        let mainFee = feeRate;
        const saveHeaders = async (headerCache) => {
            if (cacheData.forkId === -1) {
                if (mainFee == null)
                    mainFee = await this.btcRelay.getMainFeeRate(signer);
                cacheData = await this.btcRelay.saveNewForkHeaders(signer, headerCache, cacheData.lastStoredHeader, tipData.chainWork, mainFee);
            }
            else if (cacheData.forkId === 0) {
                if (mainFee == null)
                    mainFee = await this.btcRelay.getMainFeeRate(signer);
                cacheData = await this.btcRelay.saveMainHeaders(signer, headerCache, cacheData.lastStoredHeader, mainFee);
            }
            else {
                if (forkFee == null)
                    forkFee = await this.btcRelay.getForkFeeRate(signer, cacheData.forkId);
                cacheData = await this.btcRelay.saveForkHeaders(signer, headerCache, cacheData.lastStoredHeader, cacheData.forkId, tipData.chainWork, forkFee);
            }
            if (cacheData.forkId !== -1 && cacheData.forkId !== 0)
                startForkId = cacheData.forkId;
            txsList.push(cacheData.tx);
            for (let storedHeader of cacheData.computedCommitedHeaders) {
                computedHeaderMap[storedHeader.getBlockheight()] = storedHeader;
            }
        };
        let headerCache = [];
        while (true) {
            const retrievedHeaders = await this.bitcoinRpc.getPast15Blocks(spvTipBlockHeight + 15);
            let startIndex = retrievedHeaders.findIndex(val => val.height === spvTipBlockHeight);
            if (startIndex === -1)
                startIndex = retrievedHeaders.length; //Start from the last block
            for (let i = startIndex - 1; i >= 0; i--) {
                const header = retrievedHeaders[i];
                blockHeaderMap[header.height] = header;
                headerCache.push(header);
                if (cacheData.forkId === 0 ?
                    headerCache.length >= this.btcRelay.maxHeadersPerTx :
                    headerCache.length >= this.btcRelay.maxForkHeadersPerTx) {
                    await saveHeaders(headerCache);
                    headerCache = [];
                }
            }
            if (retrievedHeaders.length > 0) {
                if (spvTipBlockHeight === retrievedHeaders[0].height)
                    break; //Already at the tip
                spvTipBlockHeight = retrievedHeaders[0].height;
                await (0, TimeoutUtils_1.timeoutPromise)(1000);
            }
            else
                break;
        }
        if (headerCache.length > 0)
            await saveHeaders(headerCache);
        if (cacheData.forkId !== 0) {
            throw new Error("Unable to synchronize on-chain bitcoin light client! Not enough chainwork at connected RPC.");
        }
        return {
            txs: txsList,
            targetCommitedHeader: cacheData.lastStoredHeader,
            blockHeaderMap,
            computedHeaderMap,
            btcRelayTipCommitedHeader: resultStoredHeader,
            btcRelayTipBlockHeader: resultBitcoinHeader,
            latestBlockHeader: spvTipBlockHeader,
            startForkId
        };
    }
}
exports.MempoolBtcRelaySynchronizer = MempoolBtcRelaySynchronizer;
