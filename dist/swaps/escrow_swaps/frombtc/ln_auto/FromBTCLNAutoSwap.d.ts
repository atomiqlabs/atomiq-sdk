/// <reference types="node" />
/// <reference types="node" />
import { SwapType } from "../../../../enums/SwapType";
import { ChainType, SwapCommitState, SwapData } from "@atomiqlabs/base";
import { Buffer } from "buffer";
import { Fee } from "../../../../types/fees/Fee";
import { IAddressSwap } from "../../../IAddressSwap";
import { FromBTCLNAutoDefinition, FromBTCLNAutoWrapper } from "./FromBTCLNAutoWrapper";
import { ISwapWithGasDrop } from "../../../ISwapWithGasDrop";
import { MinimalLightningNetworkWalletInterface } from "../../../../types/wallets/MinimalLightningNetworkWalletInterface";
import { IClaimableSwap } from "../../../IClaimableSwap";
import { IEscrowSwap, IEscrowSwapInit } from "../../IEscrowSwap";
import { FeeType } from "../../../../enums/FeeType";
import { TokenAmount } from "../../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../../types/Token";
import { LoggerType } from "../../../../utils/Logger";
import { LNURLWithdraw } from "../../../../types/lnurl/LNURLWithdraw";
import { PriceInfoType } from "../../../../types/PriceInfoType";
/**
 * State enum for FromBTCLNAuto swaps
 * @category Swaps/Lightning → Smart chain
 */
export declare enum FromBTCLNAutoSwapState {
    FAILED = -4,
    QUOTE_EXPIRED = -3,
    QUOTE_SOFT_EXPIRED = -2,
    EXPIRED = -1,
    PR_CREATED = 0,
    PR_PAID = 1,
    CLAIM_COMMITED = 2,
    CLAIM_CLAIMED = 3
}
export type FromBTCLNAutoSwapInit<T extends SwapData> = IEscrowSwapInit<T> & {
    pr?: string;
    secret?: string;
    initialSwapData: T;
    btcAmountSwap?: bigint;
    btcAmountGas?: bigint;
    gasSwapFeeBtc: bigint;
    gasSwapFee: bigint;
    gasPricingInfo?: PriceInfoType;
    lnurl?: string;
    lnurlK1?: string;
    lnurlCallback?: string;
};
export declare function isFromBTCLNAutoSwapInit<T extends SwapData>(obj: any): obj is FromBTCLNAutoSwapInit<T>;
/**
 * New escrow based (HTLC) swaps for Bitcoin Lightning -> Smart chain swaps not requiring manual settlement on
 *  the destination by the user, and instead letting the LP initiate the escrow. Permissionless watchtower network
 *  handles the claiming of HTLC, with the swap secret broadcasted over Nostr. Also adds a possibility for the user
 *  to receive a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Lightning → Smart chain
 */
