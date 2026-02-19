/// <reference types="node" />
/// <reference types="node" />
import { FromBTCLNDefinition, FromBTCLNWrapper } from "./FromBTCLNWrapper";
import { IFromBTCSelfInitSwap } from "../IFromBTCSelfInitSwap";
import { SwapType } from "../../../../enums/SwapType";
import { ChainType, SignatureData, SwapCommitState, SwapData } from "@atomiqlabs/base";
import { Buffer } from "buffer";
import { MinimalLightningNetworkWalletInterface } from "../../../../types/wallets/MinimalLightningNetworkWalletInterface";
import { IClaimableSwap } from "../../../IClaimableSwap";
import { IAddressSwap } from "../../../IAddressSwap";
import { IEscrowSelfInitSwapInit } from "../../IEscrowSelfInitSwap";
import { TokenAmount } from "../../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../../types/Token";
import { LoggerType } from "../../../../utils/Logger";
import { LNURLWithdraw } from "../../../../types/lnurl/LNURLWithdraw";
import { SwapExecutionAction } from "../../../../types/SwapExecutionAction";
/**
 * State enum for legacy Lightning -> Smart chain swaps
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export declare enum FromBTCLNSwapState {
    /**
     * Swap has failed as the user didn't settle the HTLC on the destination before expiration
     */
    FAILED = -4,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -3,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -2,
    /**
     * Swap HTLC on the destination chain has expired, it is not safe anymore to settle (claim) the
     *  swap on the destination smart chain.
     */
    EXPIRED = -1,
    /**
     * Swap quote was created, use {@link FromBTCLNSwap.getAddress} or {@link FromBTCLNSwap.getHyperlink}
     *  to get the bolt11 lightning network invoice to pay to initiate the swap, then use the
     *  {@link FromBTCLNSwap.waitForPayment} to wait till the lightning network payment is received
     *  by the intermediary (LP)
     */
    PR_CREATED = 0,
    /**
     * Lightning network payment has been received by the intermediary (LP), the user can now settle
     *  the swap on the destination smart chain side with {@link FromBTCLNSwap.commitAndClaim} (if
     *  the underlying chain supports it - check with {@link FromBTCLNSwap.canCommitAndClaimInOneShot}),
     *  or by calling {@link FromBTCLNSwap.commit} and {@link FromBTCLNSwap.claim} separately.
     */
    PR_PAID = 1,
    /**
     * Swap escrow HTLC has been created on the destination chain. Continue by claiming it with the
     *  {@link FromBTCLNSwap.claim} or {@link FromBTCLNSwap.txsClaim} function.
     */
    CLAIM_COMMITED = 2,
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    CLAIM_CLAIMED = 3
}
export type FromBTCLNSwapInit<T extends SwapData> = IEscrowSelfInitSwapInit<T> & {
    pr?: string;
    secret?: string;
    initialSwapData: T;
    lnurl?: string;
    lnurlK1?: string;
    lnurlCallback?: string;
};
export declare function isFromBTCLNSwapInit<T extends SwapData>(obj: any): obj is FromBTCLNSwapInit<T>;
/**
 * Legacy escrow (HTLC) based swap for Bitcoin Lightning -> Smart chains, requires manual settlement
 *  of the swap on the destination network once the lightning network payment is received by the LP.
 *
 * @category Swaps/Legacy/Lightning → Smart chain
 */
