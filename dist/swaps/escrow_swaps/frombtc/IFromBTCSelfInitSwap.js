"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IFromBTCSelfInitSwap = void 0;
const base_1 = require("@atomiqlabs/base");
const IEscrowSelfInitSwap_1 = require("../IEscrowSelfInitSwap");
const FeeType_1 = require("../../../enums/FeeType");
const PercentagePPM_1 = require("../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../types/TokenAmount");
class IFromBTCSelfInitSwap extends IEscrowSelfInitSwap_1.IEscrowSelfInitSwap {
    constructor(wrapper, initOrObj) {
        super(wrapper, initOrObj);
    }
    /**
     * In case swapFee in BTC is not supplied it recalculates it based on swap price
     * @protected
     */
    tryRecomputeSwapPrice() {
        const input = this.getInput();
        if (this.swapFeeBtc == null && input.rawAmount != null) {
            this.swapFeeBtc = this.swapFee * input.rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }
    _getInitiator() {
        return this.getSwapData().getClaimer();
    }
    getOutputTxId() {
        return this.claimTxId ?? null;
    }
    getOutputAddress() {
        return this._getInitiator();
    }
    requiresAction() {
        return this.isClaimable();
    }
    //////////////////////////////
    //// Amounts & fees
    getOutAmountWithoutFee() {
        return this.getSwapData().getAmount() + this.swapFee;
    }
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const inputWithoutFee = this.getInputWithoutFee();
        const swapFeePPM = inputWithoutFee.rawAmount == null ? 0n : feeWithoutBaseFee * 1000000n / inputWithoutFee.rawAmount;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc, this.inputToken, this.wrapper.prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee, this.wrapper.tokens[this.getSwapData().getToken()], this.wrapper.prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, this.inputToken, this.wrapper.prices, this.pricingInfo),
                percentage: (0, PercentagePPM_1.ppmToPercentage)(swapFeePPM)
            }
        };
    }
    getFee() {
        return this.getSwapFee();
    }
    getFeeBreakdown() {
        return [{
                type: FeeType_1.FeeType.SWAP,
                fee: this.getSwapFee()
            }];
    }
    getOutputToken() {
        return this.wrapper.tokens[this.getSwapData().getToken()];
    }
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getAmount(), this.wrapper.tokens[this.getSwapData().getToken()], this.wrapper.prices, this.pricingInfo);
    }
    getInputWithoutFee() {
        const input = this.getInput();
        if (input.rawAmount == null)
            return (0, TokenAmount_1.toTokenAmount)(null, this.inputToken, this.wrapper.prices, this.pricingInfo);
        return (0, TokenAmount_1.toTokenAmount)(input.rawAmount - this.swapFeeBtc, this.inputToken, this.wrapper.prices, this.pricingInfo);
    }
    getSecurityDeposit() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getSecurityDeposit(), this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo);
    }
    getTotalDeposit() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getTotalDeposit(), this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo);
    }
    async hasEnoughForTxFees() {
        const [balance, commitFee] = await Promise.all([
            this.wrapper.contract.getBalance(this._getInitiator(), this.wrapper.chain.getNativeCurrencyAddress(), false),
            this.getCommitFee()
        ]);
        const totalFee = commitFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: (0, TokenAmount_1.toTokenAmount)(balance, this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo),
            required: (0, TokenAmount_1.toTokenAmount)(totalFee, this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo)
        };
    }
    //////////////////////////////
    //// Commit
    /**
     * Returns the transactions required for committing the swap on-chain, locking the tokens from the intermediary
     *  in an HTLC or PTLC
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @throws {Error} When in invalid state to commit the swap
     */
    async txsCommit(skipChecks) {
        if (!this.canCommit())
            throw new Error("Must be in CREATED state!");
        if (this.data == null || this.signatureData == null)
            throw new Error("data or signature data is null, invalid state?");
        if (!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }
        return await this.wrapper.contract.txsInit(this._getInitiator(), this.data, this.signatureData, skipChecks, this.feeRate).catch(e => Promise.reject(e instanceof base_1.SignatureVerificationError ? new Error("Request timed out") : e));
    }
    //////////////////////////////
    //// Claim
    getClaimFee() {
        return this.wrapper.contract.getClaimFee(this._getInitiator(), this.getSwapData());
    }
}
exports.IFromBTCSelfInitSwap = IFromBTCSelfInitSwap;
