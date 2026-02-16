"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IFromBTCSelfInitSwap = void 0;
const base_1 = require("@atomiqlabs/base");
const IEscrowSelfInitSwap_1 = require("../IEscrowSelfInitSwap");
const FeeType_1 = require("../../../enums/FeeType");
const PercentagePPM_1 = require("../../../types/fees/PercentagePPM");
const TokenAmount_1 = require("../../../types/TokenAmount");
/**
 * Base class for legacy escrow-based Bitcoin (on-chain & lightning) -> Smart chain swaps,
 *  which require the user to manually initiate the escrow on the destination smart chain
 *
 * @category Swaps/Abstract
 */
class IFromBTCSelfInitSwap extends IEscrowSelfInitSwap_1.IEscrowSelfInitSwap {
    constructor(wrapper, initOrObj) {
        super(wrapper, initOrObj);
    }
    /**
     * @inheritDoc
     * @internal
     */
    tryRecomputeSwapPrice() {
        const input = this.getInput();
        if (this.swapFeeBtc == null && input.rawAmount != null) {
            this.swapFeeBtc = this.swapFee * input.rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator() {
        return this.getSwapData().getClaimer();
    }
    /**
     * @inheritDoc
     */
    getOutputTxId() {
        return this._claimTxId ?? null;
    }
    /**
     * @inheritDoc
     */
    getOutputAddress() {
        return this._getInitiator();
    }
    /**
     * @inheritDoc
     */
    requiresAction() {
        return this.isClaimable();
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * Returns the swap output amount in destination token based units without any fees, this
     *  value is therefore always higher than the actual received output.
     *
     * @internal
     */
    getOutAmountWithoutFee() {
        return this.getSwapData().getAmount() + this.swapFee;
    }
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    getSwapFee() {
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const inputWithoutFee = this.getInputWithoutFee();
        const swapFeePPM = inputWithoutFee.rawAmount == null ? 0n : feeWithoutBaseFee * 1000000n / inputWithoutFee.rawAmount;
        const amountInSrcToken = (0, TokenAmount_1.toTokenAmount)(this.swapFeeBtc, this.inputToken, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: (0, TokenAmount_1.toTokenAmount)(this.swapFee, this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: (0, TokenAmount_1.toTokenAmount)(this.pricingInfo.satsBaseFee, this.inputToken, this.wrapper._prices, this.pricingInfo),
                percentage: (0, PercentagePPM_1.ppmToPercentage)(swapFeePPM)
            }
        };
    }
    /**
     * @inheritDoc
     */
    getFee() {
        return this.getSwapFee();
    }
    /**
     * @inheritDoc
     */
    getFeeBreakdown() {
        return [{
                type: FeeType_1.FeeType.SWAP,
                fee: this.getSwapFee()
            }];
    }
    /**
     * @inheritDoc
     */
    getOutputToken() {
        return this.wrapper._tokens[this.getSwapData().getToken()];
    }
    /**
     * @inheritDoc
     */
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getAmount(), this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getInputWithoutFee() {
        const input = this.getInput();
        if (input.rawAmount == null)
            return (0, TokenAmount_1.toTokenAmount)(null, this.inputToken, this.wrapper._prices, this.pricingInfo);
        return (0, TokenAmount_1.toTokenAmount)(input.rawAmount - this.swapFeeBtc, this.inputToken, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    async hasEnoughForTxFees() {
        const [balance, commitFee] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this.wrapper._chain.getNativeCurrencyAddress(), false),
            this.getCommitFee()
        ]);
        const totalFee = commitFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: (0, TokenAmount_1.toTokenAmount)(balance, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo),
            required: (0, TokenAmount_1.toTokenAmount)(totalFee, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo)
        };
    }
    /**
     * Returns the amount of native token of the destination chain locked up during initialization of the escrow
     *  to act as a security deposit that can be taken by the intermediary (LP) if the user doesn't go through
     *  with the swap
     */
    getSecurityDeposit() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getSecurityDeposit(), this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Returns the total amount of native token of the destination chain locked up during initialization of the escrow.
     *  This covers the security deposit and the watchtower fee (if applicable), it is calculated a maximum of those
     *  two values.
     */
    getTotalDeposit() {
        return (0, TokenAmount_1.toTokenAmount)(this.getSwapData().getTotalDeposit(), this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo);
    }
    //////////////////////////////
    //// Commit
    /**
     * Returns transactions for initiating (committing) the escrow on the destination smart chain side, pre-locking the
     *  tokens from the intermediary (LP) into an escrow.
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited
     *  yet (this is handled on swap creation, if you commit right after quoting, you can use skipChecks=true)
     *
     * @throws {Error} When in invalid state to commit the swap
     */
    async txsCommit(skipChecks) {
        if (!this.canCommit())
            throw new Error("Must be in CREATED state!");
        if (this._data == null || this.signatureData == null)
            throw new Error("data or signature data is null, invalid state?");
        if (!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }
        return await this.wrapper._contract.txsInit(this._getInitiator(), this._data, this.signatureData, skipChecks, this.feeRate).catch(e => Promise.reject(e instanceof base_1.SignatureVerificationError ? new Error("Request timed out") : e));
    }
    //////////////////////////////
    //// Claim
    /**
     * Returns the transaction fee required for the claim transaction to settle the escrow on the destination
     *  smart chain
     */
    async getClaimNetworkFee() {
        const swapContract = this.wrapper._contract;
        return (0, TokenAmount_1.toTokenAmount)(await swapContract.getClaimFee(this._getInitiator(), this.getSwapData()), this.wrapper._getNativeToken(), this.wrapper._prices);
    }
}
exports.IFromBTCSelfInitSwap = IFromBTCSelfInitSwap;