export declare class FromBTCLNSwap<T extends ChainType = ChainType> extends IFromBTCSelfInitSwap<T, FromBTCLNDefinition<T>, FromBTCLNSwapState> implements IAddressSwap, IClaimableSwap<T, FromBTCLNDefinition<T>, FromBTCLNSwapState> {
    protected readonly TYPE = SwapType.FROM_BTCLN;
    /**
     * @internal
     */
    protected readonly swapStateName: (state: number) => string;
    /**
     * @internal
     */
    protected readonly swapStateDescription: {
        [-4]: string;
        [-3]: string;
        [-2]: string;
        [-1]: string;
        0: string;
        1: string;
        2: string;
        3: string;
    };
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    /**
     * @internal
     */
    protected readonly inputToken: BtcToken<true>;
    private readonly lnurlFailSignal;
    private readonly usesClaimHashAsId;
    private readonly initialSwapData;
    /**
     * In case the swap is recovered from on-chain data, the pr saved here is just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data
     * @private
     */
    private pr?;
    private secret?;
    private lnurl?;
    private lnurlK1?;
    private lnurlCallback?;
    private prPosted?;
    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl: string, lnurlK1: string, lnurlCallback: string): void;
    constructor(wrapper: FromBTCLNWrapper<T>, init: FromBTCLNSwapInit<T["Data"]>);
    constructor(wrapper: FromBTCLNWrapper<T>, obj: any);
    /**
     * @inheritDoc
     * @internal
     */
    protected getSwapData(): T["Data"];
    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion(): void;
    /**
     * @inheritDoc
     * @internal
     */
    protected getIdentifierHash(): Buffer;
    /**
     * Returns the payment hash of the swap and lightning network invoice, or `null` if not known (i.e. if
     *  the swap was recovered from on-chain data, the payment hash might not be known)
     *
     * @internal
     */
    protected getPaymentHash(): Buffer | null;
    /**
     * @inheritDoc
     * @internal
     */
    protected canCommit(): boolean;
    /**
     * @inheritDoc
     */
    getInputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getInputTxId(): string | null;
    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap.
     *
     * In case the swap is recovered from on-chain data, the address returned might be just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data.
     */
    getAddress(): string;
    /**
     * A hyperlink representation of the address + amount that the user needs to sends on the source chain.
     *  This is suitable to be displayed in a form of QR code.
     *
     * @remarks
     * In case the swap is recovered from on-chain data, the address returned might be just a payment hash,
     *  as it is impossible to retrieve the actual lightning network invoice paid purely from on-chain
     *  data.
     */
    getHyperlink(): string;
    /**
     * Returns the timeout time (in UNIX milliseconds) when the swap will definitelly be considered as expired
     *  if the LP doesn't make it expired sooner
     */
    getDefinitiveExpiryTime(): number;
    /**
     * Returns timeout time (in UNIX milliseconds) when the swap htlc will expire
     */
    getHtlcTimeoutTime(): number | null;
    /**
     * Returns timeout time (in UNIX milliseconds) when the LN invoice will expire
     */
    getTimeoutTime(): number;
    /**
     * @inheritDoc
     */
    isFinished(): boolean;
    /**
     * @inheritDoc
     */
    isClaimable(): boolean;
    /**
     * @inheritDoc
     */
    isSuccessful(): boolean;
    /**
     * @inheritDoc
     */
    isFailed(): boolean;
    /**
     * @inheritDoc
     */
    isQuoteExpired(): boolean;
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteDefinitelyExpired(): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _verifyQuoteValid(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getInputToken(): BtcToken<true>;
    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<true>>;
    /**
     * @inheritDoc
     */
    getSmartChainNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>>;
    /**
     * @inheritDoc
     */
    hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean;
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    }>;
    private isValidSecretPreimage;
    /**
     * Sets the secret preimage for the swap, in case it is not known already
     *
     * @param secret Secret preimage that matches the expected payment hash
     *
     * @throws {Error} If an invalid secret preimage is provided
     */
    setSecretPreimage(secret: string): void;
    /**
     * Returns whether the secret preimage for this swap is known
     */
    hasSecretPreimage(): boolean;
    /**
     * Executes the swap with the provided bitcoin lightning network wallet or LNURL
     *
     * @param dstSigner Signer on the destination network, needs to have the same address as the one specified when
     *  quote was created, this is required for legacy swaps because the destination wallet needs to actively claim
     *  the swap funds on the destination (this also means you need native token to cover gas costs)
     * @param walletOrLnurlWithdraw Bitcoin lightning wallet to use to pay the lightning network invoice, or an LNURL-withdraw
     *  link, wallet is not required and the LN invoice can be paid externally as well (just pass null or undefined here)
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    execute(dstSigner: T["Signer"] | T["NativeSigner"], walletOrLnurlWithdraw?: MinimalLightningNetworkWalletInterface | LNURLWithdraw | string | null | undefined, callbacks?: {
        onSourceTransactionReceived?: (sourceTxId: string) => void;
        onDestinationCommitSent?: (destinationCommitTxId: string) => void;
        onDestinationClaimSent?: (destinationClaimTxId: string) => void;
        onSwapSettled?: (destinationTxId: string) => void;
    }, options?: {
        abortSignal?: AbortSignal;
        secret?: string;
        lightningTxCheckIntervalSeconds?: number;
        delayBetweenCommitAndClaimSeconds?: number;
    }): Promise<void>;
    /**
     * @inheritDoc
     *
     * @param options
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    txsExecute(options?: {
        skipChecks?: boolean;
        secret?: string;
    }): Promise<{
        name: "Payment";
        description: string;
        chain: "LIGHTNING";
        txs: {
            type: "BOLT11_PAYMENT_REQUEST";
            address: string;
            hyperlink: string;
        }[];
    }[] | ({
        name: "Commit";
        description: string;
        chain: T["ChainId"];
        txs: T["TX"][];
    } | {
        name: "Claim";
        description: string;
        chain: T["ChainId"];
        txs: T["TX"][];
    })[]>;
    /**
     * @inheritDoc
     *
     * @param options
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     * @param options.secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    getCurrentActions(options?: {
        skipChecks?: boolean;
        secret?: string;
    }): Promise<SwapExecutionAction<T>[]>;
    /**
     * Checks whether the LP received the LN payment and we can continue by committing & claiming the HTLC on-chain
     *
     * @param save If the new swap state should be saved
     *
     * @internal
     */
    _checkIntermediaryPaymentReceived(save?: boolean): Promise<boolean | null>;
    /**
     * Checks the data returned by the intermediary in the payment auth request
     *
     * @param signer Smart chain signer's address initiating the swap
     * @param data Parsed swap data as returned by the intermediary
     * @param signature Signature data as returned by the intermediary
     *
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {SignatureVerificationError} If the returned signature is not valid
     * @throws {Error} If the swap is already committed on-chain
     *
     * @internal
     */
    protected checkIntermediaryReturnedAuthData(signer: string, data: T["Data"], signature: SignatureData): Promise<void>;
    /**
     * Waits till a lightning network payment is received by the intermediary and client
     *  can continue by initiating (committing) & settling (claiming) the HTLC by calling
     *  either the {@link commitAndClaim} function (if the underlying chain allows commit
     *  and claim in a single transaction - check with {@link canCommitAndClaimInOneShot}).
     *  Or call {@link commit} and then {@link claim} separately.
     *
     * If this swap is using an LNURL-withdraw link as input, it automatically posts the
     *  generated invoice to the LNURL service to pay it.
     *
     * @param onPaymentReceived Callback as for when the LP reports having received the ln payment
     * @param abortSignal Abort signal to stop waiting for payment
     * @param checkIntervalSeconds How often to poll the intermediary for answer (default 5 seconds)
     */
    waitForPayment(onPaymentReceived?: (txId: string) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    commit(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean, onBeforeTxSent?: (txId: string) => void): Promise<string>;
    /**
     * @inheritDoc
     */
    waitTillCommited(abortSignal?: AbortSignal): Promise<void>;
    /**
     * Unsafe txs claim getter without state checking!
     *
     * @param _signer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @internal
     */
    private _txsClaim;
    /**
     * @inheritDoc
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be {@link FromBTCLNSwapState.CLAIM_COMMITED})
     */
    txsClaim(_signer?: T["Signer"] | T["NativeSigner"], secret?: string): Promise<T["TX"][]>;
    /**
     * @inheritDoc
     *
     * @param _signer
     * @param abortSignal
     * @param onBeforeTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    claim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void, secret?: string): Promise<string>;
    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCLNSwapState.CLAIM_COMMITED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     */
    waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * Estimated transaction fee for commit & claim transactions combined, required
     *  to settle the swap on the smart chain destination side.
     */
    getCommitAndClaimNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>>;
    /**
     * Returns whether the underlying chain supports calling commit and claim in a single call,
     *  such that you can use the {@link commitAndClaim} function. If not you have to manually
     *  call {@link commit} first and then {@link claim}.
     */
    canCommitAndClaimInOneShot(): boolean;
    /**
     * Returns transactions for both commit & claim operation together, such that they can be signed all at once by
     *  the wallet. **WARNING**: transactions must be sent sequentially, such that the claim (2nd) transaction is only
     *  sent after the commit (1st) transaction confirms. Failure to do so can reveal the HTLC pre-image too soon,
     *  opening a possibility for the LP to steal funds!
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     */
    txsCommitAndClaim(skipChecks?: boolean, secret?: string): Promise<T["TX"][]>;
    /**
     * Commits and claims the swap, in a way that the transactions can be signed together by the provided signer and
     *  then automatically sent sequentially by the SDK. To check if the underlying chain supports this flow check
     *  the {@link canCommitAndClaimInOneShot} function.
     *
     * @param _signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal to stop waiting for the transaction confirmation and abort
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited yet
     *  (this is handled when swap is created (quoted), if you commit right after quoting, you can use skipChecks=true)
     * @param onBeforeCommitTxSent Optional callback called before the initialization (commit) transaction is
     *  broadcasted
     * @param onBeforeClaimTxSent Optional callback called before the settlement (claim) transaction is
     *  broadcasted
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be PR_PAID or CLAIM_COMMITED)
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    commitAndClaim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean, onBeforeCommitTxSent?: (txId: string) => void, onBeforeClaimTxSent?: (txId: string) => void, secret?: string): Promise<string[]>;
    /**
     * Whether this swap uses an LNURL-withdraw link
     */
    isLNURL(): boolean;
    /**
     * Gets the used LNURL or `null` if this is not an LNURL-withdraw swap
     */
    getLNURL(): string | null;
    /**
     * Pay the generated lightning network invoice with an LNURL-withdraw link, this
     *  is useful when you want to display a lightning payment QR code and also want to
     *  allow payments using LNURL-withdraw NFC cards.
     *
     * Note that the swap needs to be created **without** an LNURL to begin with for this function
     *  to work. If this swap is already using an LNURL-withdraw link, this function throws.
     */
    settleWithLNURLWithdraw(lnurl: string | LNURLWithdraw): Promise<void>;
    /**
     * @inheritDoc
     */
    serialize(): any;
    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     *
     * @private
     */
    private syncStateFromChain;
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState(): boolean;
    /**
     * Whether an intermediary (LP) should be contacted to get the state of this swap.
     *
     * @internal
     */
    _shouldCheckIntermediary(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState, skipLpCheck?: boolean): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _forciblySetOnchainState(commitStatus: SwapCommitState): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _tick(save?: boolean): Promise<boolean>;
    /**
     * Forcibly sets the swap secret pre-image from on-chain data
     *
     * @internal
     */
    _setSwapSecret(secret: string): void;
}
