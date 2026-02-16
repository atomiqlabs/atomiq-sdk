import {decode as bolt11Decode} from "@atomiqlabs/bolt11";
import {ToBTCLNDefinition, ToBTCLNWrapper} from "./ToBTCLNWrapper";
import {isIToBTCSwapInit, IToBTCSwap, IToBTCSwapInit} from "../IToBTCSwap";
import {SwapType} from "../../../../enums/SwapType";
import {ChainType, SwapData} from "@atomiqlabs/base";
import {Buffer} from "buffer";
import {sha256} from "@noble/hashes/sha2";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {isLNURLPaySuccessAction, LNURL, LNURLPaySuccessAction} from "../../../../lnurl/LNURL";
import {TokenAmount, toTokenAmount} from "../../../../types/TokenAmount";
import {BitcoinTokens, BtcToken} from "../../../../types/Token";
import {getLogger, LoggerType} from "../../../../utils/Logger";
import {LNURLDecodedSuccessAction} from "../../../../types/lnurl/LNURLPay";

export type ToBTCLNSwapInit<T extends SwapData> = IToBTCSwapInit<T> & {
    confidence: number;
    pr?: string;
    lnurl?: string;
    successAction?: LNURLPaySuccessAction;
};

export function isToBTCLNSwapInit<T extends SwapData>(obj: any): obj is ToBTCLNSwapInit<T> {
    return typeof (obj.confidence) === "number" &&
        (obj.pr==null || typeof (obj.pr) === "string") &&
        (obj.lnurl == null || typeof (obj.lnurl) === "string") &&
        (obj.successAction == null || isLNURLPaySuccessAction(obj.successAction)) &&
        isIToBTCSwapInit<T>(obj);
}

//Set of nodes which disallow probing, resulting in 0 confidence reported by the LP
const SNOWFLAKE_LIST: Set<string> = new Set([
    "038f8f113c580048d847d6949371726653e02b928196bad310e3eda39ff61723f6",
    "03a6ce61fcaacd38d31d4e3ce2d506602818e3856b4b44faff1dde9642ba705976"
]);

/**
 * Escrow based (HTLC) swap for Smart chains -> Bitcoin lightning
 *
 * @category Swaps
 */
export class ToBTCLNSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCLNDefinition<T>> {
    protected readonly TYPE = SwapType.TO_BTCLN;
    /**
     * @internal
     */
    protected readonly outputToken: BtcToken<true> = BitcoinTokens.BTCLN;
    /**
     * @internal
     */
    protected readonly logger: LoggerType;

    private readonly usesClaimHashAsId: boolean;
    private readonly confidence: number;
    private pr?: string;
    private secret?: string;

    private lnurl?: string;
    private successAction?: LNURLPaySuccessAction;

    /**
     * Sets the LNURL data for the swap
     *
     * @internal
     */
    _setLNURLData(lnurl: string, successAction?: LNURLPaySuccessAction) {
        this.lnurl = lnurl;
        this.successAction = successAction;
    }

    constructor(wrapper: ToBTCLNWrapper<T>, init: ToBTCLNSwapInit<T["Data"]>);
    constructor(wrapper: ToBTCLNWrapper<T>, obj: any);

    constructor(wrapper: ToBTCLNWrapper<T>, initOrObj: ToBTCLNSwapInit<T["Data"]> | any) {
        if(isToBTCLNSwapInit(initOrObj) && initOrObj.url!=null) initOrObj.url += "/tobtcln";
        super(wrapper, initOrObj);
        if(isToBTCLNSwapInit(initOrObj)) {
            this.confidence = initOrObj.confidence;
            this.pr = initOrObj.pr;
            this.lnurl = initOrObj.lnurl;
            this.successAction = initOrObj.successAction;
            this.usesClaimHashAsId = true;
        } else {
            this.confidence = initOrObj.confidence;
            this.pr = initOrObj.pr;
            this.lnurl = initOrObj.lnurl;
            this.successAction = initOrObj.successAction;
            this.secret = initOrObj.secret;
            this.usesClaimHashAsId = initOrObj.usesClaimHashAsId ?? false;
        }

        this.logger = getLogger("ToBTCLN("+this.getIdentifierHashString()+"): ");
        this.tryRecomputeSwapPrice();
    }

    /**
     * @inheritDoc
     * @internal
     */
    _setPaymentResult(result: { secret?: string; txId?: string }, check: boolean = false): Promise<boolean> {
        if(result==null) return Promise.resolve(false);
        if(result.secret==null) throw new IntermediaryError("No payment secret returned!");

        const secretBuffer = Buffer.from(result.secret, "hex");
        const hash = Buffer.from(sha256(secretBuffer));

        if(check) {
            const claimHash = this.wrapper._contract.getHashForHtlc(hash);

            const expectedClaimHash = Buffer.from(this.getClaimHash(), "hex");
            if(!claimHash.equals(expectedClaimHash)) throw new IntermediaryError("Invalid payment secret returned");
        }

        this.pr ??= hash.toString("hex");

        this.secret = result.secret;
        return Promise.resolve(true);
    }


