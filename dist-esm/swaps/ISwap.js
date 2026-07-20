import { SwapType } from "../enums/SwapType";
import { EventEmitter } from "events";
import { randomBytes, toBigInt } from "../utils/Utils";
import { SwapDirection } from "../enums/SwapDirection";
import { ppmToPercentage } from "../types/fees/PercentagePPM";
import { isSCToken } from "../types/Token";
import { isPriceInfoType } from "../types/PriceInfoType";
/**
 * Type guard to check if an object is an ISwapInit
 *
 * @category Swaps/Base
 */
export function isISwapInit(obj) {
    return typeof obj === 'object' &&
        obj != null &&
        isPriceInfoType(obj.pricingInfo) &&
        (obj.url == null || typeof obj.url === 'string') &&
        typeof obj.expiry === 'number' &&
        typeof (obj.swapFee) === "bigint" &&
        typeof (obj.swapFeeBtc) === "bigint" &&
        (typeof obj.exactIn === 'boolean');
}
/**
 * Base abstract class for all swap types
 *
 * @category Swaps/Base
 */
export class ISwap {
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
         * Whether the swap is saved in the persistent storage or not.
         *
         * @remarks This field itself is not persisted but is instead derived during runtime
         *
         * @internal
         */
        this._persisted = false;
        /**
         * Event emitter emitting `"swapState"` event when swap's state changes
         */
        this.events = new EventEmitter();
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
            this._randomNonce = randomBytes(16).toString("hex");
            this._contractVersion = swapInitOrObj.contractVersion;
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
                    realPriceUSatPerToken: toBigInt(swapInitOrObj._realPriceUSatPerToken),
                    realPriceUsdPerBitcoin: swapInitOrObj._realPriceUsdPerBitcoin,
                    swapPriceUSatPerToken: BigInt(swapInitOrObj._swapPriceUSatPerToken),
                };
            }
            this.swapFee = toBigInt(swapInitOrObj.swapFee);
            this.swapFeeBtc = toBigInt(swapInitOrObj.swapFeeBtc);
            this.version = swapInitOrObj.version;
            this.initiated = swapInitOrObj.initiated;
            this.exactIn = swapInitOrObj.exactIn;
            this.createdAt = swapInitOrObj.createdAt ?? swapInitOrObj.expiry;
            this._randomNonce = swapInitOrObj.randomNonce;
            this._contractVersion = swapInitOrObj.contractVersion;
            this._meta = swapInitOrObj._meta;
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
            if (isSCToken(input.token) && this.getDirection() === SwapDirection.TO_BTC) {
                this.pricingInfo = this.wrapper._prices.recomputePriceInfoSend(this.chainIdentifier, output.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, input.rawAmount, input.token.address);
                this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
            }
            else if (isSCToken(output.token) && this.getDirection() === SwapDirection.FROM_BTC) {
                this.pricingInfo = this.wrapper._prices.recomputePriceInfoReceive(this.chainIdentifier, input.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, output.rawAmount, output.token.address);
                this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
            }
        }
    }
    /**
     * Returns the specific state along with the human-readable description of that state
     *
     * @internal
     */
    _getStateInfo(state) {
        return {
            state: state,
            name: this.swapStateName(state),
            description: this.swapStateDescription[state]
        };
    }
    /**
     * Re-fetches & revalidates the price data based on the current market prices
     */
    async refreshPriceData() {
        if (this.pricingInfo == null)
            return;
        const priceUsdPerBtc = this.pricingInfo.realPriceUsdPerBitcoin;
        const output = this.getOutput();
        if (output.isUnknown)
            return;
        if (isSCToken(this.getInputToken()) && this.getDirection() === SwapDirection.TO_BTC) {
            const input = this.getInputWithoutFee();
            if (input.isUnknown)
                return;
            this.pricingInfo = await this.wrapper._prices.isValidAmountSend(this.chainIdentifier, output.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, input.rawAmount + this.swapFee, input.token.address, undefined, undefined, this.swapFeeBtc);
            this.pricingInfo.realPriceUsdPerBitcoin = priceUsdPerBtc;
        }
        else if (isSCToken(output.token) && this.getDirection() === SwapDirection.FROM_BTC) {
            const input = this.getInput();
            if (input.isUnknown)
                return;
            this.pricingInfo = await this.wrapper._prices.isValidAmountReceive(this.chainIdentifier, input.rawAmount, this.pricingInfo.satsBaseFee, this.pricingInfo.feePPM, output.rawAmount, output.token.address, undefined, undefined, this.swapFeeBtc);
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
        const swapPrice = this.getDirection() === SwapDirection.TO_BTC ?
            100000000000000 / Number(this.pricingInfo.swapPriceUSatPerToken) :
            Number(this.pricingInfo.swapPriceUSatPerToken) / 100000000000000;
        let marketPrice;
        if (this.pricingInfo.realPriceUSatPerToken != null)
            marketPrice = this.getDirection() === SwapDirection.TO_BTC ?
                100000000000000 / Number(this.pricingInfo.realPriceUSatPerToken) :
                Number(this.pricingInfo.realPriceUSatPerToken) / 100000000000000;
        return {
            marketPrice,
            swapPrice,
            difference: ppmToPercentage(this.pricingInfo.differencePPM)
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
     * Await and prepares a list of passed transactions
     *
     * @param txsPromise
     * @internal
     */
    async prepareTransactions(txsPromise) {
        const txs = await txsPromise;
        if (this.wrapper._chain.prepareTxs == null)
            return txs;
        return await this.wrapper._chain.prepareTxs(txs);
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
        return this.TYPE === SwapType.TO_BTC || this.TYPE === SwapType.TO_BTCLN ? SwapDirection.TO_BTC : SwapDirection.FROM_BTC;
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
        return this._getStateInfo(this._state);
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
            randomNonce: this._randomNonce,
            contractVersion: this._contractVersion,
            _meta: this._meta
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
