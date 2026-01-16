"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntermediaryDiscovery = exports.SwapHandlerType = void 0;
const Intermediary_1 = require("./Intermediary");
const SwapType_1 = require("../enums/SwapType");
const events_1 = require("events");
const buffer_1 = require("buffer");
const Utils_1 = require("../utils/Utils");
const IntermediaryAPI_1 = require("./apis/IntermediaryAPI");
const Logger_1 = require("../utils/Logger");
const HttpUtils_1 = require("../http/HttpUtils");
const RetryUtils_1 = require("../utils/RetryUtils");
var SwapHandlerType;
(function (SwapHandlerType) {
    SwapHandlerType["TO_BTC"] = "TO_BTC";
    SwapHandlerType["FROM_BTC"] = "FROM_BTC";
    SwapHandlerType["TO_BTCLN"] = "TO_BTCLN";
    SwapHandlerType["FROM_BTCLN"] = "FROM_BTCLN";
    SwapHandlerType["FROM_BTC_TRUSTED"] = "FROM_BTC_TRUSTED";
    SwapHandlerType["FROM_BTCLN_TRUSTED"] = "FROM_BTCLN_TRUSTED";
    SwapHandlerType["FROM_BTC_SPV"] = "FROM_BTC_SPV";
    SwapHandlerType["FROM_BTCLN_AUTO"] = "FROM_BTCLN_AUTO";
})(SwapHandlerType = exports.SwapHandlerType || (exports.SwapHandlerType = {}));
/**
 * Converts SwapHandlerType (represented as string & used in REST API communication with intermediaries) to regular
 *  SwapType
 *
 * @param swapHandlerType
 */
function swapHandlerTypeToSwapType(swapHandlerType) {
    switch (swapHandlerType) {
        case SwapHandlerType.FROM_BTC:
            return SwapType_1.SwapType.FROM_BTC;
        case SwapHandlerType.TO_BTC:
            return SwapType_1.SwapType.TO_BTC;
        case SwapHandlerType.FROM_BTCLN:
            return SwapType_1.SwapType.FROM_BTCLN;
        case SwapHandlerType.TO_BTCLN:
            return SwapType_1.SwapType.TO_BTCLN;
        case SwapHandlerType.FROM_BTC_TRUSTED:
            return SwapType_1.SwapType.TRUSTED_FROM_BTC;
        case SwapHandlerType.FROM_BTCLN_TRUSTED:
            return SwapType_1.SwapType.TRUSTED_FROM_BTCLN;
        case SwapHandlerType.FROM_BTC_SPV:
            return SwapType_1.SwapType.SPV_VAULT_FROM_BTC;
        case SwapHandlerType.FROM_BTCLN_AUTO:
            return SwapType_1.SwapType.FROM_BTCLN_AUTO;
    }
}
/**
 * A default intermediary comparator, only takes to announced fee into consideration
 *
 * @param swapType
 * @param tokenAddress
 * @param swapAmount
 */
