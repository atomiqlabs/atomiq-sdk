import { isIToBTCSwapInit, IToBTCSwap } from "../IToBTCSwap.js";
import { SwapType } from "../../../../enums/SwapType.js";
import { Buffer } from "buffer";
import { IntermediaryError } from "../../../../errors/IntermediaryError.js";
import { toBigInt } from "../../../../utils/Utils.js";
import { toTokenAmount } from "../../../../types/TokenAmount.js";
import { BitcoinTokens } from "../../../../types/Token.js";
import { getLogger } from "../../../../utils/Logger.js";
import { fromOutputScript } from "../../../../utils/BitcoinUtils.js";
export function isToBTCSwapInit(obj) {
    return (obj.address == null || typeof (obj.address) === "string") &&
        (obj.amount == null || typeof (obj.amount) === "bigint") &&
        typeof (obj.confirmationTarget) === "number" &&
        typeof (obj.satsPerVByte) === "number" &&
        (obj.requiredConfirmations == null || typeof (obj.requiredConfirmations) === "number") &&
        (obj.nonce == null || typeof (obj.nonce) === "bigint") &&
        isIToBTCSwapInit(obj);
}
/**
 * Escrow based (PrTLC) swap for Smart chains -> Bitcoin
 *
 * @category Swaps/Smart chain → Bitcoin
 */
export class ToBTCSwap extends IToBTCSwap {
    constructor(wrapper, initOrObject) {
        if (isToBTCSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/tobtc";
        super(wrapper, initOrObject);
        this.TYPE = SwapType.TO_BTC;
        /**
         * @internal
         */
        this.outputToken = BitcoinTokens.BTC;
        if (isToBTCSwapInit(initOrObject)) {
            this.address = initOrObject.address;
            this.amount = initOrObject.amount;
            this.confirmationTarget = initOrObject.confirmationTarget;
            this.satsPerVByte = initOrObject.satsPerVByte;
            this.requiredConfirmations = initOrObject.requiredConfirmations;
            this.nonce = initOrObject.nonce;
        }
        else {
            this.address = initOrObject.address;
            this.amount = toBigInt(initOrObject.amount);
            this.confirmationTarget = initOrObject.confirmationTarget;
            this.satsPerVByte = initOrObject.satsPerVByte;
            this.txId = initOrObject.txId;
            this.requiredConfirmations = initOrObject.requiredConfirmations ?? this._data.getConfirmationsHint();
            this.nonce = toBigInt(initOrObject.nonce) ?? this._data.getNonceHint();
        }
        this.logger = getLogger("ToBTC(" + this.getIdentifierHashString() + "): ");
        this.tryRecomputeSwapPrice();
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _setPaymentResult(result, check = false) {
        if (result == null)
            return false;
        if (result.txId == null)
            throw new IntermediaryError("No btc txId returned!");
        if (check || this.address == null || this.amount == null || this.nonce == null || this.requiredConfirmations == null) {
            const btcTx = await this.wrapper._btcRpc.getTransaction(result.txId);
            if (btcTx == null)
                return false;
            //Extract nonce from tx
            const nonce = this.nonce ?? (BigInt(btcTx.ins[0].sequence) & 0x00ffffffn) | (BigInt(btcTx.locktime - 500000000) << 24n);
            let requiredConfirmations = this.requiredConfirmations;
            const foundVout = btcTx.outs.find(vout => {
                if (requiredConfirmations != null) {
                    return this._data.getClaimHash() === this._contract.getHashForOnchain(Buffer.from(vout.scriptPubKey.hex, "hex"), BigInt(vout.value), requiredConfirmations, nonce).toString("hex");
                }
                else {
                    for (let i = 1; i <= 20; i++) {
                        if (this._data.getClaimHash() === this._contract.getHashForOnchain(Buffer.from(vout.scriptPubKey.hex, "hex"), BigInt(vout.value), i, nonce).toString("hex")) {
                            requiredConfirmations = i;
                            return true;
                        }
                    }
                }
            });
            if (requiredConfirmations == null)
                this.logger.warn(`_setPaymentResult(): Tried to recover data from bitcoin transaction ${result.txId} data, but wasn't able to!`);
            if (foundVout != null) {
                this.nonce = nonce;
                this.address = fromOutputScript(this.wrapper._options.bitcoinNetwork, foundVout.scriptPubKey.hex);
                this.amount = BigInt(foundVout.value);
                this.requiredConfirmations = requiredConfirmations;
            }
            else {
                if (check)
                    throw new IntermediaryError("Invalid btc txId returned");
            }
        }
        this.txId = result.txId;
        return true;
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * @inheritDoc
     */
    getOutputToken() {
        return BitcoinTokens.BTC;
    }
    /**
     * @inheritDoc
     */
    getOutput() {
        return toTokenAmount(this.amount ?? null, this.outputToken, this.wrapper._prices, this.pricingInfo);
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * @inheritDoc
     */
    getOutputAddress() {
        return this.address ?? null;
    }
    /**
     * @inheritDoc
     */
    getOutputTxId() {
        return this.txId ?? null;
    }
    /**
     * Returns fee rate of the output bitcoin transaction in sats/vB as reported by the intermediary (LP)
     */
    getBitcoinFeeRate() {
        return this.satsPerVByte;
    }
    //////////////////////////////
    //// Storage
    /**
     * @inheritDoc
     */
    serialize() {
        return {
            ...super.serialize(),
            address: this.address,
            amount: this.amount == null ? null : this.amount.toString(10),
            confirmationTarget: this.confirmationTarget,
            satsPerVByte: this.satsPerVByte,
            nonce: this.nonce == null ? null : this.nonce.toString(10),
            requiredConfirmations: this.requiredConfirmations,
            txId: this.txId
        };
    }
}
/**
 * Type guard narrowing an {@link ISwap} to a {@link ToBTCSwap} (an on-chain
 * smart chain -> Bitcoin escrow swap, {@link SwapType.TO_BTC}).
 */
export function isToBTCSwap(swap) {
    return swap.getType() === SwapType.TO_BTC;
}
