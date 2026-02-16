import {SwapType} from "../enums/SwapType";
import {SwapHandlerInfoType} from "./IntermediaryDiscovery";
import {ChainSwapType, LNNodeLiquidity, SwapContract} from "@atomiqlabs/base";

import {tryWithRetries} from "../utils/RetryUtils";

/**
 * Services offered by an intermediary
 *
 * @category LPs
 */
export type ServicesType = {
    [key in SwapType]?: SwapHandlerInfoType
};

/**
 * Reputation data for an intermediary on a single chain
 *
 * @category LPs
 */
export type SingleChainReputationType = {
    [token: string]: {
        [key in ChainSwapType]: {
            successVolume: bigint,
            successCount: bigint,
            failVolume: bigint,
            failCount: bigint,
            coopCloseVolume: bigint,
            coopCloseCount: bigint,
        }
    }
};

/**
 * Smart chain liquidity data
 *
 * @category LPs
 */
export type SCLiquidity = {
    [token: string]: bigint
};

/**
 * Represents an intermediary (liquidity provider)
 *
 * @category LPs
 */
export class Intermediary {

    /**
     * Base URL where the intermediary is listening for HTTP requests
     */
    readonly url: string;
    /**
     * Addresses of the intermediary on smart chains, used for checking the provided signatures
     */
    readonly addresses: {[chainIdentifier: string]: string};
    /**
     * Swap protocol services offered by the intermediary
     */
    readonly services: ServicesType;
    /**
     * Input/output swap bounds for various swap protocols offered by the intermediary
     */
    readonly swapBounds: {
        [swapType in SwapType]?: {
            [chainIdentifier: string]: {
                [tokenAddress: string]: {
                    input: {
                        min?: bigint,
                        max?: bigint
                    },
                    output: {
                        min?: bigint,
                        max?: bigint
                    }
                }
            }
        }
    }
    /**
     * Reputation of the intermediary on different smart chains, this is only fetched
     *  on-demand when creating a swap where reputation is checked
     */
    reputation: { [chainIdentifier: string]: SingleChainReputationType } = {};
    /**
     * Liquidity of the intermediary across different smart chains, this is only fetched
     *  on-demand when creating a swap where intermediary's liquidity is checked
     */
    liquidity: { [chainIdentifier: string]: SCLiquidity } = {};
    /**
     * Data about a lightning network node used by this intermediary, if it offers lightning
     *  network swaps, this is only fetched on-demand when creating a Bitcoin Lightning -> Smart chain
     *  swap through the intermediary (which necessitates checking intermediary's channel capacities)
     */
    lnData?: LNNodeLiquidity;

    constructor(
        url: string,
        addresses: {[chainIdentifier: string]: string},
        services: ServicesType,
        reputation: { [chainIdentifier: string]: SingleChainReputationType } = {}
    ) {
        this.url = url;
        this.addresses = addresses;
        this.services = services;
        this.reputation = reputation;

        this.swapBounds = {};
        for(let _swapType in this.services) {
            const swapType: SwapType = parseInt(_swapType);
            const serviceInfo = this.services[swapType]!;
            const btcBounds = {min: BigInt(serviceInfo.min), max: BigInt(serviceInfo.max)};
            const isSend = swapType===SwapType.TO_BTC || swapType===SwapType.TO_BTCLN;
            this.swapBounds[swapType] = {};
            for(let chainIdentifier in serviceInfo.chainTokens) {
                this.swapBounds[swapType]![chainIdentifier] = {};
                for(let tokenAddress of serviceInfo.chainTokens[chainIdentifier]) {
                    this.swapBounds[swapType]![chainIdentifier][tokenAddress] = {
                        input: isSend ? {} : btcBounds,
                        output: !isSend ? {} : btcBounds,
                    };
                }
            }
        }
    }

    /**
     * Returns the input/output swap limit for given swap type, chain and token
     *
     * @param swapType Swap protocol service to check
     * @param chainId Chain identifier of the smart chain to check
     * @param tokenAddress Address of the token to check
     */
    getSwapLimits(swapType: SwapType, chainId: string, tokenAddress: string): {input: {min?: bigint, max?: bigint}, output: {min?: bigint, max?: bigint}} | undefined {
        return this.swapBounds[swapType]?.[chainId]?.[tokenAddress];
    }

