import { ISwap, ISwapInit } from "../ISwap";
import { ChainType, SpvWithdrawalClaimedState, SpvWithdrawalClosedState, SpvWithdrawalFrontedState } from "@atomiqlabs/base";
import { SwapType } from "../../enums/SwapType";
import { SpvFromBTCTypeDefinition, SpvFromBTCWrapper } from "./SpvFromBTCWrapper";
import { Transaction } from "@scure/btc-signer";
import { Fee } from "../../types/fees/Fee";
import { IBitcoinWallet } from "../../bitcoin/wallet/IBitcoinWallet";
import { IBTCWalletSwap } from "../IBTCWalletSwap";
import { ISwapWithGasDrop } from "../ISwapWithGasDrop";
import { MinimalBitcoinWalletInterface, MinimalBitcoinWalletInterfaceWithSigner } from "../../types/wallets/MinimalBitcoinWalletInterface";
import { IClaimableSwap } from "../IClaimableSwap";
import { FeeType } from "../../enums/FeeType";
import { TokenAmount } from "../../types/TokenAmount";
import { BtcToken, SCToken } from "../../types/Token";
import { LoggerType } from "../../utils/Logger";
import { PriceInfoType } from "../../types/PriceInfoType";
import { SwapExecutionActionBitcoin } from "../../types/SwapExecutionAction";
/**
 * State enum for SPV vault (UTXO-controlled vault) based swaps
 * @category Swaps/Bitcoin → Smart chain
 */
