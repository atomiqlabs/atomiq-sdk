import {ToBTCDefinition, ToBTCWrapper} from "./ToBTCWrapper";
import {isIToBTCSwapInit, IToBTCSwap, IToBTCSwapInit} from "../IToBTCSwap";
import {SwapType} from "../../../../enums/SwapType";
import {ChainType, SwapData} from "@atomiqlabs/base";
import {Buffer} from "buffer";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {toBigInt} from "../../../../utils/Utils";
import {TokenAmount, toTokenAmount} from "../../../../types/TokenAmount";
import {BitcoinTokens, BtcToken, Token} from "../../../../types/Token";
import {getLogger, LoggerType} from "../../../../utils/Logger";


export type ToBTCSwapInit<T extends SwapData> = IToBTCSwapInit<T> & {
    address: string;
    amount: bigint;
    confirmationTarget: number;
    satsPerVByte: number;
    requiredConfirmations: number;
    nonce: bigint;
};

export function isToBTCSwapInit<T extends SwapData>(obj: any): obj is ToBTCSwapInit<T> {
    return typeof (obj.address) === "string" &&
        typeof(obj.amount) === "bigint" &&
        typeof (obj.confirmationTarget) === "number" &&
        typeof (obj.satsPerVByte) === "number" &&
        typeof (obj.requiredConfirmations) === "number" &&
        typeof (obj.nonce) === "bigint" &&
        isIToBTCSwapInit<T>(obj);
}

export class ToBTCSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCDefinition<T>> {
    protected readonly outputToken: BtcToken<false> = BitcoinTokens.BTC;
    protected readonly TYPE = SwapType.TO_BTC;
    protected readonly logger: LoggerType;

    private readonly address: string;
    private readonly amount: bigint;
    private readonly confirmationTarget: number;
    private readonly satsPerVByte: number;

    private readonly requiredConfirmations: number;
    private readonly nonce: bigint;

    private txId?: string;

    constructor(wrapper: ToBTCWrapper<T>, serializedObject: any);
    constructor(wrapper: ToBTCWrapper<T>, init: ToBTCSwapInit<T["Data"]>);
    constructor(
        wrapper: ToBTCWrapper<T>,
        initOrObject: ToBTCSwapInit<T["Data"]> | any
    ) {
        if(isToBTCSwapInit(initOrObject) && initOrObject.url!=null) initOrObject.url += "/tobtc";
        super(wrapper, initOrObject);
        if(isToBTCSwapInit(initOrObject)) {
            this.address = initOrObject.address;
            this.amount = initOrObject.amount;
            this.confirmationTarget = initOrObject.confirmationTarget;
            this.satsPerVByte = initOrObject.satsPerVByte;
            this.requiredConfirmations = initOrObject.requiredConfirmations;
            this.nonce = initOrObject.nonce;
        } else {
            this.address = initOrObject.address;
            this.amount = BigInt(initOrObject.amount);
            this.confirmationTarget = initOrObject.confirmationTarget;
            this.satsPerVByte = initOrObject.satsPerVByte;
            this.txId = initOrObject.txId;

            this.requiredConfirmations = initOrObject.requiredConfirmations ?? this.data.getConfirmationsHint();
            this.nonce = toBigInt(initOrObject.nonce) ?? this.data.getNonceHint();
        }
        this.logger = getLogger("ToBTC("+this.getIdentifierHashString()+"): ");
        this.tryRecomputeSwapPrice();
    }

    async _setPaymentResult(result: { secret?: string; txId?: string }, check: boolean = false): Promise<boolean> {
        if(result==null) return false;
        if(result.txId==null) throw new IntermediaryError("No btc txId returned!");
        if(check) {
            const btcTx = await this.wrapper.btcRpc.getTransaction(result.txId);
            if(btcTx==null) return false;

            const foundVout = btcTx.outs.find(vout => this.data.getClaimHash()===this.wrapper.contract.getHashForOnchain(
                Buffer.from(vout.scriptPubKey.hex, "hex"),
                BigInt(vout.value),
                this.requiredConfirmations,
                this.nonce
            ).toString("hex"));

            if(foundVout==null) throw new IntermediaryError("Invalid btc txId returned");
        }
        this.txId = result.txId;
        return true;
    }


    //////////////////////////////
    //// Amounts & fees

    getOutputToken(): BtcToken<false> {
        return BitcoinTokens.BTC;
    }

    getOutput(): TokenAmount<T["ChainId"], BtcToken<false>> {
        return toTokenAmount(this.amount, this.outputToken, this.wrapper.prices, this.pricingInfo);
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * Returns the bitcoin address where the BTC will be sent to
     */
    getOutputAddress(): string {
        return this.address;
    }

    getOutputTxId(): string | null {
        return this.txId ?? null;
    }

    /**
     * Returns fee rate of the bitcoin transaction in sats/vB
     */
    getBitcoinFeeRate(): number {
        return this.satsPerVByte;
    }


    //////////////////////////////
    //// Storage

    serialize(): any {
        return {
            ...super.serialize(),
            address: this.address,
            amount: this.amount.toString(10),
            confirmationTarget: this.confirmationTarget,
            satsPerVByte: this.satsPerVByte,
            nonce: this.nonce==null ? null : this.nonce.toString(10),
            requiredConfirmations: this.requiredConfirmations,
            txId: this.txId
        };
    }

}