    /**
     * Returns tokens supported by the intermediary, optionally constrained to the specific swap types
     *
     * @param chainIdentifier Chain identifier of the smart chain to check
     * @param swapTypesArr An array of swap type services to check
     * @private
     */
    private getSupportedTokens(chainIdentifier: string, swapTypesArr: SwapType[] = [
        SwapType.TO_BTC,
        SwapType.TO_BTCLN,
        SwapType.FROM_BTC,
        SwapType.FROM_BTCLN,
        SwapType.SPV_VAULT_FROM_BTC,
        SwapType.FROM_BTCLN_AUTO
    ]): Set<string> {
        const swapTypes = new Set(swapTypesArr);
        let tokens: Set<string> = new Set<string>();
        swapTypes.forEach((swapType) => {
            const supportedTokens = this.services[swapType]?.chainTokens?.[chainIdentifier];
            if(supportedTokens!=null) supportedTokens.forEach(token => tokens.add(token));
        });
        return tokens;
    }

    /**
     * Fetches, returns and saves the reputation of the intermediary, either for all or just for a single token
     *
     * @param chainIdentifier Chain identifier of the chain on which to fetch the reputation
     * @param swapContract Swap contract for the requested smart chain
     * @param tokens An optional array of tokens to fetch the data for (by default it uses all tokens supported
     *  by the intermediary)
     * @param abortSignal
     */
    async getReputation(
        chainIdentifier: string,
        swapContract: SwapContract<any>,
        tokens?: string[],
        abortSignal?: AbortSignal
    ): Promise<SingleChainReputationType> {
        const checkReputationTokens: Set<string> = tokens==null ?
            this.getSupportedTokens(chainIdentifier, [SwapType.TO_BTC, SwapType.TO_BTCLN]) :
            new Set<string>(tokens);

        const promises: Promise<void>[] = [];
        const reputation: SingleChainReputationType = {};
        for(let token of checkReputationTokens) {
            promises.push(
                tryWithRetries(() =>
                    swapContract.getIntermediaryReputation(this.getAddress(chainIdentifier), token),
                    undefined, undefined, abortSignal
                ).then(result => {
                    if(result!=null) reputation[token] = result;
                })
            );
        }
        await Promise.all(promises);

        this.reputation ??= {};
        this.reputation[chainIdentifier] ??= {};
        for(let key in reputation) {
            this.reputation[chainIdentifier][key] = reputation[key];
        }

        return reputation;
    }

    /**
     * Fetches, returns and saves the liquidity of the intermediary for a specific token
     *
     * @param chainIdentifier Chain identifier of the chain on which to fetch the reputation
     * @param swapContract Swap contract for the requested smart chain
     * @param token Token address of the token to fetch the liquidity for
     * @param abortSignal
     */
    async getLiquidity(
        chainIdentifier: string,
        swapContract: SwapContract<any>,
        token: string,
        abortSignal?: AbortSignal
    ): Promise<bigint> {
        const result = await tryWithRetries(
            () => swapContract.getBalance(this.getAddress(chainIdentifier), token, true),
            undefined, undefined, abortSignal
        );

        this.liquidity ??= {};
        this.liquidity[chainIdentifier] ??= {};
        this.liquidity[chainIdentifier][token] = result;

        return result;
    }

    /**
     * Checks whether the intermediary supports swaps of any tokens on the smart chain
     *
     * @param chainIdentifier Chain identifier of the smart chain
     */
    supportsChain(chainIdentifier: string): boolean {
        if(this.addresses[chainIdentifier]==null) return false;
        return this.getSupportedTokens(chainIdentifier).size!==0;
    }

    /**
     * Returns intermediary's address on a given smart chain
     *
     * @param chainIdentifier Chain identifier of the smart chain
     */
    getAddress(chainIdentifier: string) {
        return this.addresses[chainIdentifier];
    }

}
