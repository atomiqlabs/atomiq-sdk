import {IFromBTCWrapper} from "./IFromBTCWrapper";
import {ChainType, SignatureVerificationError,} from "@atomiqlabs/base";
import {Fee} from "../../../types/fees/Fee";
import {IAddressSwap} from "../../IAddressSwap";
import {IEscrowSelfInitSwap, IEscrowSelfInitSwapDefinition, IEscrowSelfInitSwapInit} from "../IEscrowSelfInitSwap";
import {FeeType} from "../../../enums/FeeType";
import {ppmToPercentage} from "../../../types/fees/PercentagePPM";
import {TokenAmount, toTokenAmount} from "../../../types/TokenAmount";
import {BtcToken, SCToken} from "../../../types/Token";

export type IFromBTCSelfInitDefinition<T extends ChainType, W extends IFromBTCWrapper<T, any>, S extends IFromBTCSelfInitSwap<T>> = IEscrowSelfInitSwapDefinition<T, W, S>;

export abstract class IFromBTCSelfInitSwap<
    T extends ChainType = ChainType,
    D extends IFromBTCSelfInitDefinition<T, IFromBTCWrapper<T, D>, IFromBTCSelfInitSwap<T, D, S>> = IFromBTCSelfInitDefinition<T, IFromBTCWrapper<T, any>, IFromBTCSelfInitSwap<T, any, any>>,
    S extends number = number
> extends IEscrowSelfInitSwap<T, D, S> implements IAddressSwap {
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
     * In case swapFee in BTC is not supplied it recalculates it based on swap price
     * @protected
     */
    protected tryRecomputeSwapPrice() {
        if(this.swapFeeBtc==null) {
            this.swapFeeBtc = this.swapFee * this.getInput().rawAmount / this.getOutAmountWithoutFee();
        }
        super.tryRecomputeSwapPrice();
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * Returns the bitcoin address or lightning invoice to be paid for the swap
     */
    abstract getAddress(): string;

    /**
     * Returns a string that can be displayed as QR code representation of the address or lightning invoice
     *  (with bitcoin: or lightning: prefix)
     */
    abstract getHyperlink(): string;

    abstract isClaimable(): boolean;

    /**
     * Returns if the swap can be committed
     */
    protected abstract canCommit(): boolean;

    _getInitiator(): string {
        return this.getSwapData().getClaimer();
    }

    getOutputTxId(): string | null {
        return this.claimTxId ?? null;
    }

    getOutputAddress(): string | null {
        return this._getInitiator();
    }

    requiresAction(): boolean {
        return this.isClaimable();
    }


    //////////////////////////////
    //// Amounts & fees

    protected getOutAmountWithoutFee(): bigint {
        return this.getSwapData().getAmount() + this.swapFee;
    }

    protected getSwapFee(): Fee<T["ChainId"], BtcToken, SCToken<T["ChainId"]>> {
        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate fee!");

        const feeWithoutBaseFee = this.swapFeeBtc - this.pricingInfo.satsBaseFee;
        const swapFeePPM = feeWithoutBaseFee * 1000000n / this.getInputWithoutFee().rawAmount;

        const amountInSrcToken = toTokenAmount(this.swapFeeBtc, this.inputToken, this.wrapper.prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(this.swapFee, this.wrapper.tokens[this.getSwapData().getToken()], this.wrapper.prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue,
            composition: {
                base: toTokenAmount(this.pricingInfo.satsBaseFee, this.inputToken, this.wrapper.prices, this.pricingInfo),
                percentage: ppmToPercentage(swapFeePPM)
            }
        };
    }

    getFee(): Fee {
        return this.getSwapFee();
    }

    getFeeBreakdown(): [{type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken, SCToken<T["ChainId"]>>}] {
        return [{
            type: FeeType.SWAP,
            fee: this.getSwapFee()
        }];
    }

    getOutputToken(): SCToken<T["ChainId"]> {
        return this.wrapper.tokens[this.getSwapData().getToken()];
    }

    getOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>> {
        return toTokenAmount(this.getSwapData().getAmount(), this.wrapper.tokens[this.getSwapData().getToken()], this.wrapper.prices, this.pricingInfo);
    }

    abstract getInput(): TokenAmount<T["ChainId"], BtcToken>;

    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken> {
        return toTokenAmount(this.getInput().rawAmount - this.swapFeeBtc, this.inputToken, this.wrapper.prices, this.pricingInfo);
    }

    getSecurityDeposit(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>> {
        return toTokenAmount(this.getSwapData().getSecurityDeposit(), this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo);
    }

    getTotalDeposit(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>> {
        return toTokenAmount(this.getSwapData().getTotalDeposit(), this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo);
    }

    async hasEnoughForTxFees(): Promise<{enoughBalance: boolean, balance: TokenAmount, required: TokenAmount}> {
        const [balance, commitFee] = await Promise.all([
            this.wrapper.contract.getBalance(this._getInitiator(), this.wrapper.chain.getNativeCurrencyAddress(), false),
            this.getCommitFee()
        ]);
        const totalFee = commitFee + this.getSwapData().getTotalDeposit();
        return {
            enoughBalance: balance >= totalFee,
            balance: toTokenAmount(balance, this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo),
            required: toTokenAmount(totalFee, this.wrapper.getNativeToken(), this.wrapper.prices, this.pricingInfo)
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
    async txsCommit(skipChecks?: boolean): Promise<T["TX"][]> {
        if(!this.canCommit()) throw new Error("Must be in CREATED state!");
        if(this.data==null || this.signatureData==null) throw new Error("data or signature data is null, invalid state?");

        if(!this.initiated) {
            this.initiated = true;
            await this._saveAndEmit();
        }

        return await this.wrapper.contract.txsInit(
            this._getInitiator(), this.data, this.signatureData, skipChecks, this.feeRate
        ).catch(e => Promise.reject(e instanceof SignatureVerificationError ? new Error("Request timed out") : e));
    }

    /**
     * Commits the swap on-chain, locking the tokens from the intermediary in an HTLC or PTLC
     *
     * @param signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal to stop waiting for the transaction confirmation and abort
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    abstract commit(signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean): Promise<string>;

    abstract waitTillCommited(abortSignal?: AbortSignal): Promise<void>;


    //////////////////////////////
    //// Claim

    getClaimFee(): Promise<bigint> {
        return this.wrapper.contract.getClaimFee(this._getInitiator(), this.getSwapData());
    }

    abstract txsClaim(signer?: T["Signer"]): Promise<T["TX"][]>;

    /**
     * Claims and finishes the swap
     *
     * @param signer Signer to sign the transactions with, can also be different to the initializer
     * @param abortSignal Abort signal to stop waiting for transaction confirmation
     */
    abstract claim(signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;

    /**
     * Waits till the swap is successfully claimed
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal AbortSignal
     * @throws {Error} If swap is in invalid state (must be COMMIT)
     * @returns {boolean} whether the swap was claimed in time or not
     */
    abstract waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;

}