export declare enum SpvFromBTCSwapState {
    /**
     * Catastrophic failure has occurred when processing the swap on the smart chain side,
     *  this implies a bug in the smart contract code or the user and intermediary deliberately
     *  creating a bitcoin transaction with invalid format unparsable by the smart contract.
     */
    CLOSED = -5,
    /**
     * Some of the bitcoin swap transaction inputs were double-spent, this means the swap
     *  has failed and no BTC was sent
     */
    FAILED = -4,
    /**
     * The intermediary (LP) declined to co-sign the submitted PSBT, hence the swap failed
     */
    DECLINED = -3,
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
     * Swap was created, use the {@link SpvFromBTCSwap.getFundedPsbt} or {@link SpvFromBTCSwap.getPsbt} functions
     *  to get the bitcoin swap PSBT that should be signed by the user's wallet and then submitted via the
     *  {@link SpvFromBTCSwap.submitPsbt} function.
     */
    CREATED = 0,
    /**
     * Swap bitcoin PSBT was submitted by the client to the SDK
     */
    SIGNED = 1,
    /**
     * Swap bitcoin PSBT sent to the intermediary (LP), waiting for the intermediary co-sign
     *  it and broadcast. You can use the {@link SpvFromBTCSwap.waitTillClaimedOrFronted}
     *  function to wait till the intermediary broadcasts the transaction and the transaction
     *  confirms.
     */
    POSTED = 2,
    /**
     * Intermediary (LP) has co-signed and broadcasted the bitcoin transaction. You can use the
     *  {@link SpvFromBTCSwap.waitTillClaimedOrFronted} function to wait till the transaction
     *  confirms.
     */
    BROADCASTED = 3,
    /**
     * Settlement on the destination smart chain was fronted and funds were already received
     *  by the user, even before the final settlement.
     */
    FRONTED = 4,
    /**
     * Bitcoin transaction confirmed with necessary amount of confirmations, wait for automatic
     *  settlement by the watchtower with the {@link waitTillClaimedOrFronted} function, or settle manually
     *  using the {@link FromBTCSwap.claim} or {@link FromBTCSwap.txsClaim} function.
     */
    BTC_TX_CONFIRMED = 5,
    /**
     * Swap settled on the smart chain and funds received
     */
    CLAIMED = 6
}
export type SpvFromBTCSwapInit = ISwapInit & {
    quoteId: string;
    recipient: string;
    vaultOwner: string;
    vaultId: bigint;
    vaultRequiredConfirmations: number;
    vaultTokenMultipliers: bigint[];
    vaultBtcAddress: string;
    vaultUtxo: string;
    vaultUtxoValue: bigint;
    btcDestinationAddress: string;
    btcAmount: bigint;
    btcAmountSwap: bigint;
    btcAmountGas: bigint;
    minimumBtcFeeRate: number;
    outputTotalSwap: bigint;
    outputSwapToken: string;
    outputTotalGas: bigint;
    outputGasToken: string;
    gasSwapFeeBtc: bigint;
    gasSwapFee: bigint;
    callerFeeShare: bigint;
    frontingFeeShare: bigint;
    executionFeeShare: bigint;
    genesisSmartChainBlockHeight: number;
    gasPricingInfo?: PriceInfoType;
};
export declare function isSpvFromBTCSwapInit(obj: any): obj is SpvFromBTCSwapInit;
/**
 * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring
 *  any initiation on the destination chain, and with the added possibility for the user to receive
 *  a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
export declare class SpvFromBTCSwap<T extends ChainType> extends ISwap<T, SpvFromBTCTypeDefinition<T>> implements IBTCWalletSwap, ISwapWithGasDrop<T>, IClaimableSwap<T, SpvFromBTCTypeDefinition<T>, SpvFromBTCSwapState> {
    readonly TYPE: SwapType.SPV_VAULT_FROM_BTC;
    /**
     * @inheritDoc
     * @internal
     */
    protected readonly logger: LoggerType;
    private readonly quoteId;
    private readonly recipient;
    private readonly vaultOwner;
    private readonly vaultId;
    private readonly vaultRequiredConfirmations;
    private readonly vaultTokenMultipliers;
    private readonly vaultBtcAddress;
    private readonly vaultUtxo;
    private readonly vaultUtxoValue;
    private readonly btcDestinationAddress;
    private readonly btcAmount;
    private readonly btcAmountSwap;
    private readonly btcAmountGas;
    private readonly outputTotalSwap;
    private readonly outputSwapToken;
    private readonly outputTotalGas;
    private readonly outputGasToken;
    private readonly gasSwapFeeBtc;
    private readonly gasSwapFee;
    private readonly callerFeeShare;
    private readonly frontingFeeShare;
    private readonly executionFeeShare;
    private readonly gasPricingInfo?;
    /**
     * @internal
     */
    readonly _genesisSmartChainBlockHeight: number;
    /**
     * @internal
     */
    _senderAddress?: string;
    /**
     * @internal
     */
    _claimTxId?: string;
    /**
     * @internal
     */
    _frontTxId?: string;
    /**
     * @internal
     */
    _data?: T["SpvVaultWithdrawalData"];
    /**
     * Minimum fee rate in sats/vB that the input bitcoin transaction needs to pay
     */
    readonly minimumBtcFeeRate: number;
    constructor(wrapper: SpvFromBTCWrapper<T>, init: SpvFromBTCSwapInit);
    constructor(wrapper: SpvFromBTCWrapper<T>, obj: any);
    /**
     * @inheritDoc
     * @internal
     */
    protected upgradeVersion(): void;
    /**
     * @inheritDoc
     * @internal
     */
    protected tryCalculateSwapFee(): void;
    /**
     * @inheritDoc
     */
    refreshPriceData(): Promise<void>;
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string;
    /**
     * @inheritDoc
     * @internal
     */
    _getEscrowHash(): string | null;
    /**
     * @inheritDoc
     */
    getId(): string;
    /**
     * @inheritDoc
     */
    getQuoteExpiry(): number;
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
    getOutputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null;
    /**
     * @inheritDoc
     */
    getInputAddress(): string | null;
    /**
     * @inheritDoc
     */
    getInputTxId(): string | null;
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
     * Returns the data about used spv vault (UTXO-controlled vault) to perform the swap
     */
    getSpvVaultData(): {
        owner: string;
        vaultId: bigint;
        utxo: string;
    };
    /**
     * Returns the input BTC amount in sats without any fees
     *
     * @internal
     */
    protected getInputSwapAmountWithoutFee(): bigint;
    /**
     * Returns the input gas BTC amount in sats without any fees
     *
     * @internal
     */
    protected getInputGasAmountWithoutFee(): bigint;
    /**
     * Returns to total input BTC amount in sats without any fees (this is BTC amount for the swap + BTC amount
     *  for the gas drop).
     *
     * @internal
     */
    protected getInputAmountWithoutFee(): bigint;
    /**
     * Returns the swap output amount without any fees, this value is therefore always higher than
     *  the actual received output.
     *
     * @internal
     */
    protected getOutputWithoutFee(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    /**
     * Returns the fee to be paid to watchtowers on the destination chain to automatically
     *  process and settle this swap without requiring any user interaction
     *
     * @internal
     */
    protected getWatchtowerFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [
        {
            type: FeeType.SWAP;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        },
        {
            type: FeeType.NETWORK_OUTPUT;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        }
    ];
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
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<false>, true>;
    /**
     * @inheritDoc
     */
    getInputToken(): BtcToken<false>;
    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<false>, true>;
    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount(): number;
    /**
     * Returns raw transaction details that can be used to manually create a swap PSBT. It is better to use
     *  the {@link getPsbt} or {@link getFundedPsbt} function retrieve an already prepared PSBT.
     */
    getTransactionDetails(): Promise<{
        in0txid: string;
        in0vout: number;
        in0sequence: number;
        vaultAmount: bigint;
        vaultScript: Uint8Array;
        in1sequence: number;
        out1script: Uint8Array;
        out2amount: bigint;
        out2script: Uint8Array;
        locktime: number;
    }>;
    /**
     * Returns the raw PSBT (not funded), the wallet should fund the PSBT (add its inputs) and importantly **set the nSequence field of the
     *  2nd input** (input 1 - indexing from 0) to the value returned in `in1sequence`, sign the PSBT and then pass
     *  it back to the swap with {@link submitPsbt} function.
     */
    getPsbt(): Promise<{
        psbt: Transaction;
        psbtHex: string;
        psbtBase64: string;
        in1sequence: number;
    }>;
    /**
     * Returns the PSBT that is already funded with wallet's UTXOs (runs a coin-selection algorithm to choose UTXOs to use),
     *  also returns inputs indices that need to be signed by the wallet before submitting the PSBT back to the SDK with
     *  {@link submitPsbt}
     *
     * @remarks
     * Note that when passing the `feeRate` argument, the fee must be at least {@link minimumBtcFeeRate} sats/vB.
     *
     * @param _bitcoinWallet Sender's bitcoin wallet
     * @param feeRate Optional fee rate in sats/vB for the transaction
     * @param additionalOutputs additional outputs to add to the PSBT - can be used to collect fees from users
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
     * Executes the swap with the provided bitcoin wallet
     *
     * @param wallet Bitcoin wallet to use to sign the bitcoin transaction
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call the {@link claim} function to settle the swap on the
     *  destination manually
     */
    execute(wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner, callbacks?: {
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
     * @param options.bitcoinWallet Optional bitcoin wallet address specification to return a funded PSBT,
     *  if not provided a raw PSBT is returned instead which necessitates the implementor to manually add
     *  inputs to the bitcoin transaction and **set the nSequence field of the 2nd input** (input 1 -
     *  indexing from 0) to the value returned in `in1sequence`
     */
    txsExecute(options?: {
        bitcoinWallet?: MinimalBitcoinWalletInterface;
    }): Promise<[
        SwapExecutionActionBitcoin<"RAW_PSBT" | "FUNDED_PSBT">
    ]>;
    /**
     * Checks whether a bitcoin payment was already made, returns the payment or null when no payment has been made.
     * @internal
     */
    protected getBitcoinPayment(): Promise<{
        txId: string;
        confirmations: number;
        targetConfirmations: number;
        inputAddresses?: string[];
    } | null>;
    /**
     * @inheritDoc
     *
     * @throws {Error} if in invalid state (must be {@link SpvFromBTCSwapState.POSTED} or
     *  {@link SpvFromBTCSwapState.BROADCASTED} states)
     */
    waitForBitcoinTransaction(updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<string>;
    /**
     * Returns transactions for settling (claiming) the swap if the swap requires manual settlement, you can check so
     *  with isClaimable. After sending the transaction manually be sure to call the waitTillClaimed function to wait
     *  till the claim transaction is observed, processed by the SDK and state of the swap properly updated.
     *
     * @remarks
     * Might also return transactions necessary to sync the bitcoin light client.
     *
     * @param _signer Address of the signer to create the claim transactions for, can also be different to the recipient
     *
     * @throws {Error} If the swap is in invalid state (must be {@link SpvFromBTCSwapState.BTC_TX_CONFIRMED})
     */
    txsClaim(_signer?: string | T["Signer"] | T["NativeSigner"]): Promise<T["TX"][]>;
    /**
     * Settles the swap by claiming the funds on the destination chain if the swap requires manual settlement, you can
     *  check so with isClaimable.
     *
     * @remarks
     * Might also sync the bitcoin light client during the process.
     *
     * @param _signer Signer to use for signing the settlement transactions, can also be different to the recipient
     * @param abortSignal Abort signal
     * @param onBeforeTxSent Optional callback triggered before the claim transaction is broadcasted
     *
     * @throws {Error} If the swap is in invalid state (must be {@link SpvFromBTCSwapState.BTC_TX_CONFIRMED})
     */
    claim(_signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, onBeforeTxSent?: (txId: string) => void): Promise<string>;
    /**
     * Periodically checks the chain to see whether the swap was finished (claimed or refunded)
     *
     * @param abortSignal
     * @param interval How often to check (in seconds), default to 5s
     * @internal
     */
    protected watchdogWaitTillResult(abortSignal?: AbortSignal, interval?: number): Promise<SpvWithdrawalClaimedState | SpvWithdrawalFrontedState | SpvWithdrawalClosedState>;
    /**
     * Waits till the swap is successfully settled (claimed), should be called after sending the claim (settlement)
     *  transactions manually to wait till the SDK processes the settlement and updates the swap state accordingly.
     *
     * @remarks
     * This is an alias for the {@link waitTillClaimedOrFronted} function and will also resolve if the swap has
     *  been fronted (not necessarily claimed)
     *
     * @param maxWaitTimeSeconds – Maximum time in seconds to wait for the swap to be settled
     * @param abortSignal – AbortSignal
     *
     * @returns Whether the swap was claimed in time or not
     */
    waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * Waits till the swap is successfully fronted or settled on the destination chain
     *
     * @param maxWaitTimeSeconds Maximum time in seconds to wait for the swap to be settled (by default
     *  it waits indefinitely)
     * @param abortSignal Abort signal
     *
     * @returns {boolean} whether the swap was claimed or fronted automatically or not, if the swap was not claimed
     *  the user can claim manually through the {@link claim} function
     */
    waitTillClaimedOrFronted(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
    /**
     * Waits till the bitcoin transaction confirms and swap settled on the destination chain
     *
     * @param updateCallback Callback called when txId is found, and also called with subsequent confirmations
     * @param checkIntervalSeconds How often to check the bitcoin transaction (5 seconds by default)
     * @param abortSignal Abort signal
     *
     * @throws {Error} if in invalid state (must be {@link SpvFromBTCSwapState.POSTED} or
     *  {@link SpvFromBTCSwapState.BROADCASTED} states)
     */
    waitTillExecuted(updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<void>;
    /**
     * @inheritDoc
     */
    serialize(): any;
    /**
     * Used to set the txId of the bitcoin payment from the on-chain events listener
     *
     * @param txId
     * @internal
     */
    _setBitcoinTxId(txId: string): Promise<void>;
    /**
     * @internal
     */
    _syncStateFromBitcoin(save?: boolean): Promise<boolean>;
    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     */
    private syncStateFromChain;
    /**
     * @inheritDoc
     * @internal
     */
    _sync(save?: boolean): Promise<boolean>;
    /**
     * @inheritDoc
     * @internal
     */
    _tick(save?: boolean): Promise<boolean>;
    /**
     * Checks whether an on-chain withdrawal state should be fetched for this specific swap
     *
     * @internal
     */
    _shouldCheckWithdrawalState(frontingAddress?: string | null, vaultDataUtxo?: string | null): Promise<boolean>;
}
