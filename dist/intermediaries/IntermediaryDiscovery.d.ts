/// <reference types="node" />
import { Intermediary } from "./Intermediary";
import { SwapType } from "../enums/SwapType";
import { SwapContract } from "@atomiqlabs/base";
import { EventEmitter } from "events";
/**
 * Swap handler type enum for intermediary communication
 * @category Pricing and LPs
 */
export declare enum SwapHandlerType {
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
 * @category Pricing and LPs
 */
export type SwapHandlerInfoType = {
    swapFeePPM: number;
    swapBaseFee: number;
    min: number;
    max: number;
    tokens: string[];
    chainTokens?: {
        [chainId: string]: string[];
    };
    data?: any;
};
/**
 * Token bounds (min/max) for swaps
 * @category Pricing and LPs
 */
export type TokenBounds = {
    [token: string]: {
        min: bigint;
        max: bigint;
    };
};
/**
 * Multi-chain token bounds
 * @category Pricing and LPs
 */
export type MultichainTokenBounds = {
    [chainId: string]: TokenBounds;
};
/**
 * Swap bounds by type
 * @category Pricing and LPs
 */
export type SwapBounds = {
    [key in SwapType]?: TokenBounds;
};
/**
 * Multi-chain swap bounds
 * @category Pricing and LPs
 */
export type MultichainSwapBounds = {
    [key in SwapType]?: MultichainTokenBounds;
};
/**
 * Discovery service for available liquidity providers/intermediaries
 * @category Pricing and LPs
 */
export declare class IntermediaryDiscovery extends EventEmitter {
    intermediaries: Intermediary[];
    swapContracts: {
        [key: string]: SwapContract;
    };
    registryUrl: string;
    httpRequestTimeout?: number;
    /**
     * Maximum time (in millis) to wait for other LP's responses after the first one was founds
     */
    maxWaitForOthersTimeout?: number;
    private overrideNodeUrls?;
    constructor(swapContracts: {
        [key: string]: SwapContract;
    }, registryUrl?: string, nodeUrls?: string[], httpRequestTimeout?: number, maxWaitForOthersTimeout?: number);
    /**
     * Fetches the URLs of swap intermediaries from registry or from a pre-defined array of node urls
     *
     * @param abortSignal
     */
    private getIntermediaryUrls;
    /**
     * Returns data as reported by a specific node (as identified by its URL). This function is specifically made
     *  in a way, that in case the abortSignal fires AFTER the LP response was received (and during signature checking),
     *  it proceeds with the addresses it was able to verify already. Hence after calling abort, this function is guaranteed
     *  to either reject or resolve instantly.
     *
     * @param url
     * @param abortSignal
     */
    private getNodeInfo;
    /**
     * Inherits abort signal logic from `getNodeInfo()`, check those function docs to better understand
     *
     * @param url
     * @param abortSignal
     * @private
     */
    private loadIntermediary;
    /**
     * Returns the intermediary at the provided URL, either from the already fetched list of LPs or fetches the data on-demand
     *
     * @param url
     * @param abortSignal
     */
    getIntermediary(url: string, abortSignal?: AbortSignal): Promise<Intermediary | null>;
    /**
     * Reloads the saves a list of intermediaries
     * @param abortSignal
     */
    reloadIntermediaries(abortSignal?: AbortSignal): Promise<void>;
    /**
     * Initializes the discovery by fetching/reloading intermediaries
     *
     * @param abortSignal
     */
    init(abortSignal?: AbortSignal): Promise<void>;
    getMultichainSwapBounds(): MultichainSwapBounds;
    /**
     * Returns aggregate swap bounds (in sats - BTC) as indicated by the intermediaries
     */
    getSwapBounds(chainIdentifier: string): SwapBounds;
    /**
     * Returns the aggregate swap minimum (in sats - BTC) for a specific swap type & token
     *  as indicated by the intermediaries
     *
     * @param chainIdentifier
     * @param swapType
     * @param token
     */
    getSwapMinimum(chainIdentifier: string, swapType: SwapType, token: any): number | null;
    /**
     * Returns the aggregate swap maximum (in sats - BTC) for a specific swap type & token
     *  as indicated by the intermediaries
     *
     * @param chainIdentifier
     * @param swapType
     * @param token
     */
    getSwapMaximum(chainIdentifier: string, swapType: SwapType, token: any): number | null;
    /**
     * Returns swap candidates for a specific swap type & token address
     *
     * @param chainIdentifier
     * @param swapType
     * @param tokenAddress
     * @param amount Amount to be swapped in sats - BTC
     * @param count How many intermediaries to return at most
     */
    getSwapCandidates(chainIdentifier: string, swapType: SwapType, tokenAddress: any, amount?: bigint, count?: number): Intermediary[];
    /**
     * Removes a specific intermediary from the list of active intermediaries (used for blacklisting)
     *
     * @param intermediary
     */
    removeIntermediary(intermediary: Intermediary): boolean;
}
