import { IEscrowSwap, IEscrowSwapInit } from "./IEscrowSwap";
import { ChainType, SignatureData, SwapData } from "@atomiqlabs/base";
import { IEscrowSwapDefinition, IEscrowSwapWrapper } from "./IEscrowSwapWrapper";
import { SwapTypeDefinition } from "../ISwapWrapper";
import { TokenAmount } from "../../types/TokenAmount";
import { SCToken } from "../../types/Token";
export type IEscrowSelfInitSwapInit<T extends SwapData> = IEscrowSwapInit<T> & {
    feeRate: string;
    signatureData?: SignatureData;
};
export declare function isIEscrowSelfInitSwapInit<T extends SwapData>(obj: any): obj is IEscrowSelfInitSwapInit<T>;
export type IEscrowSelfInitSwapDefinition<T extends ChainType, W extends IEscrowSwapWrapper<T, any>, S extends IEscrowSelfInitSwap<T>> = SwapTypeDefinition<T, W, S>;
/**
 * Base class for escrow-based swaps (i.e. swaps utilizing PrTLC and HTLC primitives) where the
 *  user needs to initiate the escrow on the smart chain side
 *
 * @category Swaps/Abstract
 */
export declare abstract class IEscrowSelfInitSwap<T extends ChainType = ChainType, D extends IEscrowSelfInitSwapDefinition<T, IEscrowSwapWrapper<T, D>, IEscrowSelfInitSwap<T, D, S>> = IEscrowSwapDefinition<T, IEscrowSwapWrapper<T, any>, IEscrowSelfInitSwap<T, any, any>>, S extends number = number> extends IEscrowSwap<T, D, S> {
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
    /**
     * Periodically checks for init signature's expiry
     *
     * @param intervalSeconds How often to check (in seconds), default to 5s
     * @param abortSignal
     * @internal
     */
    protected watchdogWaitTillSignatureExpiry(intervalSeconds?: number, abortSignal?: AbortSignal): Promise<void>;
    /**
     * Get the estimated smart chain fee of the commit transaction
     * @internal
     */
    protected getCommitFee(): Promise<bigint>;
    /**
     * Returns the transaction fee paid on the smart chain side to initiate the escrow
     */
    getSmartChainNetworkFee(): Promise<TokenAmount<SCToken<T["ChainId"]>, true>>;
    /**
     * Checks if the initiator/sender has enough balance on the smart chain side
     *  to cover the transaction fee for processing the swap
     */
    abstract hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean;
        balance: TokenAmount<SCToken<T["ChainId"]>, true>;
        required: TokenAmount<SCToken<T["ChainId"]>, true>;
    }>;
    /**
     * Returns transactions for initiating (committing) the escrow on the smart chain side. After sending the
     *  transactions manually be sure to call the {@link waitTillCommited} function to wait till the initiation
     *  transaction is observed, processed by the SDK and state of the swap properly updated.
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
    abstract waitTillCommited(abortSignal?: AbortSignal): Promise<void>;
    /**
     * Checks if the swap's quote is expired for good (i.e. the swap strictly cannot be committed on-chain anymore)
     */
    _verifyQuoteDefinitelyExpired(): Promise<boolean>;
    /**
     * Checks if the swap's quote is still valid
     */
    _verifyQuoteValid(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    serialize(): any;
}