function getIntermediaryComparator(swapType, tokenAddress, swapAmount) {
    if (swapType === SwapType_1.SwapType.TO_BTC) {
        //TODO: Also take reputation into account
    }
    return (a, b) => {
        const aService = a.services[swapType];
        const bService = b.services[swapType];
        if (aService == null && bService == null)
            return 0;
        if (aService == null)
            return 1;
        if (bService == null)
            return -1;
        if (swapAmount == null) {
            return aService.swapFeePPM - bService.swapFeePPM;
        }
        else {
            const feeA = BigInt(aService.swapBaseFee) + (swapAmount * BigInt(aService.swapFeePPM) / 1000000n);
            const feeB = BigInt(bService.swapBaseFee) + (swapAmount * BigInt(bService.swapFeePPM) / 1000000n);
            return feeA - feeB > 0n ? 1 : feeA === feeB ? 0 : -1;
        }
    };
}
const logger = (0, Logger_1.getLogger)("IntermediaryDiscovery: ");
const REGISTRY_URL = "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main";
//To allow for legacy responses from not-yet updated LPs
const DEFAULT_CHAIN = "SOLANA";
class IntermediaryDiscovery extends events_1.EventEmitter {
    constructor(swapContracts, registryUrl = REGISTRY_URL, nodeUrls, httpRequestTimeout, maxWaitForOthersTimeout) {
        super();
        this.intermediaries = [];
        this.swapContracts = swapContracts;
        this.registryUrl = registryUrl;
        this.overrideNodeUrls = nodeUrls;
        this.httpRequestTimeout = httpRequestTimeout;
        this.maxWaitForOthersTimeout = maxWaitForOthersTimeout;
    }
    /**
     * Fetches the URLs of swap intermediaries from registry or from a pre-defined array of node urls
     *
     * @param abortSignal
     */
    async getIntermediaryUrls(abortSignal) {
        if (this.overrideNodeUrls != null && this.overrideNodeUrls.length > 0) {
            return this.overrideNodeUrls;
        }
        const response = await (0, RetryUtils_1.tryWithRetries)(() => (0, HttpUtils_1.httpGet)(this.registryUrl, this.httpRequestTimeout, abortSignal), { maxRetries: 3, delay: 100, exponential: true });
        const content = response.content.replace(new RegExp("\\n", "g"), "");
        return JSON.parse(buffer_1.Buffer.from(content, "base64").toString());
    }
    /**
     * Returns data as reported by a specific node (as identified by its URL). This function is specifically made
     *  in a way, that in case the abortSignal fires AFTER the LP response was received (and during signature checking),
     *  it proceeds with the addresses it was able to verify already. Hence after calling abort, this function is guaranteed
     *  to either reject or resolve instantly.
     *
     * @param url
     * @param abortSignal
     */
    async getNodeInfo(url, abortSignal) {
        const response = await (0, RetryUtils_1.tryWithRetries)(() => IntermediaryAPI_1.IntermediaryAPI.getIntermediaryInfo(url, this.httpRequestTimeout, abortSignal), { maxRetries: 3, delay: 100, exponential: true }, undefined, abortSignal);
        abortSignal?.throwIfAborted();
        const promises = [];
        const addresses = {};
        for (let chain in response.chains) {
            if (this.swapContracts[chain] != null) {
                promises.push((async () => {
                    const { signature, address } = response.chains[chain];
                    try {
                        await this.swapContracts[chain].isValidDataSignature(buffer_1.Buffer.from(response.envelope), signature, address);
                        addresses[chain] = address;
                    }
                    catch (e) {
                        logger.warn("Failed to verify " + chain + " signature for intermediary: " + url);
                    }
                })());
            }
        }
        if (abortSignal != null) {
            await Promise.race([
                Promise.all(promises),
                new Promise(resolve => abortSignal.addEventListener("abort", resolve))
            ]);
        }
        else {
            await Promise.all(promises);
        }
        //Handle legacy responses
        const info = JSON.parse(response.envelope);
        for (let swapType in info.services) {
            const serviceData = info.services[swapType];
            if (serviceData.chainTokens == null)
                serviceData.chainTokens = {
                    [DEFAULT_CHAIN]: serviceData.tokens
                };
            for (let chain in serviceData.chainTokens) {
                if (addresses[chain] == null)
                    delete serviceData.chainTokens[chain];
            }
        }
        return {
            addresses,
            info
        };
    }
    /**
     * Inherits abort signal logic from `getNodeInfo()`, check those function docs to better understand
     *
     * @param url
     * @param abortSignal
     * @private
     */
    async loadIntermediary(url, abortSignal) {
        try {
            const nodeInfo = await this.getNodeInfo(url, abortSignal);
            const services = {};
            for (let key in nodeInfo.info.services) {
                services[swapHandlerTypeToSwapType(key)] = nodeInfo.info.services[key];
            }
            return new Intermediary_1.Intermediary(url, nodeInfo.addresses, services);
        }
        catch (e) {
            logger.warn("fetchIntermediaries(): Error contacting intermediary " + url + ": ", e);
            return null;
        }
    }
    /**
     * Returns the intermediary at the provided URL, either from the already fetched list of LPs or fetches the data on-demand
     *
     * @param url
     * @param abortSignal
     */
    getIntermediary(url, abortSignal) {
        const foundLp = this.intermediaries.find(lp => lp.url === url);
        if (foundLp != null)
            return Promise.resolve(foundLp);
        return this.loadIntermediary(url, abortSignal);
    }
    /**
     * Reloads the saves a list of intermediaries
     * @param abortSignal
     */
    async reloadIntermediaries(abortSignal) {
        //Get LP urls
        const urls = await this.getIntermediaryUrls(abortSignal);
        logger.debug("reloadIntermediaries(): Pinging intermediaries: ", urls.join());
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        let timer;
        const intermediaries = await Promise.all(urls.map(url => this.loadIntermediary(url, abortController.signal).then(lp => {
            if (lp != null && timer == null)
                timer = setTimeout(() => {
                    //Trigger abort through the abort controller, such that all underlying promises resolve instantly
                    abortController.abort();
                }, this.maxWaitForOthersTimeout ?? 5 * 1000);
            return lp;
        })));
        if (timer != null)
            clearTimeout(timer);
        const activeNodes = intermediaries.filter(intermediary => intermediary != null);
        if (activeNodes.length === 0)
            logger.error("reloadIntermediaries(): No online intermediary found! Swaps might not be possible!");
        this.intermediaries = activeNodes;
        this.emit("added", activeNodes);
        logger.info("reloadIntermediaries(): Using active intermediaries: ", activeNodes.map(lp => lp.url).join());
    }
    /**
     * Initializes the discovery by fetching/reloading intermediaries
     *
     * @param abortSignal
     */
    init(abortSignal) {
        logger.info("init(): Initializing with registryUrl: " + this.registryUrl + " intermediary array: " + (this.overrideNodeUrls || []).join());
        return this.reloadIntermediaries(abortSignal);
    }
    getMultichainSwapBounds() {
        const bounds = {};
        this.intermediaries.forEach(intermediary => {
            for (let _swapType in intermediary.services) {
                const swapType = parseInt(_swapType);
                const swapService = intermediary.services[swapType];
                const multichainBounds = (bounds[swapType] ??= {});
                for (let chainId in swapService.chainTokens) {
                    multichainBounds[chainId] ??= {};
                    const tokenBounds = multichainBounds[chainId];
                    for (let token of swapService.chainTokens[chainId]) {
                        const tokenMinMax = tokenBounds[token];
                        if (tokenMinMax == null) {
                            tokenBounds[token] = {
                                min: BigInt(swapService.min),
                                max: BigInt(swapService.max)
                            };
                        }
                        else {
                            tokenMinMax.min = (0, Utils_1.bigIntMin)(tokenMinMax.min, BigInt(swapService.min));
                            tokenMinMax.max = (0, Utils_1.bigIntMax)(tokenMinMax.max, BigInt(swapService.max));
                        }
                    }
                }
            }
        });
        return bounds;
    }
    /**
     * Returns aggregate swap bounds (in sats - BTC) as indicated by the intermediaries
     */
    getSwapBounds(chainIdentifier) {
        const bounds = {};
        this.intermediaries.forEach(intermediary => {
            for (let _swapType in intermediary.services) {
                const swapType = parseInt(_swapType);
                const swapService = intermediary.services[swapType];
                const tokenBounds = (bounds[swapType] ??= {});
                if (swapService.chainTokens != null && swapService.chainTokens[chainIdentifier] != null) {
                    for (let token of swapService.chainTokens[chainIdentifier]) {
                        const tokenMinMax = tokenBounds[token];
                        if (tokenMinMax == null) {
                            tokenBounds[token] = {
                                min: BigInt(swapService.min),
                                max: BigInt(swapService.max)
                            };
                        }
                        else {
                            tokenMinMax.min = (0, Utils_1.bigIntMin)(tokenMinMax.min, BigInt(swapService.min));
                            tokenMinMax.max = (0, Utils_1.bigIntMax)(tokenMinMax.max, BigInt(swapService.max));
                        }
                    }
                }
            }
        });
        return bounds;
    }
    /**
     * Returns the aggregate swap minimum (in sats - BTC) for a specific swap type & token
     *  as indicated by the intermediaries
     *
     * @param chainIdentifier
     * @param swapType
     * @param token
     */
    getSwapMinimum(chainIdentifier, swapType, token) {
        const tokenStr = token.toString();
        return this.intermediaries.reduce((prevMin, intermediary) => {
            const swapService = intermediary.services[swapType];
            if (swapService == null)
                return prevMin;
            const chainTokens = swapService.chainTokens?.[chainIdentifier];
            if (chainTokens == null)
                return prevMin;
            if (!chainTokens.includes(tokenStr))
                return prevMin;
            return prevMin == null ? swapService.min : Math.min(prevMin, swapService.min);
        }, null);
    }
    /**
     * Returns the aggregate swap maximum (in sats - BTC) for a specific swap type & token
     *  as indicated by the intermediaries
     *
     * @param chainIdentifier
     * @param swapType
     * @param token
     */
    getSwapMaximum(chainIdentifier, swapType, token) {
        const tokenStr = token.toString();
        return this.intermediaries.reduce((prevMax, intermediary) => {
            const swapService = intermediary.services[swapType];
            if (swapService == null)
                return prevMax;
            const chainTokens = swapService.chainTokens?.[chainIdentifier];
            if (chainTokens == null)
                return prevMax;
            if (!chainTokens.includes(tokenStr))
                return prevMax;
            return prevMax == null ? swapService.max : Math.max(prevMax, swapService.max);
        }, null);
    }
    /**
     * Returns swap candidates for a specific swap type & token address
     *
     * @param chainIdentifier
     * @param swapType
     * @param tokenAddress
     * @param amount Amount to be swapped in sats - BTC
     * @param count How many intermediaries to return at most
     */
    getSwapCandidates(chainIdentifier, swapType, tokenAddress, amount, count) {
        const candidates = this.intermediaries.filter(e => {
            const swapService = e.services[swapType];
            if (swapService == null)
                return false;
            if (amount != null && amount < BigInt(swapService.min))
                return false;
            if (amount != null && amount > BigInt(swapService.max))
                return false;
            if (swapService.chainTokens == null)
                return false;
            if (swapService.chainTokens[chainIdentifier] == null)
                return false;
            if (!swapService.chainTokens[chainIdentifier].includes(tokenAddress.toString()))
                return false;
            return true;
        });
        candidates.sort(getIntermediaryComparator(swapType, tokenAddress, amount));
        if (count == null) {
            return candidates;
        }
        else {
            return candidates.slice(0, count);
        }
    }
    /**
     * Removes a specific intermediary from the list of active intermediaries (used for blacklisting)
     *
     * @param intermediary
     */
    removeIntermediary(intermediary) {
        const index = this.intermediaries.indexOf(intermediary);
        if (index >= 0) {
            logger.info("removeIntermediary(): Removing intermediary: " + intermediary.url);
            this.intermediaries.splice(index, 1);
            this.emit("removed", [intermediary]);
            return true;
        }
        return false;
    }
}
exports.IntermediaryDiscovery = IntermediaryDiscovery;
