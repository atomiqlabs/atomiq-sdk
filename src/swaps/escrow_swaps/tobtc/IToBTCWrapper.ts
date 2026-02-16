import {IToBTCSwap, ToBTCSwapState} from "./IToBTCSwap";
import {ChainType, ClaimEvent, InitializeEvent, RefundEvent} from "@atomiqlabs/base";
import {ISwapWrapperOptions, SwapTypeDefinition} from "../../ISwapWrapper";
import {Intermediary, SingleChainReputationType} from "../../../intermediaries/Intermediary";
import {IntermediaryError} from "../../../errors/IntermediaryError";
import {IEscrowSwapWrapper} from "../IEscrowSwapWrapper";
import {AmountData} from "../../../types/AmountData";

export type IToBTCDefinition<T extends ChainType, W extends IToBTCWrapper<T, any>, S extends IToBTCSwap<T>> = SwapTypeDefinition<T, W, S>;

/**
 * Base class for wrappers of escrow-based Smart chain -> Bitcoin (on-chain & lightning) swaps
 *
 * @category Swaps
 */
export abstract class IToBTCWrapper<
    T extends ChainType,
    D extends IToBTCDefinition<T, IToBTCWrapper<T, D>, IToBTCSwap<T, D>>,
    O extends ISwapWrapperOptions = ISwapWrapperOptions
> extends IEscrowSwapWrapper<T, D, O> {
    /**
     * @internal
     */
    protected readonly tickSwapState = [ToBTCSwapState.CREATED, ToBTCSwapState.COMMITED, ToBTCSwapState.SOFT_CLAIMED];

    /**
     * @internal
     */
    readonly _pendingSwapStates = [
        ToBTCSwapState.CREATED,
        ToBTCSwapState.QUOTE_SOFT_EXPIRED,
        ToBTCSwapState.COMMITED,
        ToBTCSwapState.SOFT_CLAIMED,
        ToBTCSwapState.REFUNDABLE
    ];
    /**
     * @internal
     */
    readonly _refundableSwapStates = [ToBTCSwapState.REFUNDABLE];

    /**
     * Pre-fetches intermediary's reputation, doesn't throw, instead aborts via abortController and returns null
     *
     * @param amountData
     * @param lp Intermediary
     * @param abortController
     * @returns Intermediary's reputation or null if failed
     * @throws {IntermediaryError} If the intermediary vault doesn't exist
     *
     * @internal
     */
    protected preFetchIntermediaryReputation(
        amountData: Omit<AmountData, "amount">,
        lp: Intermediary,
        abortController: AbortController
    ): Promise<SingleChainReputationType | undefined> {
        return lp.getReputation(this.chainIdentifier, this._contract, [amountData.token.toString()], abortController.signal).then(res => {
            if(res==null) throw new IntermediaryError("Invalid data returned - invalid LP vault");
            return res;
        }).catch(e => {
            this.logger.warn("preFetchIntermediaryReputation(): Error: ", e);
            abortController.abort(e);
            return undefined;
        });
    }

    /**
     * Pre-fetches feeRate for a given swap
     *
     * @param signer Address of the swap initiator
     * @param amountData
     * @param claimHash optional hash of the swap or null
     * @param abortController
     * @returns Fee rate
     *
     * @internal
     */
    protected preFetchFeeRate(signer: string, amountData: Omit<AmountData, "amount">, claimHash: string | undefined, abortController: AbortController): Promise<string | undefined> {
        return this._contract.getInitPayInFeeRate(signer, this._chain.randomAddress(), amountData.token, claimHash)
            .catch(e => {
                this.logger.warn("preFetchFeeRate(): Error: ", e);
                abortController.abort(e);
                return undefined;
            });
    }

    /**
     * @internal
     */
    protected async processEventInitialize(swap: D["Swap"], event: InitializeEvent<T["Data"]>): Promise<boolean> {
        if(swap._state===ToBTCSwapState.CREATED || swap._state===ToBTCSwapState.QUOTE_SOFT_EXPIRED) {
            swap._state = ToBTCSwapState.COMMITED;
            if(swap._commitTxId==null) swap._commitTxId = event.meta?.txId;
            return true;
        }
        return false;
    }

    /**
     * @internal
     */
    protected async processEventClaim(swap: D["Swap"], event: ClaimEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==ToBTCSwapState.REFUNDED && swap._state!==ToBTCSwapState.CLAIMED) {
            await swap._setPaymentResult({
                secret: event.result,
                txId: Buffer.from(event.result, "hex").reverse().toString("hex")
            }).catch(e => {
                this.logger.warn(`processEventClaim(): Failed to set payment result ${event.result}: `, e);
            });
            swap._state = ToBTCSwapState.CLAIMED;
            if(swap._claimTxId==null) swap._claimTxId = event.meta?.txId;
            return true;
        }
        return false;
    }

    /**
     * @internal
     */
    protected processEventRefund(swap: D["Swap"], event: RefundEvent<T["Data"]>): Promise<boolean> {
        if(swap._state!==ToBTCSwapState.CLAIMED && swap._state!==ToBTCSwapState.REFUNDED) {
            swap._state = ToBTCSwapState.REFUNDED;
            if(swap._refundTxId==null) swap._refundTxId = event.meta?.txId;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

}
