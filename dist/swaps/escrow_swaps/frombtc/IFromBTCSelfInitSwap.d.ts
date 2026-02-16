import { IFromBTCWrapper } from "./IFromBTCWrapper";
import { ChainType } from "@atomiqlabs/base";
import { Fee } from "../../../types/fees/Fee";
import { IAddressSwap } from "../../IAddressSwap";
import { IEscrowSelfInitSwap, IEscrowSelfInitSwapDefinition, IEscrowSelfInitSwapInit } from "../IEscrowSelfInitSwap";
import { FeeType } from "../../../enums/FeeType";
import { TokenAmount } from "../../../types/TokenAmount";
import { BtcToken, SCToken } from "../../../types/Token";
import { IClaimableSwap } from "../../IClaimableSwap";
export type IFromBTCSelfInitDefinition<T extends ChainType, W extends IFromBTCWrapper<T, any>, S extends IFromBTCSelfInitSwap<T>> = IEscrowSelfInitSwapDefinition<T, W, S>;
/**
 * Base class for legacy escrow-based Bitcoin (on-chain & lightning) -> Smart chain swaps,
 *  which require the user to manually initiate the escrow on the destination smart chain
 *
 * @category Swaps/Abstract
 */
export declare abstract class IFromBTCSelfInitSwap<T extends ChainType = ChainType, D extends IFromBTCSelfInitDefinition<T, IFromBTCWrapper<T, D>, IFromBTCSelfInitSwap<T, D, S>> = IFromBTCSelfInitDefinition<T, IFromBTCWrapper<T, any>, IFromBTCSelfInitSwap<T, any, any>>, S extends number = number> extends IEscrowSelfInitSwap<T, D, S> implements IAddressSwap, IClaimableSwap<T, D, S> {
    /**
     * @internal
     */
    protected abstract readonly inputToken: BtcToken;
    protected constructor(wrapper: D["Wrapper"], init: IEscrowSelfInitSwapInit<T["Data"]>);
    protected constructor(wrapper: D["Wrapper"], obj: any);
    /**
     * @inheritDoc
     * @internal
     */
    protected tryRecomputeSwapPrice(): void;
    /**
     * @inheritDoc
     */
    abstract getAddress(): string;
    /**
     * @inheritDoc
     */
    abstract getHyperlink(): string;
    /**
     * @inheritDoc
     */
    abstract isClaimable(): boolean;
    /**
     * Returns if the swap can be committed
     * @internal
     */
    protected abstract canCommit(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    _getInitiator(): string;
    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null;
    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null;
    /**
     * @inheritDoc
     */
    requiresAction(): boolean;
    /**
     * Returns the swap output amount in destination token based units without any fees, this
     *  value is therefore always higher than the actual received output.
     *
     * @internal
     */
    protected getOutAmountWithoutFee(): bigint;
    /**
     * Returns the swap fee charged by the intermediary (LP) on this swap
     *
     * @internal
     */
    protected getSwapFee(): Fee<T["ChainId"], BtcToken, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     */
    getFee(): Fee;
    /**
     * @inheritDoc
     */
    getFeeBreakdown(): [{
        type: FeeType.SWAP;
        fee: Fee<T["ChainId"], BtcToken, SCToken<T["ChainId"]>>;
    }];
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
    abstract getInput(): TokenAmount<T["ChainId"], BtcToken>;
    /**
     * @inheritDoc
     */
    getInputWithoutFee(): TokenAmount<T["ChainId"], BtcToken>;
    /**
     * @inheritDoc
     */
    hasEnoughForTxFees(): Promise<{
        enoughBalance: boolean;
        balance: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
        required: TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    }>;
    /**
     * Returns the amount of native token of the destination chain locked up during initialization of the escrow
     *  to act as a security deposit that can be taken by the intermediary (LP) if the user doesn't go through
     *  with the swap
     */
    getSecurityDeposit(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    /**
     * Returns the total amount of native token of the destination chain locked up during initialization of the escrow.
     *  This covers the security deposit and the watchtower fee (if applicable), it is calculated a maximum of those
     *  two values.
     */
    getTotalDeposit(): TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>;
    /**
     * Returns transactions for initiating (committing) the escrow on the destination smart chain side, pre-locking the
     *  tokens from the intermediary (LP) into an escrow.
     *
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited
     *  yet (this is handled on swap creation, if you commit right after quoting, you can use skipChecks=true)
     *
     * @throws {Error} When in invalid state to commit the swap
     */
    txsCommit(skipChecks?: boolean): Promise<T["TX"][]>;
    /**
     * Creates the escrow on the destination smart chain side, pre-locking the tokens from the intermediary (LP)
     *  into an escrow.
     *
     * @param signer Signer to sign the transactions with, must be the same as used in the initialization
     * @param abortSignal Abort signal
     * @param skipChecks Skip checks like making sure init signature is still valid and swap wasn't commited
     *  yet (this is handled on swap creation, if you commit right after quoting, you can use skipChecks=true)
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    abstract commit(signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal, skipChecks?: boolean): Promise<string>;
    /**
     * Returns the transaction fee required for the claim transaction to settle the escrow on the destination
     *  smart chain
     */
    getClaimNetworkFee(): Promise<TokenAmount<T["ChainId"], SCToken<T["ChainId"]>, true>>;
    /**
     * @inheritDoc
     */
    abstract txsClaim(signer?: T["Signer"]): Promise<T["TX"][]>;
    /**
     * @inheritDoc
     */
    abstract claim(signer: T["Signer"] | T["NativeSigner"], abortSignal?: AbortSignal): Promise<string>;
    /**
     * @inheritDoc
     */
    abstract waitTillClaimed(maxWaitTimeSeconds?: number, abortSignal?: AbortSignal): Promise<boolean>;
}
