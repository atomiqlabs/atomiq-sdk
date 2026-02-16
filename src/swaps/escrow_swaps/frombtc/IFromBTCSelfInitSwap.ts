import {IFromBTCWrapper} from "./IFromBTCWrapper";
import {ChainType, SignatureVerificationError,} from "@atomiqlabs/base";
import {Fee} from "../../../types/fees/Fee";
import {IAddressSwap} from "../../IAddressSwap";
import {IEscrowSelfInitSwap, IEscrowSelfInitSwapDefinition, IEscrowSelfInitSwapInit} from "../IEscrowSelfInitSwap";
import {FeeType} from "../../../enums/FeeType";
import {ppmToPercentage} from "../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../types/TokenAmount";
import {BtcToken, SCToken} from "../../../types/Token";
import {IClaimableSwap} from "../../IClaimableSwap";

export type IFromBTCSelfInitDefinition<T extends ChainType, W extends IFromBTCWrapper<T, any>, S extends IFromBTCSelfInitSwap<T>> = IEscrowSelfInitSwapDefinition<T, W, S>;

/**
 * Base class for legacy escrow-based Bitcoin (on-chain & lightning) -> Smart chain swaps,
 *  which require the user to manually initiate the escrow on the destination smart chain
 *
 * @category Swaps/Abstract
 */
export abstract class IFromBTCSelfInitSwap<
    T extends ChainType = ChainType,
    D extends IFromBTCSelfInitDefinition<T, IFromBTCWrapper<T, D>, IFromBTCSelfInitSwap<T, D, S>> = IFromBTCSelfInitDefinition<T, IFromBTCWrapper<T, any>, IFromBTCSelfInitSwap<T, any, any>>,
    S extends number = number
> extends IEscrowSelfInitSwap<T, D, S> implements IAddressSwap, IClaimableSwap<T, D, S> {
    /**
     * @internal
     */
    protected abstract readonly inputToken: BtcToken;

    protected constructor(wrapper: D["Wrapper"], init: IEscrowSelfInitSwapInit<T["Data"]>);
    protected constructor(wrapper: D["Wrapper"], obj: any);
    protected constructor(
        wrapper: D["Wrapper"],
        initOrObj: IEscrowSelfInitSwapInit<T["Data"]> | any
    ) {
        super(wrapper, initOrObj);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected tryRecomputeSwapPrice() {
        const input = this.getInput();
        if(this.swapFeeBtc==null && input.rawAmount!=null) {
            this.swapFeeBtc = this.swapFee * input.rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * @inheritDoc
     */
    abstract getAddress(): string;

    /**
     * @inheritDoc
     */
    abstract getHyperlink(): string;

    /**
     * @inheritDoc
     */
    abstract isClaimable(): boolean;

    /**
     * Returns if the swap can be committed
     * @internal
     */
    protected abstract canCommit(): boolean;

    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string {
        return this.getSwapData().getClaimer();
    }

    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null {
        return this._claimTxId ?? null;
    }

    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null {
        return this._getInitiator();
    }

    /**
     * @inheritDoc
     */
    requiresAction(): boolean {
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
    protected getOutAmountWithoutFee(): bigint {
        return this.getSwapData().getAmount() + this.swapFee;
    }

    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate fee!");

        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const inputWithoutFee = this.getInputWithoutFee();
        const swapFeePPM = inputWithoutFee.rawAmount==null ? 0n : feeWithoutBaseFee * 1000000n / inputWithoutFee.rawAmount;

        const amountInSrcToken = toTokenAmount(this.swapFeeBtc, this.inputToken, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(this.swapFee, this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, this.inputToken, this.wrapper._prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    /**
     * @inheritDoc
     */
    getFee(): Fee {
        return this.getSwapFee();
    }

    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [{type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken, SCToken<T["ChainId"]>>}] {
        return [{
            type: FeeType.SWAP,
            fee: this.getSwapFee()
        }];
    }

    /**
     * @inheritDoc
     */
    getOutputToken(): SCToken<T["ChainId"]> {
        return this.wrapper._tokens[this.getSwapData().getToken()];
    }

    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(this.getSwapData().getAmount(), this.wrapper._tokens[this.getSwapData().getToken()], this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    abstract getInput(): TokenAmount<T["ChainId"], BtcToken>;

    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken> {
        const input = this.getInput();
        if(input.rawAmount==null) return toTokenAmount(null, this.inputToken, this.wrapper._prices, this.pricingInfo);
        return toTokenAmount(input.rawAmount - this.swapFeeBtc, this.inputToken, this.wrapper._prices, this.pricingInfo);
    }

    /**
     * @inheritDoc
     */
    async hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean,
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>,
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>
    }> {
        const [balance, commitFee] = await Promise.all([
            this.wrapper._contract.getBalance(this._getInitiator(), this.wrapper._chain.getNativeCurrencyAddress(), false),
            this.getCommitFee()
        ]);
        const totalFee = commitFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: toTokenAmount(balance, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo),
            required: toTokenAmount(totalFee, this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo)
        };
    }

    /**
     * Returns the amount of native token of the destination chain locked up during initialization of the escrow
     *  to act as a security deposit that can be taken by the intermediary (LP) if the user doesn't go through
     *  with the swap
     */
    getSecurityDeposit(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(this.getSwapData().getSecurityDeposit(), this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo);
    }

    /**
     * Returns the total amount of native token of the destination chain locked up during initialization of the escrow.
     *  This covers the security deposit and the watchtower fee (if applicable), it is calculated a maximum of those
     *  two values.
     */
    getTotalDeposit(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true> {
        return toTokenAmount(this.getSwapData().getTotalDeposit(), this.wrapper._getNativeToken(), this.wrapper._prices, this.pricingInfo);
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
    async txsCommit(skipChecks?: boolean): Promise<T["TX"][]> {
        if(!this.canCommit()) throw new Error("Must be in CREATED state!");
        if(this._data==null || this.signatureData==null) throw new Error("data or signature data is null, invalid state?");

        if(!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }

        return await this.wrapper._contract.txsInit(
            this._getInitiator(), this._data, this.signatureData, skipChecks, this.feeRate
        ).catch(e => Promise.reject(e instanceof SignatureVerificationError ? new Error("Request timed out") : e));
    }

    /**
     * Creates the escrow on the destination smart chain side, pre-locking the tokens from the intermediary (LP)
     *  into an escrow.
     *
     * @param signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited
     *  yet (this is handled on swap creation, if you commit right after quoting, you can use skipChecks=true)
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    abstract commit(signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean): Promise<string>;


    //////////////////////////////
    //// Claim

    /**
     * Returns the transaction fee required for the claim transaction to settle the escrow on the destination
     *  smart chain
     */
    async getClaimNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>> {
        const swapContract: T["Contract"] = this.wrapper._contract;
        return toTokenAmount(
            await swapContract.getClaimFee(this._getInitiator(), this.getSwapData()),
            this.wrapper._getNativeToken(),
            this.wrapper._prices
        );
    }

    /**
     * @inheritDoc
     */
    abstract txsClaim(signer?: T["Signer"]): Promise<T["TX"][]>;

    /**
     * @inheritDoc
     */
    abstract claim(signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;

    /**
     * @inheritDoc
     */
    abstract waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;

}
