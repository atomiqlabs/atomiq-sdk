import {IEscrowSwap, IEscrowSwapInit, isIEscrowSwapInit} from "./IEscrowSwap";
import {ChainType, SignatureData, SignatureVerificationError, SwapData} from "@atomiqlabs/base";
import {IEscrowSwapDefinition, IEscrowSwapWrapper} from "./IEscrowSwapWrapper";
import {SwapTypeDefinition} from "../ISwapWrapper";
import {TokenAmount, toTokenAmount} from "../../types/TokenAmount";
import {SCToken} from "../../types/Token";
import {timeoutPromise} from "../../utils/TimeoutUtils";

export type IEscrowSelfInitSwapInit<T extends SwapData> = IEscrowSwapInit<T> & {
    feeRate: string,
    signatureData?: SignatureData,
};

export function isIEscrowSelfInitSwapInit<T extends SwapData>(obj: any): obj is IEscrowSelfInitSwapInit<T> {
    return typeof obj === "object" &&
        typeof(obj.feeRate) === "string" &&
        (obj.signatureData == null || (
            typeof(obj.signatureData) === "object" &&
            typeof(obj.signatureData.prefix)==="string" &&
            typeof(obj.signatureData.timeout)==="string" &&
            typeof(obj.signatureData.signature)==="string"
        )) &&
        isIEscrowSwapInit(obj);
}

export type IEscrowSelfInitSwapDefinition<T extends ChainType, W extends IEscrowSwapWrapper<T, any>, S extends IEscrowSelfInitSwap<T>> = SwapTypeDefinition<T, W, S>;

/**
 * Base class for escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives) where the
 *  user needs to initiate the escrow on the smart chain side
 *
 * @category Swaps
 */
export abstract class IEscrowSelfInitSwap<
    T extends ChainType = ChainType,
    D extends IEscrowSelfInitSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSelfInitSwap<T, D, S>> = IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, any>, IEscrowSelfInitSwap<T, any, any>>,
    S extends number = number
> extends IEscrowSwap<T, D, S> {

    /**
     * Fee rate to be used for the escrow initiation transaction
     * @internal
     */
    protected readonly feeRate: string;
    /**
     * Signature data received from the intermediary (LP) allowing the user
     *  to initiate the swap escrow
     * @internal
     */
    protected signatureData?: SignatureData;

    protected constructor(wrapper: D["Wrapper"], obj: any);
    protected constructor(wrapper: D["Wrapper"], swapInit: IEscrowSelfInitSwapInit<T["Data"]>);
    protected constructor(
        wrapper: D["Wrapper"],
        swapInitOrObj: IEscrowSelfInitSwapInit<T["Data"]> | any,
    ) {
        super(wrapper, swapInitOrObj);

        if(isIEscrowSelfInitSwapInit(swapInitOrObj)) {
            this.feeRate = swapInitOrObj.feeRate;
            this.signatureData = swapInitOrObj.signatureData;
        } else {
            if(swapInitOrObj.signature!=null) this.signatureData ={
                prefix: swapInitOrObj.prefix,
                timeout: swapInitOrObj.timeout,
                signature: swapInitOrObj.signature
            };
            this.feeRate = swapInitOrObj.feeRate;
        }
    }

    //////////////////////////////
    //// Watchdogs

    /**
     * Periodically checks for init signature's expiry
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    protected async watchdogWaitTillSignatureExpiry(intervalSeconds?: number, abortSignal?: AbortSignal): Promise<void> {
        if(this._data==null || this.signatureData==null)
            throw new Error("Tried to await signature expiry but data or signature is null, invalid state?");

        intervalSeconds ??= 5;
        let expired = false
        while(!expired) {
            await timeoutPromise(intervalSeconds*1000, abortSignal);
            try {
                expired = await this.wrapper._contract.isInitAuthorizationExpired(this._data, this.signatureData);
            } catch (e) {
                this.logger.error("watchdogWaitTillSignatureExpiry(): Error when checking signature expiry: ", e);
            }
        }
        if(abortSignal!=null) abortSignal.throwIfAborted();
    }


    //////////////////////////////
    //// Amounts & fees

    /**
     * Get the estimated smart chain fee of the commit transaction
     * @internal
     */
    protected getCommitFee(): Promise<bigint> {
        return this.wrapper._contract.getCommitFee(this._getInitiator(), this.getSwapData(), this.feeRate);
    }

    /**
     * Returns the transaction fee paid on the smart chain side to initiate the escrow
     */
    async getSmartChainNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>> {
        const swapContract: T["Contract"] = this.wrapper._contract;
        return toTokenAmount(
            await (
                swapContract.getRawCommitFee!=null ?
                    swapContract.getRawCommitFee(this._getInitiator(), this.getSwapData(), this.feeRate) :
                    swapContract.getCommitFee(this._getInitiator(), this.getSwapData(), this.feeRate)
            ),
            this.wrapper._getNativeToken(),
            this.wrapper._prices
        );
    }

    /**
     * Checks if the initiator/sender has enough balance on the smart chain side
     *  to cover the transaction fee for processing the swap
     */
    abstract hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean,
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>,
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>
    }>;


    //////////////////////////////
    //// Commit and claim

    /**
     * Returns transactions for initiating (committing) the escrow on the smart chain side
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     */
    abstract txsCommit(skipChecks?: boolean): Promise<T["TX"][]>;

    /**
     * Initiates (commits) the escrow on the smart chain side
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled on swap creation, if you commit right after quoting, you can use `skipChecks=true`)
     * @param onBeforeTxSent Callback called before the transactions are broadcasted
     */
    abstract commit(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean, onBeforeTxSent?: (txId: string) => void): Promise<string>;

    /**
     * Waits till a swap is initiated (committed) on-chain, should be called after sending the commit
     *  transactions ({@link txsCommit}) manually to wait till the SDK processes the escrow
     *  initialization and updates the swap state accordingly
     *
     * @param abortSignal AbortSignal
     */
    abstract waitTillCommited(abortSignal?: AbortSignal): Promise<void>

    //////////////////////////////
    //// Quote verification

    /**
     * Checks if the swap's quote is expired for good (i.e. the swap strictly cannot be committed on-chain anymore)
     */
    async _verifyQuoteDefinitelyExpired(): Promise<boolean> {
        if(this._data==null || this.signatureData==null) throw new Error("data or signature data are null!");

        return this.wrapper._contract.isInitAuthorizationExpired(
            this._data!, this.signatureData!
        );
    }

    /**
     * Checks if the swap's quote is still valid
     */
    async _verifyQuoteValid(): Promise<boolean> {
        if(this._data==null || this.signatureData==null) throw new Error("data or signature data are null!");

        try {
            await this.wrapper._contract.isValidInitAuthorization(
                this._getInitiator(), this._data!, this.signatureData!, this.feeRate
            );
            return true;
        } catch (e) {
            if(e instanceof SignatureVerificationError) {
                return false;
            }
            throw e;
        }
    }

    /**
     * @inheritDoc
     */
    serialize(): any {
        return {
            ...super.serialize(),
            prefix: this.signatureData?.prefix,
            timeout: this.signatureData?.timeout,
            signature: this.signatureData?.signature,
            feeRate: this.feeRate==null ? null : this.feeRate.toString(),
        }
    };

}