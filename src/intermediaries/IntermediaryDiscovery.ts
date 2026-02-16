import {Intermediary, ServicesType} from "./Intermediary";
import {SwapType} from "../enums/SwapType";
import {SwapContract} from "@atomiqlabs/base";
import {EventEmitter} from "events";
import {Buffer} from "buffer";
import {bigIntMax, bigIntMin, extendAbortController} from "../utils/Utils";
import {IntermediaryAPI} from "./apis/IntermediaryAPI";
import {getLogger} from "../utils/Logger";
import {httpGet} from "../http/HttpUtils";
import {tryWithRetries} from "../utils/RetryUtils";

/**
 * Swap handler type mapping for intermediary communication
 *
 * @category Pricing and LPs
 */
export enum SwapHandlerType {
    TO_BTC = "TO_BTC",
    FROM_BTC = "FROM_BTC",
    TO_BTCLN = "TO_BTCLN",
    FROM_BTCLN = "FROM_BTCLN",
    FROM_BTC_TRUSTED = "FROM_BTC_TRUSTED",
    FROM_BTCLN_TRUSTED = "FROM_BTCLN_TRUSTED",
    FROM_BTC_SPV = "FROM_BTC_SPV",
    FROM_BTCLN_AUTO = "FROM_BTCLN_AUTO"
}

/**
 * Swap handler information type
 *
 * @category Pricing and LPs
 */
export type SwapHandlerInfoType = {
    swapFeePPM: number,
    swapBaseFee: number,
    min: number,
    max: number,
    tokens: string[],
    chainTokens?: {[chainId: string]: string[]};
    data?: any,
};

type InfoHandlerResponseEnvelope = {
    nonce: string,
    services: {
        [key in SwapHandlerType]?: SwapHandlerInfoType
    }
};

/**
 * Token bounds (min/max) for swaps
 *
 * @category Pricing and LPs
 */
export type TokenBounds = {
    [token: string]: {
        min: bigint,
        max: bigint
    }
}

/**
 * Multi-chain token bounds (min/max) for swaps
 *
 * @category Pricing and LPs
 */
export type MultichainTokenBounds = {
    [chainId: string]: TokenBounds
}

/**
 * Swap bounds by swap protocol type
 *
 * @category Pricing and LPs
 */
export type SwapBounds = {
    [key in SwapType]?: TokenBounds
}

/**
 * Multi-chain swap bounds
 *
 * @category Pricing and LPs
 */
export type MultichainSwapBounds = {
    [key in SwapType]?: MultichainTokenBounds
}

/**
 * Converts SwapHandlerType (represented as string & used in REST API communication with intermediaries) to regular
 *  {@link SwapType}
 *
 * @param swapHandlerType
 */
function swapHandlerTypeToSwapType(swapHandlerType: SwapHandlerType): SwapType {
    switch (swapHandlerType) {
        case SwapHandlerType.FROM_BTC:
            return SwapType.FROM_BTC;
        case SwapHandlerType.TO_BTC:
            return SwapType.TO_BTC;
        case SwapHandlerType.FROM_BTCLN:
            return SwapType.FROM_BTCLN;
        case SwapHandlerType.TO_BTCLN:
            return SwapType.TO_BTCLN;
        case SwapHandlerType.FROM_BTC_TRUSTED:
            return SwapType.TRUSTED_FROM_BTC;
        case SwapHandlerType.FROM_BTCLN_TRUSTED:
            return SwapType.TRUSTED_FROM_BTCLN;
        case SwapHandlerType.FROM_BTC_SPV:
            return SwapType.SPV_VAULT_FROM_BTC;
        case SwapHandlerType.FROM_BTCLN_AUTO:
            return SwapType.FROM_BTCLN_AUTO;
    }
}

/**
 * A default intermediary comparator, only takes the announced fee into consideration
 *
 * @param swapType
 * @param tokenAddress
 * @param swapAmount
 */
function getIntermediaryComparator(swapType: SwapType, tokenAddress: string, swapAmount?: bigint) {

    if(swapType===SwapType.TO_BTC) {
        //TODO: Also take reputation into account
    }

    return (a: Intermediary, b: Intermediary): number => {
        const aService = a.services[swapType];
        const bService = b.services[swapType];
        if(aService==null && bService==null) return 0;
        if(aService==null) return 1;
        if(bService==null) return -1;

        if(swapAmount==null) {
            return aService.swapFeePPM - bService.swapFeePPM;
        } else {
            const feeA = BigInt(aService.swapBaseFee) + (swapAmount * BigInt(aService.swapFeePPM) / 1000000n);
            const feeB = BigInt(bService.swapBaseFee) + (swapAmount * BigInt(bService.swapFeePPM) / 1000000n);

            return feeA - feeB > 0n ? 1 : feeA === feeB ? 0 : -1;
        }
    }

}

