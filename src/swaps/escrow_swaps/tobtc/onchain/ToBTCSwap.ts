import {ToBTCDefinition, ToBTCWrapper} from "./ToBTCWrapper";
import {isIToBTCSwapInit, IToBTCSwap, IToBTCSwapInit} from "../IToBTCSwap";
import {SwapType} from "../../../../enums/SwapType";
import {ChainType, SwapData} from "@atomiqlabs/base";
import {Buffer} from "buffer";
import {IntermediaryError} from "../../../../errors/IntermediaryError";
import {toBigInt} from "../../../../utils/Utils";
import {TokenAmount, toTokenAmount} from "../../../../types/TokenAmount";
import {BitcoinTokens, BtcToken} from "../../../../types/Token";
import {getLogger, LoggerType} from "../../../../utils/Logger";


export type ToBTCSwapInit<T extends SwapData> = IToBTCSwapInit<T> & {
    address?: string;
    amount?: bigint;
    confirmationTarget: number;
    satsPerVByte: number;
    requiredConfirmations?: number;
    nonce?: bigint;
};

export function isToBTCSwapInit<T extends SwapData>(obj: any): obj is ToBTCSwapInit<T> {
    return (obj.address==null || typeof (obj.address) === "string") &&
        (obj.amount==null || typeof(obj.amount) === "bigint") &&
        typeof (obj.confirmationTarget) === "number" &&
        typeof (obj.satsPerVByte) === "number" &&
        (obj.requiredConfirmations==null || typeof (obj.requiredConfirmations) === "number") &&
        (obj.nonce==null || typeof (obj.nonce) === "bigint") &&
        isIToBTCSwapInit<T>(obj);
}

/**
 * Smart Chain to on-chain BTC swap
 * @category Swaps
 */
export class ToBTCSwap<T extends ChainType = ChainType> extends IToBTCSwap<T, ToBTCDefinition<T>> {
    protected readonly outputToken: BtcToken<false> = BitcoinTokens.BTC;
    protected readonly TYPE = SwapType.TO_BTC;
    protected readonly logger: LoggerType;

    private address?: string;
    private amount?: bigint;
    private readonly confirmationTarget: number;
    private readonly satsPerVByte: number;

    private requiredConfirmations?: number;
    private nonce?: bigint;

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
            this.amount = toBigInt(initOrObject.amount);
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
        if(check || this.address==null || this.amount==null || this.nonce==null || this.requiredConfirmations==null) {
            const btcTx = await this.wrapper.btcRpc.getTransaction(result.txId);
            if(btcTx==null) return false;

            //Extract nonce from tx
            const nonce = this.nonce ?? (BigInt(btcTx.ins[0].sequence) & 0x00FFFFFFn) | (BigInt(btcTx.locktime - 500_000_000) << 24n);
            let requiredConfirmations = this.requiredConfirmations;

            const foundVout = btcTx.outs.find(vout => {
                if(requiredConfirmations!=null) {
                    return this.data.getClaimHash()===this.wrapper.contract.getHashForOnchain(
                        Buffer.from(vout.scriptPubKey.hex, "hex"),
                        BigInt(vout.value),
                        requiredConfirmations,
                        nonce
                    ).toString("hex");
                } else {
                    for(let i=1;i<=20;i++) {
                        if(
                            this.data.getClaimHash()===this.wrapper.contract.getHashForOnchain(
                                Buffer.from(vout.scriptPubKey.hex, "hex"),
                                BigInt(vout.value),
                                i,
                                nonce
                            ).toString("hex")
                        ) {
                            requiredConfirmations = i;
                            return true;
                        }
                    }
                }
            });

            if(requiredConfirmations==null) this.logger.warn(`_setPaymentResult(): Tried to recover data from bitcoin transaction ${result.txId} data, but wasn't able to!`);

            if(foundVout!=null) {
                this.nonce = nonce;
                if(this.wrapper.btcRpc.outputScriptToAddress!=null)
                    this.address = await this.wrapper.btcRpc.outputScriptToAddress(foundVout.scriptPubKey.hex);
                this.amount = BigInt(foundVout.value);
                this.requiredConfirmations = requiredConfirmations;
            } else {
                if(check) throw new IntermediaryError("Invalid btc txId returned");
            }
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
        return toTokenAmount(this.amount ?? null, this.outputToken, this.wrapper.prices, this.pricingInfo);
    }


    //////////////////////////////
    //// Getters & utils

    /**
     * Returns the bitcoin address where the BTC will be sent to
     */
    getOutputAddress(): string | null {
        return this.address ?? null;
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
            amount: this.amount==null ? null : this.amount.toString(10),
            confirmationTarget: this.confirmationTarget,
            satsPerVByte: this.satsPerVByte,
            nonce: this.nonce==null ? null : this.nonce.toString(10),
            requiredConfirmations: this.requiredConfirmations,
            txId: this.txId
        };
    }

}