export declare class FromBTCLNAutoSwap<T extends ChainType = ChainType> extends IEscrowSwap<T, FromBTCLNAutoDefinition<T>> implements IAddressSwap, ISwapWithGasDrop<T>, IClaimableSwap<T, FromBTCLNAutoDefinition<T>, FromBTCLNAutoSwapState> {
    protected readonly TYPE: SwapType.FROM_BTCLN_AUTO;
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
    private readonly btcAmountSwap?;
    private readonly btcAmountGas?;
    private readonly gasSwapFeeBtc;
    private readonly gasSwapFee;
    private readonly gasPricingInfo?;
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
    private broadcastTickCounter;
    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl: string, lnurlK1: string, lnurlCallback: string): void;
    constructor(wrapper: FromBTCLNAutoWrapper<T>, init: FromBTCLNAutoSwapInit<T["Data"]>);
    constructor(wrapper: FromBTCLNAutoWrapper<T>, obj: any);
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
    protected tryRecomputeSwapPrice(): void;
    /**
     * @inheritDoc
     */
    refreshPriceData(): Promise<void>;
    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash(): string | null;
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string;
    /**
     * @inheritDoc
     */
    getId(): string;
    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null;
    /**
     * @inheritDoc
     */
    requiresAction(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    protected getIdentifierHashString(): string;
    /**
     * Returns the payment hash of the swap and lightning network invoice, or `null` if not known (i.e. if
     *  the swap was recovered from on-chain data, the payment hash might not be known)
     *
     * @internal
     */
    protected getPaymentHash(): Buffer | null;
    /**
     * @inheritDoc
     */
    getInputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getInputTxId(): string | null;
    /**
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress(): string;
    /**
     * @inheritDoc
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
     */
    _verifyQuoteDefinitelyExpired(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    _verifyQuoteValid(): Promise<boolean>;
    /**
     * Returns the satoshi amount of the lightning network invoice, or `null` if the lightning network
     *  invoice is not known (i.e. when the swap was recovered from on-chain data, the paid invoice
     *  cannot be recovered because it is purely off-chain)
     *
     * @internal
     */
    protected getLightningInvoiceSats(): bigint | null;
    /**
     * Returns the watchtower fee paid in BTC satoshis, or null if known (i.e. if the swap was recovered from
     *  on-chain data)
     *
     * @protected
     */
    protected getWatchtowerFeeAmountBtc(): bigint | null;
    /**
     * Returns the input amount for the actual swap (excluding the input amount used to cover the "gas drop"
     *  part of the swap), excluding fees
     *
     * @internal
     */
    protected getInputSwapAmountWithoutFee(): bigint | null;
    /**
     * Returns the input amount purely for the "gas drop" part of the swap (this much BTC in sats will be
     *  swapped into the native gas token on the destination chain), excluding fees
     *
     * @internal
     */
    protected getInputGasAmountWithoutFee(): bigint | null;
    /**
     * Get total btc amount in sats on the input, excluding the swap fee and watchtower fee
     *
     * @internal
     */
    protected getInputAmountWithoutFee(): bigint | null;
    /**
     * Returns the "would be" output amount if the swap charged no swap fee
     *
     * @internal
     */
    protected getOutputAmountWithoutFee(): bigint;
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
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<true>>;
    /**
     * @inheritDoc
     */
    getOutputToken(): SCToken<T["ChainId"]>;
    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    /**
     * @inheritDoc
     */
    getGasDropOutput(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
    /**
     * Returns the fee to be paid to watchtowers on the destination chain to automatically
     *  process and settle this swap without requiring any user interaction
     *
     * @internal
     */
    protected getWatchtowerFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [
        {
            type: FeeType.SWAP;
            fee: Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
        },
        {
            type: FeeType.NETWORK_OUTPUT;
            fee: Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
        }
    ];
    private isValidSecretPreimage;
    /**
     * Executes the swap with the provided bitcoin lightning network wallet or LNURL
     *
     * @param walletOrLnurlWithdraw Bitcoin lightning wallet to use to pay the lightning network invoice, or an LNURL-withdraw
     *  link, wallet is not required and the LN invoice can be paid externally as well (just pass null or undefined here)
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     * @param secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call `swap.claim()` to settle the swap on the destination manually
     */
    execute(walletOrLnurlWithdraw?: MinimalLightningNetworkWalletInterface | LNURLWithdraw | string | null | undefined, callbacks?: {
        onSourceTransactionReceived?: (sourceTxId: string) => void;
        onSwapSettled?: (destinationTxId: string) => void;
    }, options?: {
        abortSignal?: AbortSignal;
        lightningTxCheckIntervalSeconds?: number;
        maxWaitTillAutomaticSettlementSeconds?: number;
    }, secret?: string): Promise<boolean>;
    /**
     * @inheritDoc
     */
    txsExecute(): Promise<{
        name: "Payment";
        description: string;
        chain: "LIGHTNING";
        txs: {
            type: "BOLT11_PAYMENT_REQUEST";
            address: string;
            hyperlink: string;
        }[];
    }[]>;
    /**
     * Checks whether the LP received the LN payment
     *
     * @param save If the new swap state should be saved
     *
     * @internal
     */
    _checkIntermediaryPaymentReceived(save?: boolean): Promise<boolean | null>;
    /**
     * Checks and overrides the swap data for this swap. This is used to set the swap data from
     *  on-chain events.
     *
     * @param data Swap data of the escrow swap
     * @param save If the new data should be saved
     *
     * @internal
     */
    _saveRealSwapData(data: T["Data"], save?: boolean): Promise<boolean>;
    /**
     * Checks the data returned by the intermediary in the payment auth request
     *
     * @param data Parsed swap data as returned by the intermediary
     *
     * @throws {IntermediaryError} If the returned are not valid
     * @throws {Error} If the swap is already committed on-chain
     *
     * @private
     */
    private checkIntermediaryReturnedData;
    /**
     * Waits till a lightning network payment is received by the intermediary, and the intermediary
     *  initiates the swap HTLC on the smart chain side. After the HTLC is initiated you can wait
     *  for an automatic settlement by the watchtowers with the {@link waitTillClaimed} function,
     *  or settle manually using the {@link claim} or {@link txsClaim} functions.
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
     * Waits till the intermediary (LP) initiates the swap HTLC escrow on the destination smart chain side
     *
     * @param checkIntervalSeconds How often to check via a polling watchdog
     * @param abortSignal Abort signal
     *
     * @internal
     */
    protected waitTillCommited(checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<void>;
    /**
     * @inheritDoc
     *
     * @param _signer Optional signer address to use for claiming the swap, can also be different from the initializer
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If in invalid state (must be {@link FromBTCLNAutoSwapState.CLAIM_COMMITED})
     */
    txsClaim(_signer?: T["Signer"] | T["NativeSigner"], secret?: string): Promise<T["TX"][]>;
    /**
     * @inheritDoc
     *
     * @param _signer Signer to sign the transactions with, can also be different to the initializer
     * @param abortSignal Abort signal to stop waiting for transaction confirmation
     * @param onBeforeTxSent
     * @param secret A swap secret to use for the claim transaction, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     */
    claim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void, secret?: string): Promise<string>;
    /**
     * Waits till the swap is successfully settled (claimed), should be called after sending the claim (settlement)
     *  transactions manually to wait till the SDK processes the settlement and updates the swap state accordingly.
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal AbortSignal
     * @param secret A swap secret to broadcast to watchtowers, generally only needed if the swap
     *  was recovered from on-chain data, or the pre-image was generated outside the SDK
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCLNAutoSwapState.CLAIM_COMMITED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     * @returns {boolean} whether the swap was claimed in time or not
     */
    waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal, secret?: string): Promise<boolean>;
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
    _shouldFetchOnchainState(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus(): boolean;
    /**
     * @inheritDoc
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
     * Broadcasts the swap secret to the underlying data propagation layer (e.g. Nostr by default)
     *
     * @param noCheckExpiry Whether a swap expiration check should be skipped broadcasting
     * @param secret An optional secret pre-image for the swap to broadcast
     *
     * @internal
     */
    _broadcastSecret(noCheckExpiry?: boolean, secret?: string): Promise<void>;
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
