"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ISwap = exports.isISwapInit = void 0;
const SwapType_1 = require("../enums/SwapType");
const events_1 = require("events");
const Utils_1 = require("../utils/Utils");
const SwapDirection_1 = require("../enums/SwapDirection");
const PercentagePPM_1 = require("../types/fees/PercentagePPM");
const Token_1 = require("../types/Token");
const PriceInfoType_1 = require("../types/PriceInfoType");
/**
 * Type guard to check if an object is an ISwapInit
 *
 * @category Swaps/Base
 */
function isISwapInit(obj) {
    return typeof obj === 'object' &&
        obj != null &&
        (0, PriceInfoType_1.isPriceInfoType)(obj.pricingInfo) &&
        (obj.url == null || typeof obj.url === 'string') &&
        typeof obj.expiry === 'number' &&
        typeof (obj.swapFee) === "bigint" &&
        typeof (obj.swapFeeBtc) === "bigint" &&
        (typeof obj.exactIn === 'boolean');
}
exports.isISwapInit = isISwapInit;
/**
 * Base abstract class for all swap types
 *
 * @category Swaps/Base
 */
class ISwap {
    constructor(wrapper, swapInitOrObj) {
        /**
         * Current newest defined version of the swap
         * @internal
         */
        this.currentVersion = 1;
        /**
         * Whether a swap was initialized, a swap is considered initialize on first interaction with it, i.e.
         *  calling commit() on a Smart chain -> Bitcoin swaps, calling waitForPayment() or similar on the other
         *  direction. Not initiated swaps are not saved to the persistent storage by default (see
         *  {@link SwapperOptions.saveUninitializedSwaps})
         * @internal
         */
        this.initiated = false;
        /**
         * Swap state
         * @internal
         */
        this._state = 0;
        /**
         * Event emitter emitting `"swapState"` event when swap's state changes
         */
        this.events = new events_1.EventEmitter();
        this.chainIdentifier = wrapper.chainIdentifier;
        this.wrapper = wrapper;
        if (isISwapInit(swapInitOrObj)) {
            this.pricingInfo = swapInitOrObj.pricingInfo;
            this.url = swapInitOrObj.url;
            this.expiry = swapInitOrObj.expiry;
            this.swapFee = swapInitOrObj.swapFee;
            this.swapFeeBtc = swapInitOrObj.swapFeeBtc;
            this.exactIn = swapInitOrObj.exactIn;
            this.version = this.currentVersion;
            this.createdAt = Date.now();
            this._randomNonce = (0, Utils_1.randomBytes)(16).toString("hex");
        }
        else {
            this.expiry = swapInitOrObj.expiry;
            this.url = swapInitOrObj.url;
            this._state = swapInitOrObj.state;
            if (swapInitOrObj._isValid != null && swapInitOrObj._differencePPM != null && swapInitOrObj._satsBaseFee != null &&
                swapInitOrObj._feePPM != null && swapInitOrObj._swapPriceUSatPerToken != null) {
                this.pricingInfo = {
                    isValid: swapInitOrObj._isValid,
                    differencePPM: BigInt(swapInitOrObj._differencePPM),
                    satsBaseFee: BigInt(swapInitOrObj._satsBaseFee),
                    feePPM: BigInt(swapInitOrObj._feePPM),
                    realPriceUSatPerToken: (0, Utils_1.toBigInt)(swapInitOrObj._realPriceUSatPerToken),
                    realPriceUsdPerBitcoin: swapInitOrObj._realPriceUsdPerBitcoin,
                    swapPriceUSatPerToken: BigInt(swapInitOrObj._swapPriceUSatPerToken),
                };
            }
            this.swapFee = (0, Utils_1.toBigInt)(swapInitOrObj.swapFee);
            this.swapFeeBtc = (0, Utils_1.toBigInt)(swapInitOrObj.swapFeeBtc);
            this.version = swapInitOrObj.version;
            this.initiated = swapInitOrObj.initiated;
            this.exactIn = swapInitOrObj.exactIn;
            this.createdAt = swapInitOrObj.createdAt ?? swapInitOrObj.expiry;
            this._randomNonce = swapInitOrObj.randomNonce;
        }
        if (this.version !== this.currentVersion) {
            this.upgradeVersion();
        }
        if (this.initiated == null)
            this.initiated = true;
    }
    /**
     * Waits till the swap reaches a specific state
     *
     * @param targetState The state to wait for
     * @param type Whether to wait for the state exactly or also to a state with a higher number
     * @param abortSignal Abort signal
     * @internal
     */
    waitTillState(targetState, type = "eq", abortSignal) {
        //TODO: This doesn't hold strong reference to the swap, hence if no other strong reference to the
        // swap exists, it will just never resolve!
        return new Promise((resolve, reject) => {
            let listener;
            listener = () => {
                if (type === "eq" ? this._state === targetState : type === "gte" ? this._state >= targetState : this._state != targetState) {
                    resolve();
                    this.events.removeListener("swapState", listener);
                }
            };
            this.events.on("swapState", listener);
            if (abortSignal != null)
                abortSignal.addEventListener("abort", () => {
                    this.events.removeListener("swapState", listener);
                    reject(abortSignal.reason);
                });
        });
    }
    //////////////////////////////
    //// Pricing
    /**
     * This attempts to populate missing fields in the pricing info based on the swap amounts
     *
     * @internal
     */
    tryRecomputeSwapPrice() {
        if (this.pricingInfo == null)
            return;
        if (this.pricingInfo.swapPriceUSatPerToken == null) {
            const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
            const input = this.getInput();
            const output = this.getOutput();
            if (input.isUnknown || output.isUnknown)
                return;
            if ((0, Token_1.isSCToken)(input.token) && this.getDirection() === SwapDirection_1.SwapDirection.TO_BTC) {
                this.pricingInfo = this.wrapper._prices.recomputePriceInfoSend(this.chainIdentifier, output.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, input.rawAmount, input.token.address);
                this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
            }
            else if ((0, Token_1.isSCToken)(output.token) && this.getDirection() === SwapDirection_1.SwapDirection.FROM_BTC) {
                this.pricingInfo = this.wrapper._prices.recomputePriceInfoReceive(this.chainIdentifier, input.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, output.rawAmount, output.token.address);
                this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
            }
        }
    }
    /**
     * Re-fetches & revalidates the price data based on the current market prices
     */
    async refreshPriceData() {
        if (this.pricingInfo == null)
            return;
        const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
        const input = this.getInput();
        const output = this.getOutput();
        if (input.isUnknown || output.isUnknown)
            return;
        if ((0, Token_1.isSCToken)(input.token) && this.getDirection() === SwapDirection_1.SwapDirection.TO_BTC) {
            this.pricingInfo = await this.wrapper._prices.isValidAmountSend(this.chainIdentifier, output.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, input.rawAmount, input.token.address);
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
        else if ((0, Token_1.isSCToken)(output.token) && this.getDirection() === SwapDirection_1.SwapDirection.FROM_BTC) {
            this.pricingInfo = await this.wrapper._prices.isValidAmountReceive(this.chainIdentifier, input.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, output.rawAmount, output.token.address);
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
    }
    /**
     * Checks if the pricing for the swap is valid, according to max allowed price difference set in the ISwapPrice
     */
    hasValidPrice() {
        if (this.pricingInfo == null)
            throw new Error("Pricing info not found, cannot check price validity!");
        return this.pricingInfo.isValid;
    }
    /**
     * Returns pricing info about the swap
     */
    getPriceInfo() {
        if (this.pricingInfo == null)
            throw new Error("Pricing info not provided and not known!");
        const swapPrice = this.getDirection() === SwapDirection_1.SwapDirection.TO_BTC ?
            100000000000000 / Number(this.pricingInfo.swapPriceUSatPerToken) :
            Number(this.pricingInfo.swapPriceUSatPerToken) / 100000000000000;
        let marketPrice;
        if (this.pricingInfo.realPriceUSatPerToken != null)
            marketPrice = this.getDirection() === SwapDirection_1.SwapDirection.TO_BTC ?
                100000000000000 / Number(this.pricingInfo.realPriceUSatPerToken) :
                Number(this.pricingInfo.realPriceUSatPerToken) / 100000000000000;
        return {
            marketPrice,
            swapPrice,
            difference: (0, PercentagePPM_1.ppmToPercentage)(this.pricingInfo.differencePPM)
        };
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * Asserts a given signer is the initiator of this swap
     *
     * @param signer Signer to check with this swap's initiator
     * @throws {Error} When signer's address doesn't match with the swap's initiator one
     * @internal
     */
    checkSigner(signer) {
        if ((typeof (signer) === "string" ? signer : signer.getAddress()) !== this._getInitiator())
            throw new Error("Invalid signer provided!");
    }
    /**
     * Sets this swap as initiated
     * @internal
     */
    _setInitiated() {
        this.initiated = true;
    }
    /**
     * Whether a swap was initialized, a swap is considered initialized on first interaction with it, i.e.
     *  calling commit() on a Smart chain -> Bitcoin swaps, calling waitForPayment() or similar on the other
     *  direction. Not initiated swaps are not saved to the persistent storage by default (see
     *  {@link SwapperOptions.saveUninitializedSwaps})
     */
    isInitiated() {
        return this.initiated;
    }
    /**
     * Returns quote expiry in UNIX millis
     */
    getQuoteExpiry() {
        return this.expiry;
    }
    /**
     * Returns the type of the swap
     */
    getType() {
        return this.TYPE;
    }
    /**
     * Returns the direction of the swap
     */
    getDirection() {
        return this.TYPE === SwapType_1.SwapType.TO_BTC || this.TYPE === SwapType_1.SwapType.TO_BTCLN ? SwapDirection_1.SwapDirection.TO_BTC : SwapDirection_1.SwapDirection.FROM_BTC;
    }
    /**
     * Returns the current state of the swap
     */
    getState() {
        return this._state;
    }
    /**
     * Returns the current state of the swap along with the human-readable description of the state
     */
    getStateInfo() {
        return {
            state: this._state,
            name: this.swapStateName(this._state),
            description: this.swapStateDescription[this._state]
        };
    }
    //////////////////////////////
    //// Storage
    /**
     * Saves the swap data to the underlying storage, or removes it if it is in a quote expired state
     *
     * @internal
     */
    _save() {
        if (this.isQuoteExpired()) {
            return this.wrapper._removeSwapData(this);
        }
        else {
            return this.wrapper._saveSwapData(this);
        }
    }
    /**
     * Saves the swap data and also emits a swap state change
     *
     * @param state Optional state to set before the swap is saved an event emitted
     *
     * @internal
     */
    async _saveAndEmit(state) {
        if (state != null)
            this._state = state;
        await this._save();
        this._emitEvent();
    }
    /**
     * Serializes the swap to a JSON stringifiable representation (i.e. no bigints, buffers etc.)
     */
    serialize() {
        if (this.pricingInfo == null)
            return {};
        return {
            id: this.getId(),
            type: this.getType(),
            escrowHash: this._getEscrowHash(),
            initiator: this._getInitiator(),
            _isValid: this.pricingInfo.isValid,
            _differencePPM: this.pricingInfo.differencePPM == null ? null : this.pricingInfo.differencePPM.toString(10),
            _satsBaseFee: this.pricingInfo.satsBaseFee == null ? null : this.pricingInfo.satsBaseFee.toString(10),
            _feePPM: this.pricingInfo.feePPM == null ? null : this.pricingInfo.feePPM.toString(10),
            _realPriceUSatPerToken: this.pricingInfo.realPriceUSatPerToken == null ? null : this.pricingInfo.realPriceUSatPerToken.toString(10),
            _realPriceUsdPerBitcoin: this.pricingInfo.realPriceUsdPerBitcoin,
            _swapPriceUSatPerToken: this.pricingInfo.swapPriceUSatPerToken == null ? null : this.pricingInfo.swapPriceUSatPerToken.toString(10),
            state: this._state,
            url: this.url,
            swapFee: this.swapFee == null ? null : this.swapFee.toString(10),
            swapFeeBtc: this.swapFeeBtc == null ? null : this.swapFeeBtc.toString(10),
            expiry: this.expiry,
            version: this.version,
            initiated: this.initiated,
            exactIn: this.exactIn,
            createdAt: this.createdAt,
            randomNonce: this._randomNonce
        };
    }
    //////////////////////////////
    //// Events
    /**
     * Emits a `swapState` event with the current swap
     *
     * @internal
     */
    _emitEvent() {
        this.wrapper.events.emit("swapState", this);
        this.events.emit("swapState", this);
    }
}
exports.ISwap = ISwap;
