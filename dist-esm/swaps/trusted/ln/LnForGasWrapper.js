import { LnForGasSwap, LnForGasSwapState } from "./LnForGasSwap.js";
import { ISwapWrapper } from "../../ISwapWrapper.js";
import { decode as bolt11Decode } from "@atomiqlabs/bolt11";
import { IntermediaryError } from "../../../errors/IntermediaryError.js";
import { SwapType } from "../../../enums/SwapType.js";
/**
 * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on
 *  the destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export class LnForGasWrapper extends ISwapWrapper {
    constructor() {
        super(...arguments);
        this.TYPE = SwapType.TRUSTED_FROM_BTCLN;
        /**
         * @internal
         */
        this._swapDeserializer = LnForGasSwap;
        /**
         * @internal
         */
        this._pendingSwapStates = [LnForGasSwapState.PR_CREATED];
        /**
         * @internal
         */
        this.tickSwapState = undefined;
        /**
         * @internal
         */
        this.processEvent = undefined;
    }
    /**
     * Returns a newly created trusted Lightning network -> Smart chain swap, receiving
     *  the specified amount of native token on the destination chain.
     *
     * @param recipient Address of the recipient on the smart chain destination chain
     * @param amount Amount of native token to receive in base units
     * @param lpOrUrl Intermediary (LP) to use for the swap
     */
    async create(recipient, amount, lpOrUrl) {
        if (!this.isInitialized)
            throw new Error("Not initialized, call init() first!");
        const lpUrl = typeof (lpOrUrl) === "string" ? lpOrUrl : lpOrUrl.url;
        const token = this._chain.getNativeCurrencyAddress();
        const resp = await this._lpApi.initTrustedFromBTCLN(this.chainIdentifier, lpUrl, {
            address: recipient,
            amount,
            token
        }, this._options.getRequestTimeout);
        const decodedPr = bolt11Decode(resp.pr);
        if (decodedPr.millisatoshis == null)
            throw new Error("Invalid payment request returned, no msat amount value!");
        if (decodedPr.timeExpireDate == null)
            throw new Error("Invalid payment request returned, no time expire date!");
        const amountIn = (BigInt(decodedPr.millisatoshis) + 999n) / 1000n;
        if (resp.total !== amount)
            throw new IntermediaryError("Invalid total returned");
        const pricingInfo = await this.verifyReturnedPrice(typeof (lpOrUrl) === "string" || lpOrUrl.services[SwapType.TRUSTED_FROM_BTCLN] == null ?
            { swapFeePPM: 10000, swapBaseFee: 10 } :
            lpOrUrl.services[SwapType.TRUSTED_FROM_BTCLN], false, amountIn, amount, token, { swapFeeBtc: resp.swapFeeSats });
        const quoteInit = {
            pr: resp.pr,
            outputAmount: resp.total,
            recipient,
            pricingInfo,
            url: lpUrl,
            expiry: decodedPr.timeExpireDate * 1000,
            swapFee: resp.swapFee,
            swapFeeBtc: resp.swapFeeSats,
            token,
            exactIn: false,
            contractVersion: "v1"
        };
        const quote = new LnForGasSwap(this, quoteInit);
        return quote;
    }
}
