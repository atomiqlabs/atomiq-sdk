import { IFromBTCSelfInitSwap } from "../IFromBTCSelfInitSwap";
import { SwapType } from "../../../../enums/SwapType";
import { FromBTCDefinition, FromBTCWrapper } from "./FromBTCWrapper";
import { ChainType, SwapCommitState, SwapData } from "@atomiqlabs/base";
import { IBitcoinWallet } from "../../../../bitcoin/wallet/IBitcoinWallet";
import { IBTCWalletSwap } from "../../../IBTCWalletSwap";
import { Transaction } from "@scure/btc-signer";
import { MinimalBitcoinWalletInterface, MinimalBitcoinWalletInterfaceWithSigner } from "../../../../types/wallets/MinimalBitcoinWalletInterface";
import { IClaimableSwap } from "../../../IClaimableSwap";
import { IEscrowSelfInitSwapInit } from "../../IEscrowSelfInitSwap";
import { IAddressSwap } from "../../../IAddressSwap";
import { TokenAmount } from "../../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../../types/Token";
import { LoggerType } from "../../../../utils/Logger";
/**
 * State enum for legacy escrow based Bitcoin -> Smart chain swaps.
 *
 * @category Swaps
 */
export declare enum FromBTCSwapState {
    /**
     * Bitcoin swap address has expired and the intermediary (LP) has already refunded
     *  its funds. No BTC should be sent anymore!
     */
    FAILED = -4,
    /**
     * Bitcoin swap address has expired, user should not send any BTC anymore! Though
     *  the intermediary (LP) hasn't refunded yet. So if there is a transaction already
     *  in-flight the swap might still succeed.
     */
    EXPIRED = -3,
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    QUOTE_EXPIRED = -2,
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    QUOTE_SOFT_EXPIRED = -1,
    /**
     * Swap quote was created, use the {@link FromBTCSwap.commit} or {@link FromBTCSwap.txsCommit} functions
     *  to initiate it by creating the swap escrow on the destination smart chain
     */
    PR_CREATED = 0,
    /**
     * Swap escrow was initiated (committed) on the destination chain, user can send the BTC to the
     *  swap address with the {@link FromBTCSwap.getFundedPsbt}, {@link FromBTCSwap.getAddress} or
     *  {@link FromBTCSwap.getHyperlink} functions.
     */
    CLAIM_COMMITED = 1,
    /**
     * Input bitcoin transaction was confirmed, wait for automatic settlement by the watchtower
     *  or settle manually using the {@link FromBTCSwap.claim} or {@link FromBTCSwap.txsClaim}
     *  function.
     */
    BTC_TX_CONFIRMED = 2,
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    CLAIM_CLAIMED = 3
}
export type FromBTCSwapInit<T extends SwapData> = IEscrowSelfInitSwapInit<T> & {
    data: T;
    address?: string;
    amount?: bigint;
    requiredConfirmations?: number;
};
export declare function isFromBTCSwapInit<T extends SwapData>(obj: any): obj is FromBTCSwapInit<T>;
/**
 * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation
 *  of the swap escrow on the destination chain.
 *
 * @category Swaps
 */