const logger = getLogger("IntermediaryDiscovery: ");

const REGISTRY_URL = "https://api.github.com/repos/adambor/SolLightning-registry/contents/registry.json?ref=main";

//To allow for legacy responses from not-yet updated LPs
const DEFAULT_CHAIN = "SOLANA";

/**
 * Discovery service for available intermediaries (liquidity providers)
 *
 * @category Pricing and LPs
 */
export class IntermediaryDiscovery extends EventEmitter {

    /**
     * A current list of active intermediaries
     */
    intermediaries: Intermediary[] = [];

    /**
     * Swap contracts for checking intermediary signatures
     */
    swapContracts: {[key: string]: SwapContract};
    /**
     * Registry URL used as a source for the list of intermediaries, this should be a link to a
     *  github-hosted JSON file
     */
    registryUrl: string;

    /**
     * Timeout for the HTTP handshake (/info) requests sent to the intermediaries
     */
    httpRequestTimeout?: number;
    /**
     * Maximum time (in millis) to wait for other intermediary's responses after the first one was founds
     */
    maxWaitForOthersTimeout?: number;

    /**
     * The intermediary URLs passed in the constructor, to be used instead of querying the registry
     *
     * @private
     */
    private overrideNodeUrls?: string[];

    constructor(
        swapContracts: {[key: string]: SwapContract},
        registryUrl: string = REGISTRY_URL,
        nodeUrls?: string[],
        httpRequestTimeout?: number,
        maxWaitForOthersTimeout?: number
    ) {
        super();
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
    private async getIntermediaryUrls(abortSignal?: AbortSignal): Promise<string[]> {
        if(this.overrideNodeUrls!=null && this.overrideNodeUrls.length>0) {
            return this.overrideNodeUrls;
        }

        const response = await tryWithRetries(
          () => httpGet<{content: string}>(this.registryUrl, this.httpRequestTimeout, abortSignal),
          {maxRetries: 3, delay: 100, exponential: true}
        );

        const content = response.content.replace(new RegExp("\\n", "g"), "");

        return JSON.parse(Buffer.from(content, "base64").toString()) as string[];
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
    private async getNodeInfo(url: string, abortSignal?: AbortSignal) : Promise<{addresses: {[key: string]: string}, info: InfoHandlerResponseEnvelope}> {
        const response = await tryWithRetries(
            () => IntermediaryAPI.getIntermediaryInfo(url, this.httpRequestTimeout, abortSignal),
            {maxRetries: 3, delay: 100, exponential: true},
            undefined,
            abortSignal
        );
        abortSignal?.throwIfAborted();

        const promises: Promise<void>[] = [];
        const addresses: {[key: string]: string} = {};
        for(let chain in response.chains) {
            if(this.swapContracts[chain]!=null) {
                promises.push((async () => {
                    const {signature, address} = response.chains[chain];
                    try {
                        await this.swapContracts[chain].isValidDataSignature(Buffer.from(response.envelope), signature, address);
                        addresses[chain] = address;
                    } catch (e) {
                        logger.warn("Failed to verify "+chain+" signature for intermediary: "+url);
                    }
                })());
            }
        }

        if(abortSignal!=null) {
            await Promise.race([
                Promise.all(promises),
                new Promise(resolve => abortSignal.addEventListener("abort", resolve))
            ]);
        } else {
            await Promise.all(promises);
        }

        //Handle legacy responses
        const info: InfoHandlerResponseEnvelope = JSON.parse(response.envelope);
        for(let swapType in info.services) {
            const serviceData: SwapHandlerInfoType = info.services[swapType as SwapHandlerType]!;
            if(serviceData.chainTokens==null) serviceData.chainTokens = {
                [DEFAULT_CHAIN]: serviceData.tokens
            };
            for(let chain in serviceData.chainTokens) {
                if(addresses[chain]==null) delete serviceData.chainTokens[chain];
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
    private async loadIntermediary(url: string, abortSignal?: AbortSignal): Promise<Intermediary | null> {
        try {
            const nodeInfo = await this.getNodeInfo(url, abortSignal);
            const services: ServicesType = {};
            for(let key in nodeInfo.info.services) {
                services[swapHandlerTypeToSwapType(key as SwapHandlerType)] = nodeInfo.info.services[key as SwapHandlerType];
            }
            return new Intermediary(url, nodeInfo.addresses, services);
        } catch (e) {
            logger.warn("fetchIntermediaries(): Error contacting intermediary "+url+": ", e);
            return null;
        }
    }

    /**
     * Returns the intermediary at the provided URL, either from the already fetched list of LPs
     *  or fetches the data on-demand, by sending the handshake HTTP request (/info) to the LP.
     *
     * Doesn't save the fetched intermediary to the list of intermediaries if it isn't already
     *  part of the known intermediaries
     *
     * @param url Base URL of the intermediary, which accepts HTTP requests
     * @param abortSignal
     */
    getIntermediary(url: string, abortSignal?: AbortSignal): Promise<Intermediary | null> {
        const foundLp = this.intermediaries.find(lp => lp.url===url);
        if(foundLp!=null) return Promise.resolve(foundLp);
        return this.loadIntermediary(url, abortSignal);
    }

    /**
     * Reloads the saves a list of intermediaries
     *
     * @param abortSignal
     */
    async reloadIntermediaries(abortSignal?: AbortSignal): Promise<void> {
        //Get LP urls
        const urls = await this.getIntermediaryUrls(abortSignal);

        logger.debug("reloadIntermediaries(): Pinging intermediaries: ", urls.join());

        const abortController = extendAbortController(abortSignal);
        let timer: any;
        const intermediaries = await Promise.all(urls.map(url => this.loadIntermediary(url, abortController.signal).then(lp => {
            if(lp!=null && timer==null) timer = setTimeout(() => {
                //Trigger abort through the abort controller, such that all underlying promises resolve instantly
                abortController.abort();
            }, this.maxWaitForOthersTimeout ?? 5*1000);
            return lp;
        })));
        if(timer!=null) clearTimeout(timer);

        const activeNodes: Intermediary[] = intermediaries.filter(intermediary => intermediary!=null) as Intermediary[];
        if(activeNodes.length===0) logger.error("reloadIntermediaries(): No online intermediary found! Swaps might not be possible!");

        this.intermediaries = activeNodes;
        this.emit("added", activeNodes);

        logger.info("reloadIntermediaries(): Using active intermediaries: ", activeNodes.map(lp => lp.url).join());
    }

    /**
     * Initializes the discovery by fetching/reloading intermediaries
     *
     * @param abortSignal
     */
    init(abortSignal?: AbortSignal): Promise<void> {
        logger.info("init(): Initializing with registryUrl: "+this.registryUrl+" intermediary array: "+(this.overrideNodeUrls || []).join());
        return this.reloadIntermediaries(abortSignal);
    }

    /**
     * Returns known swap bounds (in satoshis - BTC) by aggregating values from all known intermediaries
     */
    getMultichainSwapBounds(): MultichainSwapBounds {
        const bounds: MultichainSwapBounds = {};

        this.intermediaries.forEach(intermediary => {
            for(let _swapType in intermediary.services) {
                const swapType = parseInt(_swapType) as SwapType;
                const swapService: SwapHandlerInfoType = intermediary.services[swapType]!;
                const multichainBounds: MultichainTokenBounds = (bounds[swapType] ??= {});
                for(let chainId in swapService.chainTokens) {
                    multichainBounds[chainId] ??= {};
                    const tokenBounds: TokenBounds = multichainBounds[chainId];

                    for(let token of swapService.chainTokens[chainId]) {
                        const tokenMinMax = tokenBounds[token];
                        if(tokenMinMax==null) {
                            tokenBounds[token] = {
                                min: BigInt(swapService.min),
                                max: BigInt(swapService.max)
                            }
                        } else {
                            tokenMinMax.min = bigIntMin(tokenMinMax.min, BigInt(swapService.min));
                            tokenMinMax.max = bigIntMax(tokenMinMax.max, BigInt(swapService.max));
                        }
                    }
                }
            }
        });

        return bounds;
    }

    /**
     * Returns aggregate swap bounds (in satoshis - BTC) as indicated by the intermediaries
     */
    getSwapBounds(chainIdentifier: string): SwapBounds {
        const bounds: SwapBounds = {};

        this.intermediaries.forEach(intermediary => {
            for(let _swapType in intermediary.services) {
                const swapType = parseInt(_swapType) as SwapType;
                const swapService: SwapHandlerInfoType = intermediary.services[swapType]!;
                const tokenBounds: TokenBounds = (bounds[swapType] ??= {});
                if(swapService.chainTokens!=null && swapService.chainTokens[chainIdentifier]!=null) {
                    for(let token of swapService.chainTokens[chainIdentifier]) {
                        const tokenMinMax = tokenBounds[token];
                        if(tokenMinMax==null) {
                            tokenBounds[token] = {
                                min: BigInt(swapService.min),
                                max: BigInt(swapService.max)
                            }
                        } else {
                            tokenMinMax.min = bigIntMin(tokenMinMax.min, BigInt(swapService.min));
                            tokenMinMax.max = bigIntMax(tokenMinMax.max, BigInt(swapService.max));
                        }
                    }
                }
            }
        });

        return bounds;
    }

    /**
     * Returns the aggregate swap minimum (in satoshis - BTC) for a specific swap type & token
     *  as indicated by the intermediaries
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param swapType Swap protocol type
     * @param tokenAddress Token address
     */
    getSwapMinimum(chainIdentifier: string, swapType: SwapType, tokenAddress: string): number | null {
        const tokenStr = tokenAddress.toString();
        return this.intermediaries.reduce<number | null>((prevMin: number | null, intermediary: Intermediary) => {
            const swapService = intermediary.services[swapType];
            if(swapService==null) return prevMin;
            const chainTokens = swapService.chainTokens?.[chainIdentifier];
            if(chainTokens==null) return prevMin;
            if(!chainTokens.includes(tokenStr)) return prevMin;
            return prevMin==null ? swapService.min : Math.min(prevMin, swapService.min);
        }, null);
    }

    /**
     * Returns the aggregate swap maximum (in satoshis - BTC) for a specific swap type & token
     *  as indicated by the intermediaries
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param swapType Swap protocol type
     * @param tokenAddress Token address
     */
    getSwapMaximum(chainIdentifier: string, swapType: SwapType, tokenAddress: string): number | null {
        const tokenStr = tokenAddress.toString();
        return this.intermediaries.reduce<number | null>((prevMax: number | null, intermediary: Intermediary) => {
            const swapService = intermediary.services[swapType];
            if(swapService==null) return prevMax;
            const chainTokens = swapService.chainTokens?.[chainIdentifier];
            if(chainTokens==null) return prevMax;
            if(!chainTokens.includes(tokenStr)) return prevMax;
            return prevMax==null ? swapService.max : Math.max(prevMax, swapService.max);
        }, null);
    }

    /**
     * Returns swap candidates for a specific swap type & token address
     *
     * @param chainIdentifier Chain identifier of the smart chain
     * @param swapType Swap protocol type
     * @param tokenAddress Token address
     * @param amount Amount to be swapped in sats - BTC
     * @param count How many intermediaries to return at most
     */
    getSwapCandidates(chainIdentifier: string, swapType: SwapType, tokenAddress: string, amount?: bigint, count?: number): Intermediary[] {
        const candidates = this.intermediaries.filter(e => {
            const swapService = e.services[swapType];
            if(swapService==null) return false;
            if(amount!=null && amount < BigInt(swapService.min)) return false;
            if(amount!=null && amount > BigInt(swapService.max)) return false;
            if(swapService.chainTokens==null) return false;
            if(swapService.chainTokens[chainIdentifier]==null) return false;
            if(!swapService.chainTokens[chainIdentifier].includes(tokenAddress.toString())) return false;
            return true;
        });

        candidates.sort(getIntermediaryComparator(swapType, tokenAddress, amount));

        if(count==null) {
            return candidates;
        } else {
            return candidates.slice(0, count);
        }
    }

    /**
     * Removes a specific intermediary from the list of active intermediaries (used for blacklisting)
     *
     * @param intermediary
     */
    removeIntermediary(intermediary: Intermediary): boolean {
        const index = this.intermediaries.indexOf(intermediary);
        if(index>=0) {
            logger.info("removeIntermediary(): Removing intermediary: "+intermediary.url);
            this.intermediaries.splice(index, 1);
            this.emit("removed", [intermediary]);
            return true;
        }
        return false;
    }

}
