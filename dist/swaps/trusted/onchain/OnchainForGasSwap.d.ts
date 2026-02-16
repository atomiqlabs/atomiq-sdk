import { SwapType } from "../../../enums/SwapType";
import { ChainType } from "@atomiqlabs/base";
import { ISwap, ISwapInit } from "../../ISwap";
import { OnchainForGasSwapTypeDefinition, OnchainForGasWrapper } from "./OnchainForGasWrapper";
import { Fee } from "../../../types/fees/Fee";
import { IBitcoinWallet } from "../../../bitcoin/wallet/IBitcoinWallet";
import { IAddressSwap } from "../../IAddressSwap";
import { IBTCWalletSwap } from "../../IBTCWalletSwap";
import { Transaction } from "@scure/btc-signer";
import { MinimalBitcoinWalletInterface, MinimalBitcoinWalletInterfaceWithSigner } from "../../../types/wallets/MinimalBitcoinWalletInterface";
import { FeeType } from "../../../enums/FeeType";
import { TokenAmount } from "../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../types/Token";
import { LoggerType } from "../../../utils/Logger";
import { SwapExecutionActionBitcoin } from "../../../types/SwapExecutionAction";
/**
 * State enum for trusted on-chain gas swaps
 *
 * @category Swaps
 */
export declare enum OnchainForGasSwapState {
    /**
     * The swap quote expired without user sending in the BTC
     */
    EXPIRED = -3,
    /**
     * The swap has failed after the intermediary already received the BTC on the source chain
     */
    FAILED = -2,
    /**
     * Swap was refunded and BTC returned to the user's refund address
     */
    REFUNDED = -1,
    /**
     * Swap was created
     */
    PR_CREATED = 0,
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    FINISHED = 1,
    /**
     * Swap is refundable because the intermediary cannot honor the swap request on the destination chain
     */
    REFUNDABLE = 2
}
export type OnchainForGasSwapInit = ISwapInit & {
    paymentHash: string;
    sequence: bigint;
    address: string;
    inputAmount: bigint;
    outputAmount: bigint;
    recipient: string;
    token: string;
    refundAddress?: string;
};
export declare function isOnchainForGasSwapInit(obj: any): obj is OnchainForGasSwapInit;
/**
 * Trusted swap for Bitcoin -> Smart chains, to be used for minor amounts to get gas tokens on the
 *  destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps
 */
export declare class OnchainForGasSwap<T extends ChainType = ChainType> extends ISwap<T, OnchainForGasSwapTypeDefinition<T>> implements IAddressSwap, IBTCWalletSwap {
    protected readonly TYPE: SwapType.TRUSTED_FROM_BTC;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    private readonly paymentHash;
    private readonly sequence;
    private readonly address;
    private readonly recipient;
    private readonly token;
    private inputAmount;
    private outputAmount;
    private refundAddress?;
    /**
     * Destination transaction ID on the smart chain side
     * @private
     */
    private scTxId?;
    /**
     * Source transaction ID on the source (bitcoin) side
     * @private
     */
    private txId?;
    /**
     * Transaction ID on the source (bitcoin) side used for refunding the funds back to the user
     * @private
     */
    private refundTxId?;
    /**
     * @internal
     */
    protected readonly wrapper: OnchainForGasWrapper<T>;
    constructor(wrapper: OnchainForGasWrapper<T>, init: OnchainForGasSwapInit);
    constructor(wrapper: OnchainForGasWrapper<T>, obj: any);
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
     * @internal
     */
    _getEscrowHash(): string;
    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null;
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
    getOutputTxId(): string | null;
    /**
     * @inheritDoc
     */
    getId(): string;
    /**
     * @inheritDoc
     */
    getAddress(): string;
    /**
     * @inheritDoc
     */
    getHyperlink(): string;
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
    isQuoteExpired(): boolean;
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired(): boolean;
    /**
     * @inheritDoc
     */
    isFailed(): boolean;
    /**
     * @inheritDoc
     */
    isSuccessful(): boolean;
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
     * Returns an output amount in base units without a swap fee included, hence this value
     *  is larger than the actual output amount
     *
     * @internal
     */
    protected getOutAmountWithoutFee(): bigint;
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
    getInputToken(): BtcToken<false>;
    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<false>, true>;
    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<false>, true>;
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [{
        type: FeeType.SWAP;
        fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    }];
    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount(): number;
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
     * @inheritDoc
     *
     * @param options.bitcoinWallet Optional bitcoin wallet address specification to return a funded PSBT,
     *  if not provided an address is returned instead.
     */
    txsExecute(options?: {
        bitcoinWallet?: MinimalBitcoinWalletInterface;
    }): Promise<[
        SwapExecutionActionBitcoin<"ADDRESS" | "FUNDED_PSBT">
    ]>;
    /**
     * Queries the intermediary (LP) node for the state of the swap
     *
     * @param save Whether the save the result or not
     *
     * @returns Whether the swap was successful as `boolean` or `null` if the swap is still pending
     * @internal
     */
    protected checkAddress(save?: boolean): Promise<boolean | null>;
    /**
     * Sets the bitcoin address used for possible refunds in case something goes wrong with the swap
     *
     * @param refundAddress Bitcoin address to receive the refund to
     * @internal
     */
    protected setRefundAddress(refundAddress: string): Promise<void>;
    /**
     * @inheritDoc
     */
    waitForBitcoinTransaction(updateCallback?: (txId?: string, confirmations?: number, targetConfirmations?: number, txEtaMs?: number) => void, checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<string>;
    /**
     * Waits till the LP processes a refund for a failed swap. The swap must be in
     *  {@link OnchainForGasSwapState.REFUNDABLE} state
     *
     * @param checkIntervalSeconds How often to check (default 5 seconds)
     * @param abortSignal Abort signal
     */
    waitTillRefunded(checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<void>;
    /**
     * Requests a refund after the swap failed, this also waits till the refund is actually sent by the
     *  intermediary (LP). The swap must be in {@link OnchainForGasSwapState.REFUNDABLE} state
     *
     * @param refundAddress Bitcoin address to receive the refund to
     * @param abortSignal Abort signal
     */
    requestRefund(refundAddress?: string, abortSignal?: AbortSignal): Promise<void>;
    /**
     * @inheritDoc
     */
    serialize(): any;
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string;
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
}