export declare class FromBTCSwap<T extends ChainType = ChainType> extends IFromBTCSelfInitSwap<T, FromBTCDefinition<T>, FromBTCSwapState> implements IBTCWalletSwap, IClaimableSwap<T, FromBTCDefinition<T>, FromBTCSwapState>, IAddressSwap {
    protected readonly TYPE: SwapType.FROM_BTC;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    /**
     * @internal
     */
    protected readonly inputToken: BtcToken<false>;
    /**
     * @internal
     */
    protected readonly feeRate: string;
    /**
     * @internal
     */
    readonly _data: T["Data"];
    private address?;
    private amount?;
    private requiredConfirmations?;
    private senderAddress?;
    private txId?;
    private vout?;
    constructor(wrapper: FromBTCWrapper<T>, init: FromBTCSwapInit<T["Data"]>);
    constructor(wrapper: FromBTCWrapper<T>, obj: any);
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
     * Returns bitcoin address where the on-chain BTC should be sent to
     */
    getAddress(): string;
    /**
     * Unsafe bitcoin hyperlink getter, returns the address even before the swap is committed!
     *
     * @private
     */
    private _getHyperlink;
    /**
     * @inheritDoc
     */
    getHyperlink(): string;
    /**
     * @inheritDoc
     */
    getInputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getInputTxId(): string | null;
    /**
     * Returns timeout time (in UNIX milliseconds) when the on-chain address will expire and no funds should be sent
     *  to that address anymore
     */
    getTimeoutTime(): number;
    /**
     * @inheritDoc
     */
    requiresAction(): boolean;
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
    protected canCommit(): boolean;
    /**
     * @inheritDoc
     */
    getInputToken(): BtcToken<false>;
    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<false>>;
    /**
     * Returns claimer bounty, acting as a reward for watchtowers to claim the swap automatically,
     *  this amount is pre-funded by the user on the destination chain when the swap escrow
     *  is initiated. For total pre-funded deposit amount see {@link getTotalDeposit}.
     */
    getClaimerBounty(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    /**
     * If the required number of confirmations is not known, this function tries to infer it by looping through
     *  possible confirmation targets and comparing the claim hashes
     *
     * @param btcTx Bitcoin transaction
     * @param vout Output index of the desired output in the bitcoin transaction
     *
     * @private
     */
    private inferRequiredConfirmationsCount;
    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount(): number;
    /**
     * Checks whether a bitcoin payment was already made, returns the payment or `null` when no payment has been made.
     *
     * @internal
     */
    protected getBitcoinPayment(): Promise<{
        txId: string;
        vout: number;
        confirmations: number;
        targetConfirmations: number;
        inputAddresses?: string[];
    } | null>;
    /**
     * Used to set the txId of the bitcoin payment from the on-chain events listener
     *
     * @param txId Transaction ID that settled the swap on the smart chain
     *
     * @internal
     */
    _setBitcoinTxId(txId: string): Promise<void>;
    /**
     * @inheritDoc
     *
     * @throws {Error} if in invalid state (must be {@link FromBTCSwapState.CLAIM_COMMITED})
     */
    waitForBitcoinTransaction(updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<string>;
    /**
     * Private getter of the funded PSBT that doesn't check current state
     *
     * @param _bitcoinWallet Bitcoin wallet to fund the PSBT with
     * @param feeRate Optional bitcoin fee rate in sats/vB
     * @param additionalOutputs Optional additional outputs that should also be included in the generated PSBT
     *
     * @private
     */
    private _getFundedPsbt;
    /**
     * @inheritDoc
     */
    getFundedPsbt(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number, additionalOutputs?: ({
        amount: bigint;
        outputScript: Uint8Array;
    } | {
        amount: bigint;
        address: string;
    })[]): Promise<{
        psbt: Transaction;
        psbtHex: string;
        psbtBase64: string;
        signInputs: number[];
    }>;
    /**
     * @inheritDoc
     *
     * @throws {Error} if the swap is in invalid state (not in {@link FromBTCSwapState.CLAIM_COMMITED}), or if
     *  the swap bitcoin address already expired.
     */
    submitPsbt(_psbt: Transaction | string): Promise<string>;
    /**
     * @inheritDoc
     */
    estimateBitcoinFee(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number): Promise<TokenAmount<any, BtcToken<false>, true> | null>;
    /**
     * @inheritDoc
     */
    sendBitcoinTransaction(wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner, feeRate?: number): Promise<string>;
    /**
     * Executes the swap with the provided bitcoin wallet,
     *
     * @param dstSigner Signer on the destination network, needs to have the same address as the one specified when
     *  quote was created, this is required for legacy swaps because the destination wallet needs to actively open
     *  a bitcoin swap address to which the BTC is then sent, this means that the address also needs to have enough
     *  native tokens to pay for gas on the destination network
     * @param wallet Bitcoin wallet to use to sign the bitcoin transaction, can also be null - then the execution waits
     *  till a transaction is received from an external wallet
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call `swap.claim()` to settle the swap on the destination manually
     */
    execute(dstSigner: T["Signer"] | T["NativeSigner"], wallet?: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner | null | undefined, callbacks?: {
        onDestinationCommitSent?: (destinationCommitTxId: string) => void;
        onSourceTransactionSent?: (sourceTxId: string) => void;
        onSourceTransactionConfirmationStatus?: (sourceTxId?: string, confirmations?: number, targetConfirations?: number, etaMs?: number) => void;
        onSourceTransactionConfirmed?: (sourceTxId: string) => void;
        onSwapSettled?: (destinationTxId: string) => void;
    }, options?: {
        feeRate?: number;
        abortSignal?: AbortSignal;
        btcTxCheckIntervalSeconds?: number;
        maxWaitTillAutomaticSettlementSeconds?: number;
    }): Promise<boolean>;
    /**
     * @inheritDoc
     *
     * @param options.bitcoinWallet Bitcoin wallet to use, when provided the function returns a funded
     *  psbt (`"FUNDED_PSBT"`), if not passed just a bitcoin receive address is returned (`"ADDRESS"`)
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     *
     * @throws {Error} if the swap or quote is expired, or if triggered in invalid state
     */
    txsExecute(options?: {
        bitcoinWallet?: MinimalBitcoinWalletInterface;
        skipChecks?: boolean;
    }): Promise<({
        name: "Commit";
        description: string;
        chain: T["ChainId"];
        txs: T["TX"][];
    } | {
        name: "Payment";
        description: string;
        chain: "BITCOIN";
        txs: ({
            address: string;
            amount: number;
            hyperlink: string;
            type: "ADDRESS";
        } | {
            type: "FUNDED_PSBT";
            psbt: Transaction;
            psbtHex: string;
            psbtBase64: string;
            signInputs: number[];
            address?: undefined;
            amount?: undefined;
            hyperlink?: undefined;
        })[];
    })[]>;
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
     * Might also return transactions necessary to sync the bitcoin light client.
     *
     * @inheritDoc
     *
     * @throws {Error} If the swap is in invalid state (must be {@link FromBTCSwapState.BTC_TX_CONFIRMED})
     */
    txsClaim(_signer?: string | T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    /**
     * Might also sync the bitcoin light client. Signer can also be different to the initializer.
     *
     * @inheritDoc
     */
    claim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void): Promise<string>;
    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCSwapState.BTC_TX_CONFIRMED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     *
     * @returns {boolean} whether the swap was claimed in time or not
     */
    waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
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
    _sync(save?: boolean, quoteDefinitelyExpired?: boolean, commitStatus?: SwapCommitState): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _forciblySetOnchainState(status: SwapCommitState): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _tick(save?: boolean): Promise<boolean>;
}
