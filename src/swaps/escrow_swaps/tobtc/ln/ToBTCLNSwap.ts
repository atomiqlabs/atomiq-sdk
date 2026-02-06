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
 * Smart Chain to Lightning Network BTC swap
 * @category Swaps
 */
export class ToBTCLNSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCLNDefinition<T>> {
    private readonly usesClaimHashAsId: boolean;

    protected outputToken: BtcToken<true> = BitcoinTokens.BTCLN;
    protected readonly TYPE = SwapType.TO_BTCLN;
    protected readonly logger: LoggerType;

    private readonly confidence: number;
    private pr?: string;

    paymentHash?: string;

    lnurl?: string;
    successAction?: LNURLPaySuccessAction;

    private secret?: string;

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

        const paymentHash = this.getPaymentHash();
        if(paymentHash!=null) this.paymentHash = paymentHash.toString("hex");
        this.logger = getLogger("ToBTCLN("+this.getIdentifierHashString()+"): ");
        this.tryRecomputeSwapPrice();
    }

    _setPaymentResult(result: { secret?: string; txId?: string }, check: boolean = false): Promise<boolean> {
        if(result==null) return Promise.resolve(false);
        if(result.secret==null) throw new IntermediaryError("No payment secret returned!");

        const secretBuffer = Buffer.from(result.secret, "hex");
        const hash = Buffer.from(sha256(secretBuffer));

        if(check) {
            const claimHash = this.wrapper.contract.getHashForHtlc(hash);

            const expectedClaimHash = Buffer.from(this.getClaimHash(), "hex");
            if(!claimHash.equals(expectedClaimHash)) throw new IntermediaryError("Invalid payment secret returned");
        }

        if(this.paymentHash==null || this.pr==null) {
            this.pr = hash.toString("hex");
            this.paymentHash = hash.toString("hex");
        }

        this.secret = result.secret;
        return Promise.resolve(true);
    }


    //////////////////////////////
    //// Amounts & fees

    getOutputToken(): BtcToken<true> {
        return BitcoinTokens.BTCLN;
    }

    getOutput(): TokenAmount<T["ChainId"], BtcToken<true>> {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln"))
            return toTokenAmount(null, this.outputToken, this.wrapper.prices, this.pricingInfo);
        const parsedPR = bolt11Decode(this.pr);
        if(parsedPR.millisatoshis==null) throw new Error("Swap invoice has no msat amount field!");
        const amount = (BigInt(parsedPR.millisatoshis) + 999n) / 1000n;
        return toTokenAmount(amount, this.outputToken, this.wrapper.prices, this.pricingInfo);
    }


    //////////////////////////////
    //// Getters & utils

    getOutputTxId(): string | null {
        const paymentHash = this.getPaymentHash();
        if(paymentHash==null) return null;
        return paymentHash.toString("hex");
    }

    /**
     * Returns the lightning BOLT11 invoice where the BTC will be sent to
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
     * Returns the confidence of the intermediary that this payment will succeed
     * Value between 0 and 1, where 0 is not likely and 1 is very likely
     */
    getConfidence(): number {
        return this.confidence;
    }

    /**
     * Checks whether a swap is likely to fail, based on the confidence as reported by the LP
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
     * Tries to detect if the target lightning invoice is a non-custodial mobile wallet, care must be taken
     *  for such a wallet to be online when attempting to make a swap
     */
    isPayingToNonCustodialWallet(): boolean {
        if(this.pr==null || !this.pr.toLowerCase().startsWith("ln")) return false;

        const parsedRequest = bolt11Decode(this.pr);

        if(parsedRequest.tagsObject.routing_info!=null) {
            return parsedRequest.tagsObject.routing_info.length>0;
        }
        return false;
    }

    getIdentifierHash(): Buffer {
        const idBuffer: Buffer = this.usesClaimHashAsId
            ? Buffer.from(this.getClaimHash(), "hex")
            : this.getPaymentHash()!;
        if(this.randomNonce==null) return idBuffer;
        return Buffer.concat([idBuffer, Buffer.from(this.randomNonce, "hex")]);
    }

    getPaymentHash(): Buffer | null {
        if(this.pr==null) return null;
        if(this.pr.toLowerCase().startsWith("ln")) {
            const parsed = bolt11Decode(this.pr);
            if(parsed.tagsObject.payment_hash==null) throw new Error("Swap invoice has no payment hash field!");
            return Buffer.from(parsed.tagsObject.payment_hash, "hex");
        }
        return Buffer.from(this.pr, "hex");
    }

    protected getLpIdentifier(): string {
        if(this.pr==null) return this.data.getEscrowHash();
        if(this.pr.toLowerCase().startsWith("ln")) {
            const parsed = bolt11Decode(this.pr);
            if(parsed.tagsObject.payment_hash==null) throw new Error("Swap invoice has no payment hash field!");
            return parsed.tagsObject.payment_hash;
        }
        return this.pr;
    }


    //////////////////////////////
    //// LNURL-pay

    /**
     * Is this an LNURL-pay swap?
     */
    isLNURL(): boolean {
        return this.lnurl!=null;
    }

    /**
     * Gets the used LNURL or null if this is not an LNURL-pay swap
     */
    getLNURL(): string | null {
        return this.lnurl ?? null;
    }

    /**
     * Checks whether this LNURL payment contains a success message
     */
    hasSuccessAction(): boolean {
        return this.successAction!=null;
    }

    /**
     * Returns the success action after a successful payment, else null
     */
    getSuccessAction(): LNURLDecodedSuccessAction | null {
        return LNURL.decodeSuccessAction(this.successAction, this.secret);
    }


    //////////////////////////////
    //// Storage

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
