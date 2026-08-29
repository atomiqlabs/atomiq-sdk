/// <reference types="node" />
/// <reference types="node" />
import { ToBTCLNDefinition, ToBTCLNWrapper } from "./ToBTCLNWrapper.js";
import { IToBTCSwap, IToBTCSwapInit } from "../IToBTCSwap.js";
import { SwapType } from "../../../../enums/SwapType.js";
import { ChainType, SwapData } from "@atomiqlabs/base";
import { Buffer } from "buffer";
import { LNURLPaySuccessAction } from "../../../../lnurl/LNURL.js";
import { TokenAmount } from "../../../../types/TokenAmount.js";
import { BtcToken } from "../../../../types/Token.js";
import { LoggerType } from "../../../../utils/Logger.js";
import { LNURLDecodedSuccessAction } from "../../../../types/lnurl/LNURLPay.js";
export type ToBTCLNSwapInit<T extends SwapData> = IToBTCSwapInit<T> & {
    confidence: number;
    pr?: string;
    lnurl?: string;
    successAction?: LNURLPaySuccessAction;
    longExpiry?: boolean;
};
export declare function isToBTCLNSwapInit<T extends SwapData>(obj: any): obj is ToBTCLNSwapInit<T>;
/**
 * Escrow based (HTLC) swap for Smart chains -> Bitcoin lightning
 *
 * @category Swaps/Smart chain → Lightning
 */
export declare class ToBTCLNSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCLNDefinition<T>> {
    protected readonly TYPE = SwapType.TO_BTCLN;
    /**
     * @internal
     */
    protected readonly outputToken: BtcToken<true>;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;
    private readonly usesClaimHashAsId;
    private readonly confidence;
    private readonly longExpiry?;
    private pr?;
    private secret?;
    private lnurl?;
    private successAction?;
    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl: string, successAction?: LNURLPaySuccessAction): void;
    constructor(wrapper: ToBTCLNWrapper<T>, init: ToBTCLNSwapInit<T["Data"]>);
    constructor(wrapper: ToBTCLNWrapper<T>, obj: any);
    /**
     * @inheritDoc
     * @internal
     */
    _setPaymentResult(result: {
        secret?: string;
        txId?: string;
    }, check?: boolean): Promise<boolean>;
    /**
     * @inheritDoc
     */
    getOutputToken(): BtcToken<true>;
    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<BtcToken<true>>;
    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null;
    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null;
    /**
     * Returns payment secret (pre-image) as a proof of payment
     */
    getSecret(): string | null;
    /**
     * Returns the confidence of the intermediary that this payment will succeed.
     *
     * @returns Decimal value between 0 and 1, where 0 is not likely and 1 is very likely
     */
    getConfidence(): number;
    /**
     * Checks whether a swap is likely to fail, based on the confidence as reported by the intermediary (LP)
     */
    willLikelyFail(): boolean;
    /**
     * Tries to detect if the target lightning invoice is a non-custodial mobile wallet, extract care must be taken
     *  for such a wallet **to be online** when attempting to make a swap sending to such a wallet
     */
    isPayingToNonCustodialWallet(): boolean;
    /**
     * Returns whether the swap requires longer than usual HTLC expiration, this means in the case that the LP is not
     *  cooperative the user will have to wait longer for the unilateral refund to become available. The longer
     *  expiration times might be required when sending lightning payments to systems with long potential settlement
     *  times (like Arkade or Bark).
     */
    hasLongExpiration(): boolean;
    /**
     * @inheritDoc
     * @internal
     */
    protected getIdentifierHash(): Buffer;
    /**
     * @inheritDoc
     * @internal
     */
    protected getLpIdentifier(): string;
    /**
     * Returns the payment hash of the swap, i.e. a payment hash of the lightning network invoice that
     *  is about to be paid
     */
    getPaymentHash(): Buffer | null;
    /**
     * Whether this is an LNURL-pay swap
     */
    isLNURL(): boolean;
    /**
     * Gets the used LNURL-pay link or `null` if this is not an LNURL-pay swap
     */
    getLNURL(): string | null;
    /**
     * Checks whether this LNURL-pay payment contains a success action
     */
    hasSuccessAction(): boolean;
    /**
     * Returns the success action after a successful payment, else `null`
     */
    getSuccessAction(): LNURLDecodedSuccessAction | null;
    /**
     * @inheritDoc
     */
    serialize(): any;
}