    //////////////////////////////
    //// Amounts & fees

    /**
     * @inheritDoc
     */
    getOutputToken(): BtcToken<true> {
        return BitcoinTokens.BTCLN;
    }

    /**
     * @inheritDoc
     */
    getOutput(): TokenAmount<T["ChainId"], BtcToken<true>> {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln"))
            return toTokenAmount(null, this.outputToken, this.wrapper._prices, this.pricingInfo);
        const parsedPR = bolt11Decode(this.pr);
        if(parsedPR.millisatoshis==null) throw new Error("Swap invoice has no msat amount field!");
        const amount = (BigInt(parsedPR.millisatoshis) + 999n) / 1000n;
        return toTokenAmount(amount, this.outputToken, this.wrapper._prices, this.pricingInfo);
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * @inheritDoc
     */
    getOutputTxId(): string | null {
        const paymentHash = this.getPaymentHash();
        if(paymentHash==null) return null;
        return paymentHash.toString("hex");
    }

    /**
     * @inheritDoc
     */
    getOutputAddress(): string | null {
        return this.lnurl ?? this.pr ?? null;
    }

    /**
     * Returns payment secret (pre-image) as a proof of payment
     */
    getSecret(): string | null {
        return this.secret ?? null;
    }

    /**
     * Returns the confidence of the intermediary that this payment will succeed.
     *
     * @returns Decimal value between 0 and 1, where 0 is not likely and 1 is very likely
     */
    getConfidence(): number {
        return this.confidence;
    }

    /**
     * Checks whether a swap is likely to fail, based on the confidence as reported by the intermediary (LP)
     */
    willLikelyFail(): boolean {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln")) return false;

        const parsedRequest = bolt11Decode(this.pr);

        if(parsedRequest.tagsObject.routing_info!=null) {
            for (let route of parsedRequest.tagsObject.routing_info) {
                if(SNOWFLAKE_LIST.has(route.pubkey)) {
                    return false;
                }
            }
        }

        return this.confidence===0;
    }

    /**
     * Tries to detect if the target lightning invoice is a non-custodial mobile wallet, extract care must be taken
     *  for such a wallet **to be online** when attempting to make a swap sending to such a wallet
     */
    isPayingToNonCustodialWallet(): boolean {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln")) return false;

        const parsedRequest = bolt11Decode(this.pr);

        if(parsedRequest.tagsObject.routing_info!=null) {
            return parsedRequest.tagsObject.routing_info.length>0;
        }
        return false;
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected getIdentifierHash(): Buffer {
        const idBuffer: Buffer = this.usesClaimHashAsId
            ? Buffer.from(this.getClaimHash(), "hex")
            : this.getPaymentHash()!;
        if(this._randomNonce==null) return idBuffer;
        return Buffer.concat([idBuffer, Buffer.from(this._randomNonce, "hex")]);
    }

    /**
     * @inheritDoc
     * @internal
     */
    protected getLpIdentifier(): string {
        if(this.pr==null) return this._data.getEscrowHash();
        if(this.pr.toLowerCase().startsWith("ln")) {
            const parsed = bolt11Decode(this.pr);
            if(parsed.tagsObject.payment_hash==null) throw new Error("Swap invoice has no payment hash field!");
            return parsed.tagsObject.payment_hash;
        }
        return this.pr;
    }

    /**
     * Returns the payment hash of the swap, i.e. a payment hash of the lightning network invoice that
     *  is about to be paid
     */
    getPaymentHash(): Buffer | null {
        if(this.pr==null) return null;
        if(this.pr.toLowerCase().startsWith("ln")) {
            const parsed = bolt11Decode(this.pr);
            if(parsed.tagsObject.payment_hash==null) throw new Error("Swap invoice has no payment hash field!");
            return Buffer.from(parsed.tagsObject.payment_hash, "hex");
        }
        return Buffer.from(this.pr, "hex");
    }


    //////////////////////////////
    //// LNURL-pay

    /**
     * Whether this is an LNURL-pay swap
     */
    isLNURL(): boolean {
        return this.lnurl!=null;
    }

    /**
     * Gets the used LNURL-pay link or `null` if this is not an LNURL-pay swap
     */
    getLNURL(): string | null {
        return this.lnurl ?? null;
    }

    /**
     * Checks whether this LNURL-pay payment contains a success action
     */
    hasSuccessAction(): boolean {
        return this.successAction!=null;
    }

    /**
     * Returns the success action after a successful payment, else `null`
     */
    getSuccessAction(): LNURLDecodedSuccessAction | null {
        return LNURL.decodeSuccessAction(this.successAction, this.secret);
    }


    //////////////////////////////
    //// Storage

    /**
     * @inheritDoc
     */
    serialize(): any {
        return {
            ...super.serialize(),
            paymentHash: this.getPaymentHash()?.toString("hex"),
            pr: this.pr,
            confidence: this.confidence,
            secret: this.secret,
            lnurl: this.lnurl,
            successAction: this.successAction,
            usesClaimHashAsId: this.usesClaimHashAsId
        };
    }

}
