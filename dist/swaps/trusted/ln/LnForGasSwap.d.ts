import { SwapType } from "../../../enums/SwapType";
import { ChainType } from "@atomiqlabs/base";
import { LnForGasSwapTypeDefinition, LnForGasWrapper } from "./LnForGasWrapper";
import { ISwap, ISwapInit } from "../../ISwap";
import { Fee } from "../../../types/fees/Fee";
import { IAddressSwap } from "../../IAddressSwap";
import { FeeType } from "../../../enums/FeeType";
import { TokenAmount } from "../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../types/Token";
import { LoggerType } from "../../../utils/Logger";
import { SwapExecutionAction, SwapExecutionActionLightning } from "../../../types/SwapExecutionAction";
/**
 * State enum for trusted Lightning gas swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare enum LnForGasSwapState {
    /**
     * The swap quote expired without user sending in the lightning network payment
     */
    EXPIRED = -2,
    /**
     * The swap has failed after the intermediary already received a lightning network payment on the source
     */
    FAILED = -1,
    /**
     * Swap was created, pay the provided lightning network invoice
     */
    PR_CREATED = 0,
    /**
     * User paid the lightning network invoice on the source
     */
    PR_PAID = 1,
    /**
     * The swap is finished after the intermediary sent funds on the destination chain
     */
    FINISHED = 2
}
export type LnForGasSwapInit = ISwapInit & {
    pr: string;
    outputAmount: bigint;
    recipient: string;
    token: string;
};
export declare function isLnForGasSwapInit(obj: any): obj is LnForGasSwapInit;
/**
 * Trusted swap for Bitcoin Lightning -> Smart chains, to be used for minor amounts to get gas tokens on
 *  the destination chain, which is only needed for Solana, which still uses legacy swaps
 *
 * @category Swaps/Trusted Gas Swaps
 */
export declare class LnForGasSwap<T extends ChainType = ChainType> extends ISwap<T, LnForGasSwapTypeDefinition<T>, LnForGasSwapState> implements IAddressSwap {
    protected readonly TYPE: SwapType.TRUSTED_FROM_BTCLN;
    /**
     * @internal
     */
    protected readonly swapStateDescription: {
        [-2]: string;
        [-1]: string;
        0: string;
        1: string;
        2: string;
    };
    /**
     * @internal
     */
    protected readonly swapStateName: (state: number) => string;
    /**
     * @internal
     */
    protected readonly currentVersion: number;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    private readonly pr;
    private readonly outputAmount;
    private readonly recipient;
    private readonly token;
    /**
     * Destination transaction ID on the smart chain side
     * @private
     */
    private scTxId?;
    constructor(wrapper: LnForGasWrapper<T>, init: LnForGasSwapInit);
    constructor(wrapper: LnForGasWrapper<T>, obj: any);
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
     * Returns the lightning network BOLT11 invoice that needs to be paid as an input to the swap
     */
    getAddress(): string;
    /**
     * Returns a string that can be displayed as QR code representation of the lightning invoice (with lightning: prefix)
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
    getInputToken(): BtcToken<true>;
    /**
     * @inheritDoc
     */
    getInput(): TokenAmount<T["ChainId"], BtcToken<true>, true>;
    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken<true>, true>;
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [{
        type: FeeType.SWAP;
        fee: Fee<T["ChainId"], BtcToken<true>, SCToken<T["ChainId"]>>;
    }];
    /**
     * @inheritDoc
     */
    txsExecute(): Promise<[SwapExecutionActionLightning]>;
    /**
     * @inheritDoc
     */
    getCurrentActions(): Promise<SwapExecutionAction<T>[]>;
    /**
     * Queries the intermediary (LP) node for the state of the swap
     *
     * @param save Whether the save the result or not
     *
     * @returns Whether the swap was successful as `boolean` or `null` if the swap is still pending
     * @internal
     */
    protected checkInvoicePaid(save?: boolean): Promise<boolean | null>;
    /**
     * A blocking promise resolving when payment was received by the intermediary and client can continue,
     *  rejecting in case of failure. The swap must be in {@link LnForGasSwapState.PR_CREATED} state!
     *
     * @param checkIntervalSeconds How often to poll the intermediary for answer (default 5 seconds)
     * @param abortSignal Abort signal
     * @throws {Error} When in invalid state (not PR_CREATED)
     */
    waitForPayment(checkIntervalSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
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
