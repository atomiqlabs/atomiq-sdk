"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToBTCSwap = exports.isToBTCSwapInit = void 0;
const IToBTCSwap_1 = require("../IToBTCSwap");
const SwapType_1 = require("../../../../enums/SwapType");
const buffer_1 = require("buffer");
const IntermediaryError_1 = require("../../../../errors/IntermediaryError");
const Utils_1 = require("../../../../utils/Utils");
const TokenAmount_1 = require("../../../../types/TokenAmount");
const Token_1 = require("../../../../types/Token");
const Logger_1 = require("../../../../utils/Logger");
function isToBTCSwapInit(obj) {
    return (obj.address == null || typeof (obj.address) === "string") &&
        (obj.amount == null || typeof (obj.amount) === "bigint") &&
        typeof (obj.confirmationTarget) === "number" &&
        typeof (obj.satsPerVByte) === "number" &&
        (obj.requiredConfirmations == null || typeof (obj.requiredConfirmations) === "number") &&
        (obj.nonce == null || typeof (obj.nonce) === "bigint") &&
        (0, IToBTCSwap_1.isIToBTCSwapInit)(obj);
}
exports.isToBTCSwapInit = isToBTCSwapInit;
/**
 * Smart Chain to on-chain BTC swap
 * @category Swaps
 */
class ToBTCSwap extends IToBTCSwap_1.IToBTCSwap {
    constructor(wrapper, initOrObject) {
        if (isToBTCSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/tobtc";
        super(wrapper, initOrObject);
        this.outputToken = Token_1.BitcoinTokens.BTC;
        this.TYPE = SwapType_1.SwapType.TO_BTC;
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
            this.amount = (0, Utils_1.toBigInt)(initOrObject.amount);
            this.confirmationTarget = initOrObject.confirmationTarget;
            this.satsPerVByte = initOrObject.satsPerVByte;
            this.txId = initOrObject.txId;
            this.requiredConfirmations = initOrObject.requiredConfirmations ?? this.data.getConfirmationsHint();
            this.nonce = (0, Utils_1.toBigInt)(initOrObject.nonce) ?? this.data.getNonceHint();
        }
        this.logger = (0, Logger_1.getLogger)("ToBTC(" + this.getIdentifierHashString() + "): ");
        this.tryRecomputeSwapPrice();
    }
    async _setPaymentResult(result, check = false) {
        if (result == null)
            return false;
        if (result.txId == null)
            throw new IntermediaryError_1.IntermediaryError("No btc txId returned!");
        if (check || this.address == null || this.amount == null || this.nonce == null || this.requiredConfirmations == null) {
            const btcTx = await this.wrapper.btcRpc.getTransaction(result.txId);
            if (btcTx == null)
                return false;
            //Extract nonce from tx
            const nonce = this.nonce ?? (BigInt(btcTx.ins[0].sequence) & 0x00ffffffn) | (BigInt(btcTx.locktime - 500000000) << 24n);
            let requiredConfirmations = this.requiredConfirmations;
            const foundVout = btcTx.outs.find(vout => {
                if (requiredConfirmations != null) {
                    return this.data.getClaimHash() === this.wrapper.contract.getHashForOnchain(buffer_1.Buffer.from(vout.scriptPubKey.hex, "hex"), BigInt(vout.value), requiredConfirmations, nonce).toString("hex");
                }
                else {
                    for (let i = 1; i <= 20; i++) {
                        if (this.data.getClaimHash() === this.wrapper.contract.getHashForOnchain(buffer_1.Buffer.from(vout.scriptPubKey.hex, "hex"), BigInt(vout.value), i, nonce).toString("hex")) {
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
                if (this.wrapper.btcRpc.outputScriptToAddress != null)
                    this.address = await this.wrapper.btcRpc.outputScriptToAddress(foundVout.scriptPubKey.hex);
                this.amount = BigInt(foundVout.value);
                this.requiredConfirmations = requiredConfirmations;
            }
            else {
                if (check)
                    throw new IntermediaryError_1.IntermediaryError("Invalid btc txId returned");
            }
        }
        this.txId = result.txId;
        return true;
    }
    //////////////////////////////
    //// Amounts & fees
    getOutputToken() {
        return Token_1.BitcoinTokens.BTC;
    }
    getOutput() {
        return (0, TokenAmount_1.toTokenAmount)(this.amount ?? null, this.outputToken, this.wrapper.prices, this.pricingInfo);
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * Returns the bitcoin address where the BTC will be sent to
     */
    getOutputAddress() {
        return this.address ?? null;
    }
    getOutputTxId() {
        return this.txId ?? null;
    }
    /**
     * Returns fee rate of the bitcoin transaction in sats/vB
     */
    getBitcoinFeeRate() {
        return this.satsPerVByte;
    }
    //////////////////////////////
    //// Storage
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
exports.ToBTCSwap = ToBTCSwap;
