"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FromBTCSwap = exports.isFromBTCSwapInit = exports.FromBTCSwapState = void 0;
const IFromBTCSelfInitSwap_1 = require("../IFromBTCSelfInitSwap");
const SwapType_1 = require("../../../../enums/SwapType");
const base_1 = require("@atomiqlabs/base");
const buffer_1 = require("buffer");
const Utils_1 = require("../../../../utils/Utils");
const BitcoinUtils_1 = require("../../../../utils/BitcoinUtils");
const IBitcoinWallet_1 = require("../../../../bitcoin/wallet/IBitcoinWallet");
const btc_signer_1 = require("@scure/btc-signer");
const SingleAddressBitcoinWallet_1 = require("../../../../bitcoin/wallet/SingleAddressBitcoinWallet");
const IEscrowSelfInitSwap_1 = require("../../IEscrowSelfInitSwap");
const TokenAmount_1 = require("../../../../types/TokenAmount");
const Token_1 = require("../../../../types/Token");
const Logger_1 = require("../../../../utils/Logger");
const BitcoinWalletUtils_1 = require("../../../../utils/BitcoinWalletUtils");
/**
 * State enum for legacy escrow based Bitcoin -> Smart chain swaps.
 *
 * @category Swaps
 */
var FromBTCSwapState;
(function (FromBTCSwapState) {
    /**
     * Bitcoin swap address has expired and the intermediary (LP) has already refunded
     *  its funds. No BTC should be sent anymore!
     */
    FromBTCSwapState[FromBTCSwapState["FAILED"] = -4] = "FAILED";
    /**
     * Bitcoin swap address has expired, user should not send any BTC anymore! Though
     *  the intermediary (LP) hasn't refunded yet. So if there is a transaction already
     *  in-flight the swap might still succeed.
     */
    FromBTCSwapState[FromBTCSwapState["EXPIRED"] = -3] = "EXPIRED";
    /**
     * Swap has expired for good and there is no way how it can be executed anymore
     */
    FromBTCSwapState[FromBTCSwapState["QUOTE_EXPIRED"] = -2] = "QUOTE_EXPIRED";
    /**
     * A swap is almost expired, and it should be presented to the user as expired, though
     *  there is still a chance that it will be processed
     */
    FromBTCSwapState[FromBTCSwapState["QUOTE_SOFT_EXPIRED"] = -1] = "QUOTE_SOFT_EXPIRED";
    /**
     * Swap quote was created, use the {@link FromBTCSwap.commit} or {@link FromBTCSwap.txsCommit} functions
     *  to initiate it by creating the swap escrow on the destination smart chain
     */
    FromBTCSwapState[FromBTCSwapState["PR_CREATED"] = 0] = "PR_CREATED";
    /**
     * Swap escrow was initiated (committed) on the destination chain, user can send the BTC to the
     *  swap address with the {@link FromBTCSwap.getFundedPsbt}, {@link FromBTCSwap.getAddress} or
     *  {@link FromBTCSwap.getHyperlink} functions.
     */
    FromBTCSwapState[FromBTCSwapState["CLAIM_COMMITED"] = 1] = "CLAIM_COMMITED";
    /**
     * Input bitcoin transaction was confirmed, wait for automatic settlement by the watchtower
     *  or settle manually using the {@link FromBTCSwap.claim} or {@link FromBTCSwap.txsClaim}
     *  function.
     */
    FromBTCSwapState[FromBTCSwapState["BTC_TX_CONFIRMED"] = 2] = "BTC_TX_CONFIRMED";
    /**
     * Swap successfully settled and funds received on the destination chain
     */
    FromBTCSwapState[FromBTCSwapState["CLAIM_CLAIMED"] = 3] = "CLAIM_CLAIMED";
})(FromBTCSwapState = exports.FromBTCSwapState || (exports.FromBTCSwapState = {}));
function isFromBTCSwapInit(obj) {
    return typeof (obj.data) === "object" &&
        (obj.address == null || typeof (obj.address) === "string") &&
        (obj.amount == null || typeof (obj.amount) === "bigint") &&
        (obj.requiredConfirmations == null || typeof (obj.requiredConfirmations) === "number") &&
        (0, IEscrowSelfInitSwap_1.isIEscrowSelfInitSwapInit)(obj);
}
exports.isFromBTCSwapInit = isFromBTCSwapInit;
/**
 * Legacy escrow (PrTLC) based swap for Bitcoin -> Smart chains, requires manual initiation
 *  of the swap escrow on the destination chain.
 *
 * @category Swaps
 */
