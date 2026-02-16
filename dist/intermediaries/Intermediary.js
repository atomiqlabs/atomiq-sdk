"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Intermediary = void 0;
const SwapType_1 = require("../enums/SwapType");
const RetryUtils_1 = require("../utils/RetryUtils");
/**
 * Represents an intermediary (liquidity provider)
 *
 * @category LPs
 */
class Intermediary {
    constructor(url, addresses, services, reputation = {}) {
        /**
         * Reputation of the intermediary on different smart chains, this is only fetched
         *  on-demand when creating a swap where reputation is checked
         */
        this.reputation = {};
        /**
         * Liquidity of the intermediary across different smart chains, this is only fetched
         *  on-demand when creating a swap where intermediary's liquidity is checked
         */
        this.liquidity = {};
        this.url = url;
        this.addresses = addresses;
        this.services = services;
        this.reputation = reputation;
        this.swapBounds = {};
        for (let _swapType in this.services) {
            const swapType = parseInt(_swapType);
            const serviceInfo = this.services[swapType];
            const btcBounds = { min: BigInt(serviceInfo.min), max: BigInt(serviceInfo.max) };
            const isSend = swapType === SwapType_1.SwapType.TO_BTC || swapType === SwapType_1.SwapType.TO_BTCLN;
            this.swapBounds[swapType] = {};
            for (let chainIdentifier in serviceInfo.chainTokens) {
                this.swapBounds[swapType][chainIdentifier] = {};
                for (let tokenAddress of serviceInfo.chainTokens[chainIdentifier]) {
                    this.swapBounds[swapType][chainIdentifier][tokenAddress] = {
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
    getSwapLimits(swapType, chainId, tokenAddress) {
        return this.swapBounds[swapType]?.[chainId]?.[tokenAddress];
    }
    /**
     * Returns tokens supported by the intermediary, optionally constrained to the specific swap types
     *
     * @param chainIdentifier Chain identifier of the smart chain to check
     * @param swapTypesArr An array of swap type services to check
     * @private
     */
    getSupportedTokens(chainIdentifier, swapTypesArr = [
        SwapType_1.SwapType.TO_BTC,
        SwapType_1.SwapType.TO_BTCLN,
        SwapType_1.SwapType.FROM_BTC,
        SwapType_1.SwapType.FROM_BTCLN,
        SwapType_1.SwapType.SPV_VAULT_FROM_BTC,
        SwapType_1.SwapType.FROM_BTCLN_AUTO
    ]) {
        const swapTypes = new Set(swapTypesArr);
        let tokens = new Set();
        swapTypes.forEach((swapType) => {
            const supportedTokens = this.services[swapType]?.chainTokens?.[chainIdentifier];
            if (supportedTokens != null)
                supportedTokens.forEach(token => tokens.add(token));
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
    async getReputation(chainIdentifier, swapContract, tokens, abortSignal) {
        const checkReputationTokens = tokens == null ?
            this.getSupportedTokens(chainIdentifier, [SwapType_1.SwapType.TO_BTC, SwapType_1.SwapType.TO_BTCLN]) :
            new Set(tokens);
        const promises = [];
        const reputation = {};
        for (let token of checkReputationTokens) {
            promises.push((0, RetryUtils_1.tryWithRetries)(() => swapContract.getIntermediaryReputation(this.getAddress(chainIdentifier), token), undefined, undefined, abortSignal).then(result => {
                if (result != null)
                    reputation[token] = result;
            }));
        }
        await Promise.all(promises);
        this.reputation ??= {};
        this.reputation[chainIdentifier] ??= {};
        for (let key in reputation) {
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
    async getLiquidity(chainIdentifier, swapContract, token, abortSignal) {
        const result = await (0, RetryUtils_1.tryWithRetries)(() => swapContract.getBalance(this.getAddress(chainIdentifier), token, true), undefined, undefined, abortSignal);
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
    supportsChain(chainIdentifier) {
        if (this.addresses[chainIdentifier] == null)
            return false;
        return this.getSupportedTokens(chainIdentifier).size !== 0;
    }
    /**
     * Returns intermediary's address on a given smart chain
     *
     * @param chainIdentifier Chain identifier of the smart chain
     */
    getAddress(chainIdentifier) {
        return this.addresses[chainIdentifier];
    }
}
exports.Intermediary = Intermediary;