class FromBTCSwap extends IFromBTCSelfInitSwap_1.IFromBTCSelfInitSwap {
    constructor(wrapper, initOrObject) {
        if (isFromBTCSwapInit(initOrObject) && initOrObject.url != null)
            initOrObject.url += "/frombtc";
        super(wrapper, initOrObject);
        this.TYPE = SwapType_1.SwapType.FROM_BTC;
        /**
         * @internal
         */
        this.inputToken = Token_1.BitcoinTokens.BTC;
        if (isFromBTCSwapInit(initOrObject)) {
            this._state = FromBTCSwapState.PR_CREATED;
            this._data = initOrObject.data;
            this.feeRate = initOrObject.feeRate;
            this.address = initOrObject.address;
            this.amount = initOrObject.amount;
            this.requiredConfirmations = initOrObject.requiredConfirmations;
        }
        else {
            this.address = initOrObject.address;
            this.amount = (0, Utils_1.toBigInt)(initOrObject.amount);
            this.senderAddress = initOrObject.senderAddress;
            this.txId = initOrObject.txId;
            this.vout = initOrObject.vout;
            this.requiredConfirmations = initOrObject.requiredConfirmations ?? this._data.getConfirmationsHint();
        }
        this.tryRecomputeSwapPrice();
        this.logger = (0, Logger_1.getLogger)("FromBTC(" + this.getIdentifierHashString() + "): ");
    }
    /**
     * @inheritDoc
     * @internal
     */
    getSwapData() {
        return this._data;
    }
    /**
     * @inheritDoc
     * @internal
     */
    upgradeVersion() {
        if (this.version == null) {
            switch (this._state) {
                case -2:
                    this._state = FromBTCSwapState.FAILED;
                    break;
                case -1:
                    this._state = FromBTCSwapState.QUOTE_EXPIRED;
                    break;
                case 0:
                    this._state = FromBTCSwapState.PR_CREATED;
                    break;
                case 1:
                    this._state = FromBTCSwapState.CLAIM_COMMITED;
                    break;
                case 2:
                    this._state = FromBTCSwapState.BTC_TX_CONFIRMED;
                    break;
                case 3:
                    this._state = FromBTCSwapState.CLAIM_CLAIMED;
                    break;
            }
            this.version = 1;
        }
    }
    //////////////////////////////
    //// Getters & utils
    /**
     * Returns bitcoin address where the on-chain BTC should be sent to
     */
    getAddress() {
        if (this._state === FromBTCSwapState.PR_CREATED)
            throw new Error("Cannot get bitcoin address of non-initiated swaps! Initiate swap first with commit() or txsCommit().");
        return this.address ?? "";
    }
    /**
     * Unsafe bitcoin hyperlink getter, returns the address even before the swap is committed!
     *
     * @private
     */
    _getHyperlink() {
        return this.address == null || this.amount == null ? "" : "bitcoin:" + this.address + "?amount=" + encodeURIComponent((Number(this.amount) / 100000000).toString(10));
    }
    /**
     * @inheritDoc
     */
    getHyperlink() {
        if (this._state === FromBTCSwapState.PR_CREATED)
            throw new Error("Cannot get bitcoin address of non-initiated swaps! Initiate swap first with commit() or txsCommit().");
        return this._getHyperlink();
    }
    /**
     * @inheritDoc
     */
    getInputAddress() {
        return this.senderAddress ?? null;
    }
    /**
     * @inheritDoc
     */
    getInputTxId() {
        return this.txId ?? null;
    }
    /**
     * Returns timeout time (in UNIX milliseconds) when the on-chain address will expire and no funds should be sent
     *  to that address anymore
     */
    getTimeoutTime() {
        return Number(this.wrapper._getOnchainSendTimeout(this._data, this.requiredConfirmations ?? 6)) * 1000;
    }
    /**
     * @inheritDoc
     */
    requiresAction() {
        return this.isClaimable() || (this._state === FromBTCSwapState.CLAIM_COMMITED && this.getTimeoutTime() > Date.now() && this.txId == null);
    }
    /**
     * @inheritDoc
     */
    isFinished() {
        return this._state === FromBTCSwapState.CLAIM_CLAIMED || this._state === FromBTCSwapState.QUOTE_EXPIRED || this._state === FromBTCSwapState.FAILED;
    }
    /**
     * @inheritDoc
     */
    isClaimable() {
        return this._state === FromBTCSwapState.BTC_TX_CONFIRMED;
    }
    /**
     * @inheritDoc
     */
    isSuccessful() {
        return this._state === FromBTCSwapState.CLAIM_CLAIMED;
    }
    /**
     * @inheritDoc
     */
    isFailed() {
        return this._state === FromBTCSwapState.FAILED || this._state === FromBTCSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteExpired() {
        return this._state === FromBTCSwapState.QUOTE_EXPIRED;
    }
    /**
     * @inheritDoc
     */
    isQuoteSoftExpired() {
        return this._state === FromBTCSwapState.QUOTE_EXPIRED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    canCommit() {
        if (this._state !== FromBTCSwapState.PR_CREATED)
            return false;
        if (this.requiredConfirmations == null)
            return false;
        const expiry = this.wrapper._getOnchainSendTimeout(this._data, this.requiredConfirmations);
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        return (expiry - currentTimestamp) >= this.wrapper._options.minSendWindow;
    }
    //////////////////////////////
    //// Amounts & fees
    /**
     * @inheritDoc
     */
    getInputToken() {
        return Token_1.BitcoinTokens.BTC;
    }
    /**
     * @inheritDoc
     */
    getInput() {
        return (0, TokenAmount_1.toTokenAmount)(this.amount ?? null, this.inputToken, this.wrapper._prices);
    }
    /**
     * Returns claimer bounty, acting as a reward for watchtowers to claim the swap automatically,
     *  this amount is pre-funded by the user on the destination chain when the swap escrow
     *  is initiated. For total pre-funded deposit amount see {@link getTotalDeposit}.
     */
    getClaimerBounty() {
        return (0, TokenAmount_1.toTokenAmount)(this._data.getClaimerBounty(), this.wrapper._tokens[this._data.getDepositToken()], this.wrapper._prices);
    }
    //////////////////////////////
    //// Bitcoin tx
    /**
     * If the required number of confirmations is not known, this function tries to infer it by looping through
     *  possible confirmation targets and comparing the claim hashes
     *
     * @param btcTx Bitcoin transaction
     * @param vout Output index of the desired output in the bitcoin transaction
     *
     * @private
     */
    inferRequiredConfirmationsCount(btcTx, vout) {
        const txOut = btcTx.outs[vout];
        for (let i = 1; i <= 20; i++) {
            const computedClaimHash = this.wrapper._contract.getHashForOnchain(buffer_1.Buffer.from(txOut.scriptPubKey.hex, "hex"), BigInt(txOut.value), i);
            if (computedClaimHash.toString("hex") === this._data.getClaimHash()) {
                return i;
            }
        }
    }
    /**
     * @inheritDoc
     */
    getRequiredConfirmationsCount() {
        return this.requiredConfirmations ?? NaN;
    }
    /**
     * Checks whether a bitcoin payment was already made, returns the payment or `null` when no payment has been made.
     *
     * @internal
     */
    async getBitcoinPayment() {
        const txoHashHint = this._data.getTxoHashHint();
        if (txoHashHint == null)
            throw new Error("Swap data doesn't include the txo hash hint! Cannot check bitcoin transaction!");
        if (this.address == null)
            throw new Error("Cannot check bitcoin payment, because the address is not known! This can happen after a swap is recovered.");
        const result = await this.wrapper._btcRpc.checkAddressTxos(this.address, buffer_1.Buffer.from(txoHashHint, "hex"));
        if (result == null)
            return null;
        if (this.requiredConfirmations == null) {
            this.requiredConfirmations = this.inferRequiredConfirmationsCount(result.tx, result.vout);
        }
        return {
            inputAddresses: result.tx.inputAddresses,
            txId: result.tx.txid,
            vout: result.vout,
            confirmations: result.tx.confirmations ?? 0,
            targetConfirmations: this.getRequiredConfirmationsCount()
        };
    }
    /**
     * Used to set the txId of the bitcoin payment from the on-chain events listener
     *
     * @param txId Transaction ID that settled the swap on the smart chain
     *
     * @internal
     */
    async _setBitcoinTxId(txId) {
        if (this.txId !== txId || this.address == null || this.vout == null || this.senderAddress == null || this.amount == null) {
            const btcTx = await this.wrapper._btcRpc.getTransaction(txId);
            if (btcTx == null)
                return;
            const txoHashHint = this._data.getTxoHashHint();
            if (txoHashHint != null) {
                const expectedTxoHash = buffer_1.Buffer.from(txoHashHint, "hex");
                const vout = btcTx.outs.findIndex(out => (0, Utils_1.getTxoHash)(out.scriptPubKey.hex, out.value).equals(expectedTxoHash));
                if (vout !== -1) {
                    this.vout = vout;
                    //If amount or address are not known, parse them from the bitcoin tx
                    // this can happen if the swap is recovered from on-chain data and
                    // hence doesn't contain the address and amount data
                    if (this.amount == null)
                        this.amount = BigInt(btcTx.outs[vout].value);
                    if (this.address == null)
                        try {
                            this.address = (0, BitcoinUtils_1.fromOutputScript)(this.wrapper._options.bitcoinNetwork, btcTx.outs[vout].scriptPubKey.hex);
                        }
                        catch (e) {
                            this.logger.warn("_setBitcoinTxId(): Failed to parse address from output script: ", e);
                        }
                    if (this.requiredConfirmations == null) {
                        this.requiredConfirmations = this.inferRequiredConfirmationsCount(btcTx, vout);
                    }
                }
            }
            if (btcTx.inputAddresses != null) {
                this.senderAddress = btcTx.inputAddresses[0];
            }
        }
        this.txId = txId;
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} if in invalid state (must be {@link FromBTCSwapState.CLAIM_COMMITED})
     */
    async waitForBitcoinTransaction(updateCallback, checkIntervalSeconds, abortSignal) {
        if (this._state !== FromBTCSwapState.CLAIM_COMMITED && this._state !== FromBTCSwapState.EXPIRED)
            throw new Error("Must be in COMMITED state!");
        const txoHashHint = this._data.getTxoHashHint();
        if (txoHashHint == null)
            throw new Error("Swap data doesn't include the txo hash hint! Cannot check bitcoin transaction!");
        if (this.address == null)
            throw new Error("Cannot check bitcoin payment, because the address is not known! This can happen after a swap is recovered.");
        let abortedDueToEnoughConfirmationsResult;
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const result = await this.wrapper._btcRpc.waitForAddressTxo(this.address, buffer_1.Buffer.from(txoHashHint, "hex"), this.requiredConfirmations ?? 6, //In case confirmation count is not known, we use a conservative estimate
        (btcTx, vout, txEtaMs) => {
            let requiredConfirmations = this.requiredConfirmations;
            if (btcTx != null && vout != null && requiredConfirmations == null) {
                requiredConfirmations = this.inferRequiredConfirmationsCount(btcTx, vout);
            }
            if (btcTx != null && (btcTx.txid !== this.txId || (this.requiredConfirmations == null && requiredConfirmations != null))) {
                this.txId = btcTx.txid;
                this.vout = vout;
                this.requiredConfirmations = requiredConfirmations;
                if (btcTx.inputAddresses != null)
                    this.senderAddress = btcTx.inputAddresses[0];
                this._saveAndEmit().catch(e => {
                    this.logger.error("waitForBitcoinTransaction(): Failed to save swap from within waitForAddressTxo callback:", e);
                });
            }
            //Abort the loop as soon as the transaction gets enough confirmations, this is required in case
            // we pass a default 6 confirmations to the fn, but then are able to infer the actual confirmation
            // target from the prior block
            if (btcTx?.confirmations != null && requiredConfirmations != null && requiredConfirmations <= btcTx.confirmations && vout != null) {
                abortedDueToEnoughConfirmationsResult = {
                    tx: btcTx,
                    vout
                };
                abortController.abort();
                return;
            }
            if (updateCallback != null)
                updateCallback(btcTx?.txid, btcTx == null ? undefined : (btcTx?.confirmations ?? 0), requiredConfirmations ?? NaN, txEtaMs);
        }, abortController.signal, checkIntervalSeconds).catch(e => {
            //We catch the case when the loop was aborted due to the transaction getting enough confirmations
            if (abortedDueToEnoughConfirmationsResult != null)
                return abortedDueToEnoughConfirmationsResult;
            throw e;
        });
        if (abortSignal != null)
            abortSignal.throwIfAborted();
        this.txId = result.tx.txid;
        this.vout = result.vout;
        if (result.tx.inputAddresses != null)
            this.senderAddress = result.tx.inputAddresses[0];
        if (this._state !== FromBTCSwapState.CLAIM_CLAIMED &&
            this._state !== FromBTCSwapState.FAILED) {
            this._state = FromBTCSwapState.BTC_TX_CONFIRMED;
        }
        await this._saveAndEmit();
        return result.tx.txid;
    }
    /**
     * Private getter of the funded PSBT that doesn't check current state
     *
     * @param _bitcoinWallet Bitcoin wallet to fund the PSBT with
     * @param feeRate Optional bitcoin fee rate in sats/vB
     * @param additionalOutputs Optional additional outputs that should also be included in the generated PSBT
     *
     * @private
     */
    async _getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs) {
        if (this.address == null)
            throw new Error("Cannot create funded PSBT, because the address is not known! This can happen after a swap is recovered.");
        let bitcoinWallet;
        if ((0, IBitcoinWallet_1.isIBitcoinWallet)(_bitcoinWallet)) {
            bitcoinWallet = _bitcoinWallet;
        }
        else {
            bitcoinWallet = new SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, _bitcoinWallet);
        }
        //TODO: Maybe re-introduce fee rate check here if passed from the user
        if (feeRate == null) {
            feeRate = await bitcoinWallet.getFeeRate();
        }
        const basePsbt = new btc_signer_1.Transaction({
            allowUnknownOutputs: true,
            allowLegacyWitnessUtxo: true
        });
        basePsbt.addOutput({
            amount: this.amount,
            script: (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.address)
        });
        if (additionalOutputs != null)
            additionalOutputs.forEach(output => {
                basePsbt.addOutput({
                    amount: output.amount,
                    script: output.outputScript ?? (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, output.address)
                });
            });
        const psbt = await bitcoinWallet.fundPsbt(basePsbt, feeRate);
        //Sign every input
        const signInputs = [];
        for (let i = 0; i < psbt.inputsLength; i++) {
            signInputs.push(i);
        }
        const serializedPsbt = buffer_1.Buffer.from(psbt.toPSBT());
        return {
            psbt,
            psbtHex: serializedPsbt.toString("hex"),
            psbtBase64: serializedPsbt.toString("base64"),
            signInputs
        };
    }
    /**
     * @inheritDoc
     */
    getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs) {
        if (this._state !== FromBTCSwapState.CLAIM_COMMITED)
            throw new Error("Swap not committed yet, please initiate the swap first with commit() call!");
        return this._getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs);
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} if the swap is in invalid state (not in {@link FromBTCSwapState.CLAIM_COMMITED}), or if
     *  the swap bitcoin address already expired.
     */
    async submitPsbt(_psbt) {
        const psbt = (0, BitcoinUtils_1.parsePsbtTransaction)(_psbt);
        if (this._state !== FromBTCSwapState.CLAIM_COMMITED)
            throw new Error("Swap not committed yet, please initiate the swap first with commit() call!");
        //Ensure not expired
        if (this.getTimeoutTime() < Date.now()) {
            throw new Error("Swap address expired!");
        }
        const output0 = psbt.getOutput(0);
        if (this.amount != null && output0.amount !== this.amount)
            throw new Error("PSBT output amount invalid, expected: " + this.amount + " got: " + output0.amount);
        if (this.address != null) {
            const expectedOutputScript = (0, BitcoinUtils_1.toOutputScript)(this.wrapper._options.bitcoinNetwork, this.address);
            if (output0.script == null || !expectedOutputScript.equals(output0.script))
                throw new Error("PSBT output script invalid!");
        }
        if (!psbt.isFinal)
            psbt.finalize();
        return await this.wrapper._btcRpc.sendRawTransaction(buffer_1.Buffer.from(psbt.toBytes(true, true)).toString("hex"));
    }
    /**
     * @inheritDoc
     */
    async estimateBitcoinFee(_bitcoinWallet, feeRate) {
        if (this.address == null || this.amount == null)
            return null;
        const bitcoinWallet = (0, BitcoinWalletUtils_1.toBitcoinWallet)(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const txFee = await bitcoinWallet.getTransactionFee(this.address, this.amount, feeRate);
        if (txFee == null)
            return null;
        return (0, TokenAmount_1.toTokenAmount)(BigInt(txFee), Token_1.BitcoinTokens.BTC, this.wrapper._prices);
    }
    /**
     * @inheritDoc
     */
    async sendBitcoinTransaction(wallet, feeRate) {
        if (this.address == null || this.amount == null)
            throw new Error("Cannot send bitcoin transaction, because the address is not known! This can happen after a swap is recovered.");
        if (this._state !== FromBTCSwapState.CLAIM_COMMITED)
            throw new Error("Swap not committed yet, please initiate the swap first with commit() call!");
        //Ensure not expired
        if (this.getTimeoutTime() < Date.now()) {
            throw new Error("Swap address expired!");
        }
        if ((0, IBitcoinWallet_1.isIBitcoinWallet)(wallet)) {
            return await wallet.sendTransaction(this.address, this.amount, feeRate);
        }
        else {
            const { psbt, psbtHex, psbtBase64, signInputs } = await this.getFundedPsbt(wallet, feeRate);
            const signedPsbt = await wallet.signPsbt({
                psbt, psbtHex, psbtBase64
            }, signInputs);
            return await this.submitPsbt(signedPsbt);
        }
    }
    //////////////////////////////
    //// Execution
    /**
     * Executes the swap with the provided bitcoin wallet,
     *
     * @param dstSigner Signer on the destination network, needs to have the same address as the one specified when
     *  quote was created, this is required for legacy swaps because the destination wallet needs to actively open
     *  a bitcoin swap address to which the BTC is then sent, this means that the address also needs to have enough
     *  native tokens to pay for gas on the destination network
     * @param wallet Bitcoin wallet to use to sign the bitcoin transaction, can also be null - then the execution waits
     *  till a transaction is received from an external wallet
     * @param callbacks Callbacks to track the progress of the swap
     * @param options Optional options for the swap like feeRate, AbortSignal, and timeouts/intervals
     *
     * @returns {boolean} Whether a swap was settled automatically by swap watchtowers or requires manual claim by the
     *  user, in case `false` is returned the user should call `swap.claim()` to settle the swap on the destination manually
     */
    async execute(dstSigner, wallet, callbacks, options) {
        if (this._state === FromBTCSwapState.FAILED)
            throw new Error("Swap failed!");
        if (this._state === FromBTCSwapState.EXPIRED)
            throw new Error("Swap address expired!");
        if (this._state === FromBTCSwapState.QUOTE_EXPIRED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Swap quote expired!");
        if (this._state === FromBTCSwapState.CLAIM_CLAIMED)
            throw new Error("Swap already settled!");
        if (this._state === FromBTCSwapState.PR_CREATED) {
            await this.commit(dstSigner, options?.abortSignal, undefined, callbacks?.onDestinationCommitSent);
        }
        if (this._state === FromBTCSwapState.CLAIM_COMMITED) {
            if (wallet != null) {
                const bitcoinPaymentSent = await this.getBitcoinPayment();
                if (bitcoinPaymentSent == null) {
                    //Send btc tx
                    const txId = await this.sendBitcoinTransaction(wallet, options?.feeRate);
                    if (callbacks?.onSourceTransactionSent != null)
                        callbacks.onSourceTransactionSent(txId);
                }
            }
            const txId = await this.waitForBitcoinTransaction(callbacks?.onSourceTransactionConfirmationStatus, options?.btcTxCheckIntervalSeconds, options?.abortSignal);
            if (callbacks?.onSourceTransactionConfirmed != null)
                callbacks.onSourceTransactionConfirmed(txId);
        }
        // @ts-ignore
        if (this._state === FromBTCSwapState.CLAIM_CLAIMED)
            return true;
        if (this._state === FromBTCSwapState.BTC_TX_CONFIRMED) {
            const success = await this.waitTillClaimed(options?.maxWaitTillAutomaticSettlementSeconds ?? 60, options?.abortSignal);
            if (success && callbacks?.onSwapSettled != null)
                callbacks.onSwapSettled(this.getOutputTxId());
            return success;
        }
        throw new Error("Invalid state reached!");
    }
    /**
     * @inheritDoc
     *
     * @param options.bitcoinWallet Bitcoin wallet to use, when provided the function returns a funded
     *  psbt (`"FUNDED_PSBT"`), if not passed just a bitcoin receive address is returned (`"ADDRESS"`)
     * @param options.skipChecks Skip checks like making sure init signature is still valid and swap
     *  wasn't commited yet (this is handled on swap creation, if you commit right after quoting, you
     *  can use `skipChecks=true`)
     *
     * @throws {Error} if the swap or quote is expired, or if triggered in invalid state
     */
    async txsExecute(options) {
        if (this._state === FromBTCSwapState.PR_CREATED) {
            if (!await this._verifyQuoteValid())
                throw new Error("Quote already expired or close to expiry!");
            if (this.getTimeoutTime() < Date.now())
                throw new Error("Swap address already expired or close to expiry!");
            return [
                {
                    name: "Commit",
                    description: `Opens up the bitcoin swap address on the ${this.chainIdentifier} side`,
                    chain: this.chainIdentifier,
                    txs: await this.txsCommit(options?.skipChecks)
                },
                {
                    name: "Payment",
                    description: "Send funds to the bitcoin swap address",
                    chain: "BITCOIN",
                    txs: [
                        options?.bitcoinWallet == null ? {
                            address: this.address ?? "",
                            amount: Number(this.amount),
                            hyperlink: this._getHyperlink(),
                            type: "ADDRESS"
                        } : {
                            ...await this.getFundedPsbt(options.bitcoinWallet),
                            type: "FUNDED_PSBT"
                        }
                    ]
                }
            ];
        }
        if (this._state === FromBTCSwapState.CLAIM_COMMITED) {
            if (this.getTimeoutTime() < Date.now())
                throw new Error("Swap address already expired or close to expiry!");
            return [
                {
                    name: "Payment",
                    description: "Send funds to the bitcoin swap address",
                    chain: "BITCOIN",
                    txs: [
                        options?.bitcoinWallet == null ? {
                            address: this.getAddress(),
                            amount: Number(this.amount),
                            hyperlink: this._getHyperlink(),
                            type: "ADDRESS"
                        } : {
                            ...await this.getFundedPsbt(options.bitcoinWallet),
                            type: "FUNDED_PSBT"
                        }
                    ]
                }
            ];
        }
        throw new Error("Invalid swap state to obtain execution txns, required PR_CREATED or CLAIM_COMMITED");
    }
    //////////////////////////////
    //// Commit
    /**
     * @inheritDoc
     *
     * @throws {Error} If invalid signer is provided that doesn't match the swap data
     */
    async commit(_signer, abortSignal, skipChecks, onBeforeTxSent) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        this.checkSigner(signer);
        let txCount = 0;
        const txs = await this.txsCommit(skipChecks);
        const result = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
            txCount++;
            if (onBeforeTxSent != null && txCount === txs.length)
                onBeforeTxSent(txId);
            return Promise.resolve();
        });
        this._commitTxId = result[result.length - 1];
        if (this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
            await this._saveAndEmit(FromBTCSwapState.CLAIM_COMMITED);
        }
        return this._commitTxId;
    }
    /**
     * @inheritDoc
     */
    async waitTillCommited(abortSignal) {
        if (this._state === FromBTCSwapState.CLAIM_COMMITED || this._state === FromBTCSwapState.CLAIM_CLAIMED)
            return Promise.resolve();
        if (this._state !== FromBTCSwapState.PR_CREATED && this._state !== FromBTCSwapState.QUOTE_SOFT_EXPIRED)
            throw new Error("Invalid state");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const result = await Promise.race([
            this.watchdogWaitTillCommited(undefined, abortController.signal),
            this.waitTillState(FromBTCSwapState.CLAIM_COMMITED, "gte", abortController.signal).then(() => 0)
        ]);
        abortController.abort();
        if (result === 0)
            this.logger.debug("waitTillCommited(): Resolved from state changed");
        if (result === true)
            this.logger.debug("waitTillCommited(): Resolved from watchdog - commited");
        if (result === false) {
            this.logger.debug("waitTillCommited(): Resolved from watchdog - signature expired");
            if (this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
                await this._saveAndEmit(FromBTCSwapState.QUOTE_EXPIRED);
            }
            return;
        }
        if (this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
            await this._saveAndEmit(FromBTCSwapState.CLAIM_COMMITED);
        }
    }
    //////////////////////////////
    //// Claim
    /**
     * Might also return transactions necessary to sync the bitcoin light client.
     *
     * @inheritDoc
     *
     * @throws {Error} If the swap is in invalid state (must be {@link FromBTCSwapState.BTC_TX_CONFIRMED})
     */
    async txsClaim(_signer) {
        let signer = undefined;
        if (_signer != null) {
            if (typeof (_signer) === "string") {
                signer = _signer;
            }
            else if ((0, base_1.isAbstractSigner)(_signer)) {
                signer = _signer;
            }
            else {
                signer = await this.wrapper._chain.wrapSigner(_signer);
            }
        }
        if (this._state !== FromBTCSwapState.BTC_TX_CONFIRMED)
            throw new Error("Must be in BTC_TX_CONFIRMED state!");
        if (this.txId == null || this.vout == null)
            throw new Error("Bitcoin transaction ID not known!");
        const tx = await this.wrapper._btcRpc.getTransaction(this.txId);
        if (tx == null)
            throw new Error("Bitcoin transaction not found on the network!");
        this.requiredConfirmations ??= this.inferRequiredConfirmationsCount(tx, this.vout);
        if (this.requiredConfirmations == null)
            throw new Error("Cannot create claim transaction, because required confirmations are not known and cannot be infered! This can happen after a swap is recovered.");
        if (tx.blockhash == null || tx.confirmations == null || tx.blockheight == null || tx.confirmations < this.requiredConfirmations)
            throw new Error("Bitcoin transaction not confirmed yet!");
        return await this.wrapper._contract.txsClaimWithTxData(signer ?? this._getInitiator(), this._data, {
            blockhash: tx.blockhash,
            confirmations: tx.confirmations,
            txid: tx.txid,
            hex: tx.hex,
            height: tx.blockheight
        }, this.requiredConfirmations, this.vout, undefined, this.wrapper._synchronizer, true);
    }
    /**
     * Might also sync the bitcoin light client. Signer can also be different to the initializer.
     *
     * @inheritDoc
     */
    async claim(_signer, abortSignal, onBeforeTxSent) {
        const signer = (0, base_1.isAbstractSigner)(_signer) ? _signer : await this.wrapper._chain.wrapSigner(_signer);
        let txIds;
        try {
            let txCount = 0;
            const txs = await this.txsClaim(signer);
            txIds = await this.wrapper._chain.sendAndConfirm(signer, txs, true, abortSignal, undefined, (txId) => {
                txCount++;
                if (onBeforeTxSent != null && txCount === txs.length)
                    onBeforeTxSent(txId);
                return Promise.resolve();
            });
        }
        catch (e) {
            this.logger.info("claim(): Failed to claim ourselves, checking swap claim state...");
            if (this._state === FromBTCSwapState.CLAIM_CLAIMED) {
                this.logger.info("claim(): Transaction state is CLAIM_CLAIMED, swap was successfully claimed by the watchtower");
                return this._claimTxId;
            }
            const status = await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            if (status?.type === base_1.SwapCommitStateType.PAID) {
                this.logger.info("claim(): Transaction commit status is PAID, swap was successfully claimed by the watchtower");
                if (this._claimTxId == null)
                    this._claimTxId = await status.getClaimTxId();
                const txId = buffer_1.Buffer.from(await status.getClaimResult(), "hex").reverse().toString("hex");
                await this._setBitcoinTxId(txId);
                await this._saveAndEmit(FromBTCSwapState.CLAIM_CLAIMED);
                return this._claimTxId;
            }
            throw e;
        }
        this._claimTxId = txIds[txIds.length - 1];
        if (this._state === FromBTCSwapState.CLAIM_COMMITED || this._state === FromBTCSwapState.BTC_TX_CONFIRMED ||
            this._state === FromBTCSwapState.EXPIRED || this._state === FromBTCSwapState.FAILED) {
            await this._saveAndEmit(FromBTCSwapState.CLAIM_CLAIMED);
        }
        return txIds[txIds.length - 1];
    }
    /**
     * @inheritDoc
     *
     * @throws {Error} If swap is in invalid state (must be {@link FromBTCSwapState.BTC_TX_CONFIRMED})
     * @throws {Error} If the LP refunded sooner than we were able to claim
     *
     * @returns {boolean} whether the swap was claimed in time or not
     */
    async waitTillClaimed(maxWaitTimeSeconds, abortSignal) {
        if (this._state === FromBTCSwapState.CLAIM_CLAIMED)
            return Promise.resolve(true);
        if (this._state !== FromBTCSwapState.BTC_TX_CONFIRMED)
            throw new Error("Invalid state (not BTC_TX_CONFIRMED)");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        let timedOut = false;
        if (maxWaitTimeSeconds != null) {
            const timeout = setTimeout(() => {
                timedOut = true;
                abortController.abort();
            }, maxWaitTimeSeconds * 1000);
            abortController.signal.addEventListener("abort", () => clearTimeout(timeout));
        }
        let res;
        try {
            res = await Promise.race([
                this.watchdogWaitTillResult(undefined, abortController.signal),
                this.waitTillState(FromBTCSwapState.CLAIM_CLAIMED, "eq", abortController.signal).then(() => 0),
                this.waitTillState(FromBTCSwapState.FAILED, "eq", abortController.signal).then(() => 1),
            ]);
            abortController.abort();
        }
        catch (e) {
            abortController.abort();
            if (timedOut)
                return false;
            throw e;
        }
        if (res === 0) {
            this.logger.debug("waitTillClaimed(): Resolved from state change (CLAIM_CLAIMED)");
            return true;
        }
        if (res === 1) {
            this.logger.debug("waitTillClaimed(): Resolved from state change (FAILED)");
            throw new Error("Offerer refunded during claiming");
        }
        this.logger.debug("waitTillClaimed(): Resolved from watchdog");
        if (res?.type === base_1.SwapCommitStateType.PAID) {
            if (this._state !== FromBTCSwapState.CLAIM_CLAIMED) {
                if (this._claimTxId == null)
                    this._claimTxId = await res.getClaimTxId();
                const txId = buffer_1.Buffer.from(await res.getClaimResult(), "hex").reverse().toString("hex");
                await this._setBitcoinTxId(txId);
                await this._saveAndEmit(FromBTCSwapState.CLAIM_CLAIMED);
            }
        }
        if (res?.type === base_1.SwapCommitStateType.NOT_COMMITED || res?.type === base_1.SwapCommitStateType.EXPIRED) {
            if (this._state !== FromBTCSwapState.CLAIM_CLAIMED &&
                this._state !== FromBTCSwapState.FAILED) {
                if (res.getRefundTxId != null)
                    this._refundTxId = await res.getRefundTxId();
                await this._saveAndEmit(FromBTCSwapState.FAILED);
            }
            throw new Error("Swap expired while waiting for claim!");
        }
        return true;
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
            requiredConfirmations: this.requiredConfirmations,
            senderAddress: this.senderAddress,
            txId: this.txId,
            vout: this.vout
        };
    }
    //////////////////////////////
    //// Swap ticks & sync
    /**
     * Checks the swap's state on-chain and compares it to its internal state, updates/changes it according to on-chain
     *  data
     *
     * @private
     */
    async syncStateFromChain(quoteDefinitelyExpired, commitStatus) {
        if (this._state === FromBTCSwapState.PR_CREATED ||
            this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state === FromBTCSwapState.CLAIM_COMMITED ||
            this._state === FromBTCSwapState.BTC_TX_CONFIRMED ||
            this._state === FromBTCSwapState.EXPIRED) {
            let quoteExpired = false;
            if (this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
                quoteExpired = quoteDefinitelyExpired ?? await this._verifyQuoteDefinitelyExpired(); //Make sure we check for expiry here, to prevent race conditions
            }
            const status = commitStatus ?? await this.wrapper._contract.getCommitStatus(this._getInitiator(), this._data);
            if (status != null && await this._forciblySetOnchainState(status))
                return true;
            if (this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED) {
                if (quoteExpired) {
                    this._state = FromBTCSwapState.QUOTE_EXPIRED;
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchOnchainState() {
        return this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED ||
            this._state === FromBTCSwapState.CLAIM_COMMITED || this._state === FromBTCSwapState.BTC_TX_CONFIRMED ||
            this._state === FromBTCSwapState.EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    _shouldFetchExpiryStatus() {
        return this._state === FromBTCSwapState.PR_CREATED || this._state === FromBTCSwapState.QUOTE_SOFT_EXPIRED;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _sync(save, quoteDefinitelyExpired, commitStatus) {
        const changed = await this.syncStateFromChain(quoteDefinitelyExpired, commitStatus);
        if (changed && save)
            await this._saveAndEmit();
        return changed;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _forciblySetOnchainState(status) {
        switch (status.type) {
            case base_1.SwapCommitStateType.PAID:
                if (this._claimTxId == null)
                    this._claimTxId = await status.getClaimTxId();
                const txId = buffer_1.Buffer.from(await status.getClaimResult(), "hex").reverse().toString("hex");
                await this._setBitcoinTxId(txId);
                this._state = FromBTCSwapState.CLAIM_CLAIMED;
                return true;
            case base_1.SwapCommitStateType.NOT_COMMITED:
                if (this._refundTxId == null && status.getRefundTxId)
                    this._refundTxId = await status.getRefundTxId();
                if (this._refundTxId != null) {
                    this._state = FromBTCSwapState.FAILED;
                    return true;
                }
                break;
            case base_1.SwapCommitStateType.EXPIRED:
                if (this._refundTxId == null && status.getRefundTxId)
                    this._refundTxId = await status.getRefundTxId();
                this._state = this._refundTxId == null ? FromBTCSwapState.QUOTE_EXPIRED : FromBTCSwapState.FAILED;
                return true;
            case base_1.SwapCommitStateType.COMMITED:
                let save = false;
                if (this._state !== FromBTCSwapState.CLAIM_COMMITED && this._state !== FromBTCSwapState.BTC_TX_CONFIRMED && this._state !== FromBTCSwapState.EXPIRED) {
                    this._state = FromBTCSwapState.CLAIM_COMMITED;
                    save = true;
                }
                if (this.address == null)
                    return save;
                const res = await this.getBitcoinPayment();
                if (res != null) {
                    if (this.txId !== res.txId) {
                        if (res.inputAddresses != null)
                            this.senderAddress = res.inputAddresses[0];
                        this.txId = res.txId;
                        this.vout = res.vout;
                        save = true;
                    }
                    if (this.requiredConfirmations != null && res.confirmations >= this.requiredConfirmations) {
                        this._state = FromBTCSwapState.BTC_TX_CONFIRMED;
                        save = true;
                    }
                }
                return save;
        }
        return false;
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _tick(save) {
        switch (this._state) {
            case FromBTCSwapState.PR_CREATED:
                if (this.expiry < Date.now()) {
                    this._state = FromBTCSwapState.QUOTE_SOFT_EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
                break;
            case FromBTCSwapState.CLAIM_COMMITED:
                if (this.getTimeoutTime() < Date.now()) {
                    this._state = FromBTCSwapState.EXPIRED;
                    if (save)
                        await this._saveAndEmit();
                    return true;
                }
            case FromBTCSwapState.EXPIRED:
                //Check if bitcoin payment was received every 2 minutes
                if (Math.floor(Date.now() / 1000) % 120 === 0) {
                    if (this.address != null)
                        try {
                            const res = await this.getBitcoinPayment();
                            if (res != null) {
                                let shouldSave = false;
                                if (this.txId !== res.txId) {
                                    this.txId = res.txId;
                                    this.vout = res.vout;
                                    if (res.inputAddresses != null)
                                        this.senderAddress = res.inputAddresses[0];
                                    shouldSave = true;
                                }
                                if (this.requiredConfirmations != null && res.confirmations >= this.requiredConfirmations) {
                                    this._state = FromBTCSwapState.BTC_TX_CONFIRMED;
                                    if (save)
                                        await this._saveAndEmit();
                                    shouldSave = true;
                                }
                                if (shouldSave && save)
                                    await this._saveAndEmit();
                                return shouldSave;
                            }
                        }
                        catch (e) {
                            this.logger.warn("tickSwap(" + this.getIdentifierHashString() + "): ", e);
                        }
                }
                break;
        }
        return false;
    }
}
exports.FromBTCSwap = FromBTCSwap;
