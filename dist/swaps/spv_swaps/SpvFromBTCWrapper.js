"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpvFromBTCWrapper = exports.REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE = exports.REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE = void 0;
const ISwapWrapper_1 = require("../ISwapWrapper");
const base_1 = require("@atomiqlabs/base");
const SpvFromBTCSwap_1 = require("./SpvFromBTCSwap");
const utils_1 = require("@scure/btc-signer/utils");
const SwapType_1 = require("../../enums/SwapType");
const Utils_1 = require("../../utils/Utils");
const BitcoinUtils_1 = require("../../utils/BitcoinUtils");
const IntermediaryAPI_1 = require("../../intermediaries/apis/IntermediaryAPI");
const RequestError_1 = require("../../errors/RequestError");
const IntermediaryError_1 = require("../../errors/IntermediaryError");
const utils_2 = require("../../bitcoin/coinselect2/utils");
const btc_signer_1 = require("@scure/btc-signer");
const RetryUtils_1 = require("../../utils/RetryUtils");
const SingleAddressBitcoinWallet_1 = require("../../bitcoin/wallet/SingleAddressBitcoinWallet");
const UserError_1 = require("../../errors/UserError");
const BitcoinWallet_1 = require("../../bitcoin/wallet/BitcoinWallet");
exports.REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE = "p2tr";
exports.REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE = "p2wpkh";
/**
 * New spv vault (UTXO-controlled vault) based swaps for Bitcoin -> Smart chain swaps not requiring
 *  any initiation on the destination chain, and with the added possibility for the user to receive
 *  a native token on the destination chain as part of the swap (a "gas drop" feature).
 *
 * @category Swaps/Bitcoin → Smart chain
 */
class SpvFromBTCWrapper extends ISwapWrapper_1.ISwapWrapper {
    /**
     * @param chainIdentifier
     * @param unifiedStorage Storage interface for the current environment
     * @param unifiedChainEvents On-chain event listener
     * @param chain
     * @param contract Underlying contract handling the swaps
     * @param prices Pricing to use
     * @param tokens
     * @param spvWithdrawalDataDeserializer Deserializer for SpvVaultWithdrawalData
     * @param btcRelay
     * @param synchronizer Btc relay synchronizer
     * @param btcRpc Bitcoin RPC which also supports getting transactions by txoHash
     * @param options
     * @param events Instance to use for emitting events
     */
    constructor(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, contract, prices, tokens, spvWithdrawalDataDeserializer, btcRelay, synchronizer, btcRpc, options, events) {
        super(chainIdentifier, unifiedStorage, unifiedChainEvents, chain, prices, tokens, {
            bitcoinNetwork: options?.bitcoinNetwork ?? utils_1.TEST_NETWORK,
            maxConfirmations: options?.maxConfirmations ?? 6,
            bitcoinBlocktime: options?.bitcoinBlocktime ?? 10 * 60,
            maxTransactionsDelta: options?.maxTransactionsDelta ?? 3,
            maxRawAmountAdjustmentDifferencePPM: options?.maxRawAmountAdjustmentDifferencePPM ?? 100,
            maxBtcFeeOffset: options?.maxBtcFeeOffset ?? 10,
            maxBtcFeeMultiplier: options?.maxBtcFeeMultiplier ?? 1.5
        }, events);
        this.TYPE = SwapType_1.SwapType.SPV_VAULT_FROM_BTC;
        /**
         * @internal
         */
        this._claimableSwapStates = [SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED];
        /**
         * @internal
         */
        this._swapDeserializer = SpvFromBTCSwap_1.SpvFromBTCSwap;
        /**
         * @internal
         */
        this.tickSwapState = [
            SpvFromBTCSwap_1.SpvFromBTCSwapState.CREATED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED
        ];
        /**
         * @internal
         */
        this._pendingSwapStates = [
            SpvFromBTCSwap_1.SpvFromBTCSwapState.CREATED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.DECLINED,
            SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED
        ];
        this._spvWithdrawalDataDeserializer = spvWithdrawalDataDeserializer;
        this._contract = contract;
        this.btcRelay = btcRelay;
        this._synchronizer = synchronizer;
        this._btcRpc = btcRpc;
    }
    async processEventFront(event, swap) {
        if (swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.DECLINED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            swap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.FRONTED;
            swap._frontTxId = event.meta?.txId;
            await swap._setBitcoinTxId(event.btcTxId).catch(e => {
                this.logger.warn("processEventFront(): Failed to set bitcoin txId: ", e);
            });
            return true;
        }
        return false;
    }
    async processEventClaim(event, swap) {
        if (swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.DECLINED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.FRONTED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            swap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.CLAIMED;
            swap._claimTxId = event.meta?.txId;
            await swap._setBitcoinTxId(event.btcTxId).catch(e => {
                this.logger.warn("processEventClaim(): Failed to set bitcoin txId: ", e);
            });
            return true;
        }
        return false;
    }
    processEventClose(event, swap) {
        if (swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.DECLINED ||
            swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED || swap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
            swap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.CLOSED;
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }
    /**
     * @inheritDoc
     * @internal
     */
    async processEvent(event, swap) {
        if (swap == null)
            return;
        let swapChanged = false;
        if (event instanceof base_1.SpvVaultFrontEvent) {
            swapChanged = await this.processEventFront(event, swap);
            if (event.meta?.txId != null && swap._frontTxId !== event.meta.txId) {
                swap._frontTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if (event instanceof base_1.SpvVaultClaimEvent) {
            swapChanged = await this.processEventClaim(event, swap);
            if (event.meta?.txId != null && swap._claimTxId !== event.meta.txId) {
                swap._claimTxId = event.meta.txId;
                swapChanged ||= true;
            }
        }
        if (event instanceof base_1.SpvVaultCloseEvent) {
            swapChanged = await this.processEventClose(event, swap);
        }
        this.logger.info("processEvents(): " + event.constructor.name + " processed for " + swap.getId() + " swap: ", swap);
        if (swapChanged) {
            await swap._saveAndEmit();
        }
    }
    /**
     * Pre-fetches latest finalized block height of the smart chain
     *
     * @param abortController
     * @private
     */
    async preFetchFinalizedBlockHeight(abortController) {
        try {
            const block = await this._chain.getFinalizedBlock();
            return block.height;
        }
        catch (e) {
            abortController.abort(e);
        }
    }
    /**
     * Pre-fetches caller (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param abortController
     * @private
     */
    async preFetchCallerFeeInNativeToken(amountData, options, abortController) {
        if (options.unsafeZeroWatchtowerFee)
            return 0n;
        if (amountData.amount === 0n)
            return 0n;
        try {
            const [feePerBlock, btcRelayData, currentBtcBlock, claimFeeRate] = await Promise.all([
                this.btcRelay.getFeePerBlock(),
                this.btcRelay.getTipData(),
                this._btcRpc.getTipHeight(),
                this._contract.getClaimFee(this._chain.randomAddress())
            ]);
            if (btcRelayData == null)
                throw new Error("Btc relay doesn't seem to be initialized!");
            const currentBtcRelayBlock = btcRelayData.blockheight;
            const blockDelta = Math.max(currentBtcBlock - currentBtcRelayBlock + this._options.maxConfirmations, 0);
            const totalFeeInNativeToken = ((BigInt(blockDelta) * feePerBlock) +
                (claimFeeRate * BigInt(this._options.maxTransactionsDelta))) * BigInt(Math.floor(options.feeSafetyFactor * 1000000)) / 1000000n;
            return totalFeeInNativeToken;
        }
        catch (e) {
            abortController.abort(e);
        }
    }
    /**
     * Pre-fetches caller (watchtower) bounty data for the swap. Doesn't throw, instead returns null and aborts the
     *  provided abortController
     *
     * @param amountPrefetch
     * @param totalFeeInNativeTokenPrefetch
     * @param amountData
     * @param options Options as passed to the swap creation function
     * @param pricePrefetch
     * @param nativeTokenPricePrefetch
     * @param abortSignal
     * @private
     */
    async computeCallerFeeShare(amountPrefetch, totalFeeInNativeTokenPrefetch, amountData, options, pricePrefetch, nativeTokenPricePrefetch, abortSignal) {
        if (options.unsafeZeroWatchtowerFee)
            return 0n;
        const amount = await (0, Utils_1.throwIfUndefined)(amountPrefetch, "Cannot get swap amount!");
        if (amount === 0n)
            return 0n;
        const totalFeeInNativeToken = await (0, Utils_1.throwIfUndefined)(totalFeeInNativeTokenPrefetch, "Cannot get total fee in native token!");
        const nativeTokenPrice = await nativeTokenPricePrefetch;
        let payoutAmount;
        if (amountData.exactIn) {
            //Convert input amount in BTC to
            const amountInNativeToken = await this._prices.getFromBtcSwapAmount(this.chainIdentifier, amount, this._chain.getNativeCurrencyAddress(), abortSignal, nativeTokenPrice);
            payoutAmount = amountInNativeToken - totalFeeInNativeToken;
        }
        else {
            if (amountData.token === this._chain.getNativeCurrencyAddress()) {
                //Both amounts in same currency
                payoutAmount = amount;
            }
            else {
                //Need to convert both to native currency
                const btcAmount = await this._prices.getToBtcSwapAmount(this.chainIdentifier, amount, amountData.token, abortSignal, await pricePrefetch);
                payoutAmount = await this._prices.getFromBtcSwapAmount(this.chainIdentifier, btcAmount, this._chain.getNativeCurrencyAddress(), abortSignal, nativeTokenPrice);
            }
        }
        this.logger.debug("preFetchCallerFeeShare(): Caller fee in native token: " + totalFeeInNativeToken.toString(10) + " total payout in native token: " + payoutAmount.toString(10));
        const callerFeeShare = ((totalFeeInNativeToken * 100000n) + payoutAmount - 1n) / payoutAmount; //Make sure to round up here
        if (callerFeeShare < 0n)
            return 0n;
        if (callerFeeShare >= 2n ** 20n)
            return 2n ** 20n - 1n;
        return callerFeeShare;
    }
    /**
     * Verifies response returned from intermediary
     *
     * @param resp Response as returned by the intermediary
     * @param amountData
     * @param lp Intermediary
     * @param options Options as passed to the swap creation function
     * @param callerFeeShare
     * @param bitcoinFeeRatePromise Maximum accepted fee rate from the LPs
     * @param abortSignal
     * @private
     * @throws {IntermediaryError} in case the response is invalid
     */
    async verifyReturnedData(resp, amountData, lp, options, callerFeeShare, bitcoinFeeRatePromise, abortSignal) {
        const btcFeeRate = await (0, Utils_1.throwIfUndefined)(bitcoinFeeRatePromise, "Bitcoin fee rate promise failed!");
        abortSignal.throwIfAborted();
        if (btcFeeRate != null && resp.btcFeeRate > btcFeeRate)
            throw new IntermediaryError_1.IntermediaryError(`Required bitcoin fee rate returned from the LP is too high! Maximum accepted: ${btcFeeRate} sats/vB, required by LP: ${resp.btcFeeRate} sats/vB`);
        //Vault related
        let vaultScript;
        let vaultAddressType;
        let btcAddressScript;
        let btcAddressType;
        //Ensure valid btc addresses returned
        try {
            vaultScript = (0, BitcoinUtils_1.toOutputScript)(this._options.bitcoinNetwork, resp.vaultBtcAddress);
            vaultAddressType = (0, BitcoinUtils_1.toCoinselectAddressType)(vaultScript);
            btcAddressScript = (0, BitcoinUtils_1.toOutputScript)(this._options.bitcoinNetwork, resp.btcAddress);
            btcAddressType = (0, BitcoinUtils_1.toCoinselectAddressType)(btcAddressScript);
        }
        catch (e) {
            throw new IntermediaryError_1.IntermediaryError("Invalid btc address data returned", e);
        }
        const decodedUtxo = resp.btcUtxo.split(":");
        if (resp.address !== lp.getAddress(this.chainIdentifier) || //Ensure the LP is indeed the vault owner
            resp.vaultId < 0n || //Ensure vaultId is not negative
            vaultScript == null || //Make sure vault script is parsable and of known type
            btcAddressScript == null || //Make sure btc address script is parsable and of known type
            btcAddressType !== exports.REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE || //Constrain the btc address script type
            vaultAddressType !== exports.REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE || //Constrain the vault script type
            decodedUtxo.length !== 2 || decodedUtxo[0].length !== 64 || isNaN(parseInt(decodedUtxo[1])) || //Check valid UTXO
            resp.btcFeeRate < 1 || resp.btcFeeRate > 10000 //Sanity check on the returned BTC fee rate
        )
            throw new IntermediaryError_1.IntermediaryError("Invalid vault data returned!");
        //Amounts sanity
        if (resp.btcAmountSwap + resp.btcAmountGas !== resp.btcAmount)
            throw new Error("Btc amount mismatch");
        if (resp.swapFeeBtc + resp.gasSwapFeeBtc !== resp.totalFeeBtc)
            throw new Error("Btc fee mismatch");
        //TODO: For now ensure fees are at 0
        if (resp.callerFeeShare !== callerFeeShare ||
            resp.frontingFeeShare !== 0n ||
            resp.executionFeeShare !== 0n)
            throw new IntermediaryError_1.IntermediaryError("Invalid caller/fronting/execution fee returned");
        //Check expiry
        const timeNowSeconds = Math.floor(Date.now() / 1000);
        if (resp.expiry < timeNowSeconds)
            throw new IntermediaryError_1.IntermediaryError(`Quote already expired, expiry: ${resp.expiry}, systemTime: ${timeNowSeconds}, clockAdjusted: ${Date._now != null}`);
        let utxo = resp.btcUtxo.toLowerCase();
        const [txId, voutStr] = utxo.split(":");
        const abortController = (0, Utils_1.extendAbortController)(abortSignal);
        let [vault, { vaultUtxoValue, btcTx }] = await Promise.all([
            (async () => {
                //Fetch vault data
                let vault;
                try {
                    vault = await this._contract.getVaultData(resp.address, resp.vaultId);
                }
                catch (e) {
                    this.logger.error("Error getting spv vault (owner: " + resp.address + " vaultId: " + resp.vaultId.toString(10) + "): ", e);
                    throw new IntermediaryError_1.IntermediaryError("Spv swap vault not found", e);
                }
                abortController.signal.throwIfAborted();
                //Make sure vault is opened
                if (vault == null || !vault.isOpened())
                    throw new IntermediaryError_1.IntermediaryError("Returned spv swap vault is not opened!");
                //Make sure the vault doesn't require insane amount of confirmations
                if (vault.getConfirmations() > this._options.maxConfirmations)
                    throw new IntermediaryError_1.IntermediaryError("SPV swap vault needs too many confirmations: " + vault.getConfirmations());
                const tokenData = vault.getTokenData();
                //Amounts - make sure the amounts match
                if (amountData.exactIn) {
                    if (resp.btcAmount !== amountData.amount)
                        throw new IntermediaryError_1.IntermediaryError("Invalid amount returned");
                }
                else {
                    //Check the difference between amount adjusted due to scaling to raw amount
                    const adjustedAmount = amountData.amount / tokenData[0].multiplier * tokenData[0].multiplier;
                    const adjustmentPPM = (amountData.amount - adjustedAmount) * 1000000n / amountData.amount;
                    if (adjustmentPPM > this._options.maxRawAmountAdjustmentDifferencePPM)
                        throw new IntermediaryError_1.IntermediaryError("Invalid amount0 multiplier used, rawAmount diff too high");
                    if (resp.total !== adjustedAmount)
                        throw new IntermediaryError_1.IntermediaryError("Invalid total returned");
                }
                if (options.gasAmount == null || options.gasAmount === 0n) {
                    if (resp.totalGas !== 0n)
                        throw new IntermediaryError_1.IntermediaryError("Invalid gas total returned");
                }
                else {
                    //Check the difference between amount adjusted due to scaling to raw amount
                    const adjustedGasAmount = options.gasAmount / tokenData[0].multiplier * tokenData[0].multiplier;
                    const adjustmentPPM = (options.gasAmount - adjustedGasAmount) * 1000000n / options.gasAmount;
                    if (adjustmentPPM > this._options.maxRawAmountAdjustmentDifferencePPM)
                        throw new IntermediaryError_1.IntermediaryError("Invalid amount1 multiplier used, rawAmount diff too high");
                    if (resp.totalGas !== adjustedGasAmount)
                        throw new IntermediaryError_1.IntermediaryError("Invalid gas total returned");
                }
                return vault;
            })(),
            (async () => {
                //Require the vault UTXO to have at least 1 confirmation
                let btcTx = await this._btcRpc.getTransaction(txId);
                if (btcTx == null)
                    throw new IntermediaryError_1.IntermediaryError("Invalid UTXO, doesn't exist (txId)");
                abortController.signal.throwIfAborted();
                if (btcTx.confirmations == null || btcTx.confirmations < 1)
                    throw new IntermediaryError_1.IntermediaryError("SPV vault UTXO not confirmed");
                const vout = parseInt(voutStr);
                if (btcTx.outs[vout] == null)
                    throw new IntermediaryError_1.IntermediaryError("Invalid UTXO, doesn't exist");
                const vaultUtxoValue = btcTx.outs[vout].value;
                return { btcTx, vaultUtxoValue };
            })(),
            (async () => {
                //Require vault UTXO is unspent
                if (await this._btcRpc.isSpent(utxo))
                    throw new IntermediaryError_1.IntermediaryError("Returned spv vault UTXO is already spent", null, true);
                abortController.signal.throwIfAborted();
            })()
        ]).catch(e => {
            abortController.abort(e);
            throw e;
        });
        this.logger.debug("verifyReturnedData(): Vault UTXO: " + vault.getUtxo() + " current utxo: " + utxo);
        //Trace returned utxo back to what's saved on-chain
        let pendingWithdrawals = [];
        while (vault.getUtxo() !== utxo) {
            const [txId, voutStr] = utxo.split(":");
            //Such that 1st tx isn't fetched twice
            if (btcTx.txid !== txId) {
                const _btcTx = await this._btcRpc.getTransaction(txId);
                if (_btcTx == null)
                    throw new IntermediaryError_1.IntermediaryError("Invalid ancestor transaction (not found)");
                btcTx = _btcTx;
            }
            const withdrawalData = await this._contract.getWithdrawalData(btcTx);
            abortSignal.throwIfAborted();
            pendingWithdrawals.unshift(withdrawalData);
            utxo = pendingWithdrawals[0].getSpentVaultUtxo();
            this.logger.debug("verifyReturnedData(): Vault UTXO: " + vault.getUtxo() + " current utxo: " + utxo);
            if (pendingWithdrawals.length >= this._options.maxTransactionsDelta)
                throw new IntermediaryError_1.IntermediaryError("BTC <> SC state difference too deep, maximum: " + this._options.maxTransactionsDelta);
        }
        //Verify that the vault has enough balance after processing all pending withdrawals
        let vaultBalances;
        try {
            vaultBalances = vault.calculateStateAfter(pendingWithdrawals);
        }
        catch (e) {
            this.logger.error("Error calculating spv vault balance (owner: " + resp.address + " vaultId: " + resp.vaultId.toString(10) + "): ", e);
            throw new IntermediaryError_1.IntermediaryError("Spv swap vault balance prediction failed", e);
        }
        if (vaultBalances.balances[0].scaledAmount < resp.total)
            throw new IntermediaryError_1.IntermediaryError("SPV swap vault, insufficient balance, required: " + resp.total.toString(10) +
                " has: " + vaultBalances.balances[0].scaledAmount.toString(10));
        if (vaultBalances.balances[1].scaledAmount < resp.totalGas)
            throw new IntermediaryError_1.IntermediaryError("SPV swap vault, insufficient balance, required: " + resp.totalGas.toString(10) +
                " has: " + vaultBalances.balances[1].scaledAmount.toString(10));
        //Also verify that all the withdrawal txns are valid, this is an extra sanity check
        try {
            for (let withdrawal of pendingWithdrawals) {
                await this._contract.checkWithdrawalTx(withdrawal);
            }
        }
        catch (e) {
            this.logger.error("Error calculating spv vault balance (owner: " + resp.address + " vaultId: " + resp.vaultId.toString(10) + "): ", e);
            throw new IntermediaryError_1.IntermediaryError("Spv swap vault balance prediction failed", e);
        }
        abortSignal.throwIfAborted();
        return {
            vault,
            vaultUtxoValue
        };
    }
    amountPrefetch(amountData, bitcoinFeeRatePromise, bitcoinWallet, includeGas, abortController) {
        const existingSwapWalletUtxosPromise = (async () => {
            try {
                if (bitcoinWallet == null)
                    return undefined;
                return await bitcoinWallet.getUtxoPool();
            }
            catch (e) {
                abortController.abort(e);
            }
        })();
        const amountPromise = (async () => {
            try {
                if (amountData.amount != null) {
                    if (bitcoinWallet == null || !amountData.exactIn)
                        return amountData.amount;
                    const bitcoinFeeRate = await (0, Utils_1.throwIfUndefined)(bitcoinFeeRatePromise, "Cannot fetch Bitcoin fee rate!");
                    const expectedBtcFee = this.getExpectedNetworkFee(bitcoinWallet.getReceiveAddress(), bitcoinFeeRate, includeGas);
                    return amountData.amount - expectedBtcFee;
                }
                else {
                    const bitcoinFeeRate = await (0, Utils_1.throwIfUndefined)(bitcoinFeeRatePromise, "Cannot fetch Bitcoin fee rate!");
                    if (bitcoinWallet == null)
                        throw new UserError_1.UserError("Cannot use empty amount without passing a swap address mnemonic!");
                    const spendableBalance = await bitcoinWallet.getSpendableBalance(this.getDummySwapPsbt(includeGas), bitcoinFeeRate, exports.REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE, await (0, Utils_1.throwIfUndefined)(existingSwapWalletUtxosPromise));
                    if (spendableBalance.balance <= 0n)
                        throw new UserError_1.UserError("Wallet doesn't have enough BTC balance to cover transaction fees");
                    return spendableBalance.balance;
                }
            }
            catch (e) {
                abortController.abort(e);
            }
        })();
        return {
            amountPromise,
            existingSwapWalletUtxosPromise
        };
    }
    async mnemonicToWalletAndWIF(walletMnemonic) {
        if (walletMnemonic == null)
            return {};
        const bitcoinWalletWIF = await SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet.mnemonicToPrivateKey(walletMnemonic, this._options.bitcoinNetwork);
        const bitcoinWallet = new SingleAddressBitcoinWallet_1.SingleAddressBitcoinWallet(this._btcRpc, this._options.bitcoinNetwork, bitcoinWalletWIF);
        return { bitcoinWallet, bitcoinWalletWIF };
    }
    /**
     * Returns a newly created Bitcoin -> Smart chain swap using the SPV vault (UTXO-controlled vault) swap protocol,
     *  with the passed amount. Also allows specifying additional "gas drop" native token that the receipient receives
     *  on the destination chain in the `options` argument.
     *
     * @param recipient Recipient address on the destination smart chain
     * @param amountData Amount, token and exact input/output data for to swap
     * @param lps An array of intermediaries (LPs) to get the quotes from
     * @param options Optional additional quote options
     * @param additionalParams Optional additional parameters sent to the LP when creating the swap
     * @param abortSignal Abort signal
     */
    async create(recipient, amountData, lps, options, additionalParams, abortSignal) {
        const _options = {
            gasAmount: options?.gasAmount ?? 0n,
            unsafeZeroWatchtowerFee: options?.unsafeZeroWatchtowerFee ?? false,
            feeSafetyFactor: options?.feeSafetyFactor ?? 1.25,
            maxAllowedNetworkFeeRate: options?.maxAllowedNetworkFeeRate ?? Infinity,
            walletMnemonic: options?.walletMnemonic
        };
        if (amountData.amount == null && _options.walletMnemonic == null)
            throw new UserError_1.UserError("Wallet mnemonic needs to be passed when amount is null!");
        if (amountData.amount == null && !amountData.exactIn)
            throw new UserError_1.UserError("Amount can be null only for exactIn swaps!");
        const { bitcoinWallet, bitcoinWalletWIF } = await this.mnemonicToWalletAndWIF(_options.walletMnemonic);
        const _abortController = (0, Utils_1.extendAbortController)(abortSignal);
        const pricePrefetchPromise = this.preFetchPrice(amountData, _abortController.signal);
        const usdPricePrefetchPromise = this.preFetchUsdPrice(_abortController.signal);
        const finalizedBlockHeightPrefetchPromise = this.preFetchFinalizedBlockHeight(_abortController);
        const nativeTokenAddress = this._chain.getNativeCurrencyAddress();
        const gasTokenPricePrefetchPromise = _options.gasAmount === 0n
            ? undefined
            : this.preFetchPrice({ token: nativeTokenAddress }, _abortController.signal);
        const callerFeePrefetchPromise = this.preFetchCallerFeeInNativeToken(amountData, _options, _abortController);
        const bitcoinFeeRatePromise = _options.maxAllowedNetworkFeeRate != Infinity
            ? Promise.resolve(_options.maxAllowedNetworkFeeRate)
            : this._btcRpc.getFeeRate()
                .then(x => this._options.maxBtcFeeOffset + (x * this._options.maxBtcFeeMultiplier))
                .catch(e => {
                _abortController.abort(e);
                return undefined;
            });
        const { amountPromise, existingSwapWalletUtxosPromise } = this.amountPrefetch(amountData, bitcoinFeeRatePromise, bitcoinWallet, _options.gasAmount !== 0n, _abortController);
        return lps.map(lp => {
            return {
                intermediary: lp,
                quote: (0, RetryUtils_1.tryWithRetries)(async () => {
                    if (lp.services[SwapType_1.SwapType.SPV_VAULT_FROM_BTC] == null)
                        throw new Error("LP service for processing spv vault swaps not found!");
                    const abortController = (0, Utils_1.extendAbortController)(_abortController.signal);
                    const callerFeeRatePromise = this.computeCallerFeeShare(amountPromise, callerFeePrefetchPromise, amountData, _options, pricePrefetchPromise, gasTokenPricePrefetchPromise, abortController.signal);
                    try {
                        const resp = await (0, RetryUtils_1.tryWithRetries)(async (retryCount) => {
                            return await IntermediaryAPI_1.IntermediaryAPI.prepareSpvFromBTC(this.chainIdentifier, lp.url, {
                                address: recipient,
                                amount: (0, Utils_1.throwIfUndefined)(amountPromise, "Swap amount error!"),
                                token: amountData.token.toString(),
                                exactOut: !amountData.exactIn,
                                gasToken: nativeTokenAddress,
                                gasAmount: _options.gasAmount,
                                callerFeeRate: callerFeeRatePromise,
                                frontingFeeRate: 0n,
                                additionalParams
                            }, this._options.postRequestTimeout, abortController.signal, retryCount > 0 ? false : undefined);
                        }, undefined, e => e instanceof RequestError_1.RequestError, abortController.signal);
                        this.logger.debug("create(" + lp.url + "): LP response: ", resp);
                        const callerFeeShare = await (0, Utils_1.throwIfUndefined)(callerFeeRatePromise);
                        const amount = await (0, Utils_1.throwIfUndefined)(amountPromise);
                        const [pricingInfo, gasPricingInfo, { vault, vaultUtxoValue }] = await Promise.all([
                            this.verifyReturnedPrice(lp.services[SwapType_1.SwapType.SPV_VAULT_FROM_BTC], false, resp.btcAmountSwap, resp.total * (100000n + callerFeeShare) / 100000n, amountData.token, {}, pricePrefetchPromise, usdPricePrefetchPromise, abortController.signal),
                            _options.gasAmount === 0n ? Promise.resolve(undefined) : this.verifyReturnedPrice({ ...lp.services[SwapType_1.SwapType.SPV_VAULT_FROM_BTC], swapBaseFee: 0 }, //Base fee should be charged only on the amount, not on gas
                            false, resp.btcAmountGas, resp.totalGas * (100000n + callerFeeShare) / 100000n, nativeTokenAddress, {}, gasTokenPricePrefetchPromise, usdPricePrefetchPromise, abortController.signal),
                            this.verifyReturnedData(resp, { ...amountData, amount }, lp, _options, callerFeeShare, bitcoinFeeRatePromise, abortController.signal)
                        ]);
                        const existingSwapWalletUtxos = await (0, Utils_1.throwIfUndefined)(existingSwapWalletUtxosPromise);
                        const swapInit = {
                            pricingInfo,
                            url: lp.url,
                            expiry: resp.expiry * 1000,
                            swapFee: resp.swapFee,
                            swapFeeBtc: resp.swapFeeBtc,
                            exactIn: amountData.exactIn ?? true,
                            quoteId: resp.quoteId,
                            recipient,
                            vaultOwner: resp.address,
                            vaultId: resp.vaultId,
                            vaultRequiredConfirmations: vault.getConfirmations(),
                            vaultTokenMultipliers: vault.getTokenData().map(val => val.multiplier),
                            vaultBtcAddress: resp.vaultBtcAddress,
                            vaultUtxo: resp.btcUtxo,
                            vaultUtxoValue: BigInt(vaultUtxoValue),
                            btcDestinationAddress: resp.btcAddress,
                            btcAmount: resp.btcAmount,
                            btcAmountSwap: resp.btcAmountSwap,
                            btcAmountGas: resp.btcAmountGas,
                            minimumBtcFeeRate: resp.btcFeeRate,
                            outputTotalSwap: resp.total,
                            outputSwapToken: amountData.token,
                            outputTotalGas: resp.totalGas,
                            outputGasToken: nativeTokenAddress,
                            gasSwapFeeBtc: resp.gasSwapFeeBtc,
                            gasSwapFee: resp.gasSwapFee,
                            gasPricingInfo,
                            callerFeeShare: resp.callerFeeShare,
                            frontingFeeShare: resp.frontingFeeShare,
                            executionFeeShare: resp.executionFeeShare,
                            genesisSmartChainBlockHeight: await (0, Utils_1.throwIfUndefined)(finalizedBlockHeightPrefetchPromise, "Finalize block height promise failed!"),
                            swapWalletWIF: bitcoinWalletWIF,
                            swapWalletAddress: bitcoinWallet?.getReceiveAddress(),
                            swapWalletMaxNetworkFeeRate: await (0, Utils_1.throwIfUndefined)(bitcoinFeeRatePromise),
                            swapWalletType: bitcoinWalletWIF == null ? undefined : amountData.amount == null ? "prefunded" : "waitpayment",
                            swapWalletExistingUtxos: existingSwapWalletUtxos.map(utxo => utxo.txId + ":" + utxo.vout)
                        };
                        const quote = new SpvFromBTCSwap_1.SpvFromBTCSwap(this, swapInit);
                        await quote._save();
                        return quote;
                    }
                    catch (e) {
                        abortController.abort(e);
                        throw e;
                    }
                }, undefined, err => !(err instanceof IntermediaryError_1.IntermediaryError && err.recoverable), _abortController.signal)
            };
        });
    }
    /**
     * Recovers an SPV vault (UTXO-controlled vault) based swap from smart chain on-chain data
     *
     * @param state State of the spv vault withdrawal recovered from on-chain data
     * @param vault SPV vault processing the swap
     * @param lp Intermediary (LP) used as a counterparty for the swap
     */
    async recoverFromState(state, vault, lp) {
        //Get the vault
        vault ??= await this._contract.getVaultData(state.owner, state.vaultId);
        if (vault == null)
            return null;
        if (state.btcTxId == null)
            return null;
        const btcTx = await this._btcRpc.getTransaction(state.btcTxId);
        if (btcTx == null)
            return null;
        const withdrawalData = await this._contract.getWithdrawalData(btcTx)
            .catch(e => {
            this.logger.warn(`Error parsing withdrawal data for tx ${btcTx.txid}: `, e);
            return null;
        });
        if (withdrawalData == null)
            return null;
        const vaultTokens = vault.getTokenData();
        const withdrawalDataOutputs = withdrawalData.getTotalOutput();
        const txBlock = await state.getTxBlock?.();
        const swapInit = {
            pricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100000000000000n,
                realPriceUSatPerToken: 100000000000000n,
                differencePPM: 0n,
                feePPM: 0n,
            },
            url: lp?.url,
            expiry: 0,
            swapFee: 0n,
            swapFeeBtc: 0n,
            exactIn: true,
            //Use bitcoin tx id as quote id, even though this is not strictly correct as this
            // is an off-chain identifier presented by the LP that cannot be recovered from on-chain
            // data
            quoteId: btcTx.txid,
            recipient: state.recipient,
            vaultOwner: state.owner,
            vaultId: state.vaultId,
            vaultRequiredConfirmations: vault.getConfirmations(),
            vaultTokenMultipliers: vault.getTokenData().map(val => val.multiplier),
            vaultBtcAddress: (0, BitcoinUtils_1.fromOutputScript)(this._options.bitcoinNetwork, withdrawalData.getNewVaultScript().toString("hex")),
            vaultUtxo: withdrawalData.getSpentVaultUtxo(),
            vaultUtxoValue: BigInt(withdrawalData.getNewVaultBtcAmount()),
            btcDestinationAddress: (0, BitcoinUtils_1.fromOutputScript)(this._options.bitcoinNetwork, btcTx.outs[2].scriptPubKey.hex),
            btcAmount: BigInt(btcTx.outs[2].value),
            btcAmountSwap: BigInt(btcTx.outs[2].value),
            btcAmountGas: 0n,
            minimumBtcFeeRate: 0,
            outputTotalSwap: withdrawalDataOutputs[0] * vaultTokens[0].multiplier,
            outputSwapToken: vaultTokens[0].token,
            outputTotalGas: withdrawalDataOutputs[1] * vaultTokens[1].multiplier,
            outputGasToken: vaultTokens[1].token,
            gasSwapFeeBtc: 0n,
            gasSwapFee: 0n,
            gasPricingInfo: {
                isValid: true,
                satsBaseFee: 0n,
                swapPriceUSatPerToken: 100000000000000n,
                realPriceUSatPerToken: 100000000000000n,
                differencePPM: 0n,
                feePPM: 0n,
            },
            callerFeeShare: withdrawalData.callerFeeRate,
            frontingFeeShare: withdrawalData.frontingFeeRate,
            executionFeeShare: withdrawalData.executionFeeRate,
            genesisSmartChainBlockHeight: txBlock?.blockHeight ?? 0
        };
        const quote = new SpvFromBTCSwap_1.SpvFromBTCSwap(this, swapInit);
        quote._data = withdrawalData;
        if (txBlock != null) {
            quote.createdAt = txBlock.blockTime * 1000;
        }
        else if (btcTx.blockhash == null) {
            quote.createdAt = Date.now();
        }
        else {
            const blockHeader = await this._btcRpc.getBlockHeader(btcTx.blockhash);
            quote.createdAt = blockHeader == null ? Date.now() : blockHeader.getTimestamp() * 1000;
        }
        quote._setInitiated();
        if (btcTx.inputAddresses != null)
            quote._senderAddress = btcTx.inputAddresses[1];
        if (state.type === base_1.SpvWithdrawalStateType.FRONTED) {
            quote._frontTxId = state.txId;
            quote._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.FRONTED;
        }
        else {
            quote._claimTxId = state.txId;
            quote._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.CLAIMED;
        }
        await quote._save();
        return quote;
    }
    /**
     * Returns a random dummy PSBT that can be used for fee estimation, the last output (the LP output) is omitted
     *  to allow for coinselection algorithm to determine maximum sendable amount there
     *
     * @param includeGasToken Whether to return the PSBT also with the gas token amount (increases the vSize by 8)
     */
    getDummySwapPsbt(includeGasToken = false) {
        //Construct dummy swap psbt
        const psbt = new btc_signer_1.Transaction({
            allowUnknownInputs: true,
            allowLegacyWitnessUtxo: true,
            allowUnknownOutputs: true
        });
        const randomVaultOutScript = btc_signer_1.OutScript.encode({ type: "tr", pubkey: Buffer.from("0101010101010101010101010101010101010101010101010101010101010101", "hex") });
        psbt.addInput({
            txid: (0, Utils_1.randomBytes)(32),
            index: 0,
            witnessUtxo: {
                script: randomVaultOutScript,
                amount: 600n
            }
        });
        psbt.addOutput({
            script: randomVaultOutScript,
            amount: 600n
        });
        const opReturnData = this._contract.toOpReturnData(this._chain.randomAddress(), includeGasToken ? [0xffffffffffffffffn, 0xffffffffffffffffn] : [0xffffffffffffffffn]);
        psbt.addOutput({
            script: Buffer.concat([
                opReturnData.length <= 75 ? Buffer.from([0x6a, opReturnData.length]) : Buffer.from([0x6a, 0x4c, opReturnData.length]),
                opReturnData
            ]),
            amount: 0n
        });
        return psbt;
    }
    /**
     * Returns the expected bitcoin transaction fee considering a single wallet input is used
     *
     * @param bitcoinAddress A wallet address for which to estimate the fee
     * @param bitcoinFeeRate Bitcoin fee rate in sats/vB
     * @param includeGasToken Whether to also include a gas drop in the calculation
     */
    getExpectedNetworkFee(bitcoinAddress, bitcoinFeeRate, includeGasToken) {
        const dummyPsbt = this.getDummySwapPsbt(includeGasToken);
        const txInputs = [];
        for (let i = 0; i < dummyPsbt.inputsLength; i++) {
            const input = dummyPsbt.getInput(i);
            const inputScript = (input.witnessUtxo?.script ?? input.nonWitnessUtxo.outputs[input.index].script);
            txInputs.push({ type: (0, BitcoinUtils_1.toCoinselectAddressType)(inputScript) });
        }
        txInputs.push({ type: (0, BitcoinWallet_1.identifyAddressType)(bitcoinAddress, this._options.bitcoinNetwork) });
        const txOutputs = [];
        for (let i = 0; i < dummyPsbt.outputsLength; i++) {
            txOutputs.push({ script: Buffer.from(dummyPsbt.getOutput(i).script) });
        }
        txOutputs.push({ type: exports.REQUIRED_SPV_SWAP_LP_ADDRESS_TYPE });
        const txVsize = utils_2.utils.transactionBytes(txInputs, txOutputs);
        return BigInt(Math.ceil(txVsize * bitcoinFeeRate));
    }
    async checkSwapWalletSwaps(swaps) {
        swaps.sort((a, b) => b.createdAt - a.createdAt);
        const successfullyUsedWallets = [];
        const swapWalletData = {};
        for (const swap of swaps) {
            if (!swap.isInitiated() || swap.getState() !== SpvFromBTCSwap_1.SpvFromBTCSwapState.CREATED)
                continue;
            const swapWalletAddress = swap._getSwapWalletAddress();
            if (!swapWalletAddress)
                continue;
            if (successfullyUsedWallets.includes(swapWalletAddress))
                continue;
            let walletData = swapWalletData[swapWalletAddress];
            if (walletData == null) {
                const { confirmedBalance, unconfirmedBalance } = await this._btcRpc.getAddressBalances(swapWalletAddress);
                const balance = confirmedBalance + unconfirmedBalance;
                walletData = swapWalletData[swapWalletAddress] = {
                    balance,
                    utxos: balance === 0n ? [] : await swap._getSwapBitcoinWallet().getUtxoPool()
                };
            }
            if (walletData.balance <= 0n)
                continue;
            try {
                if (await swap._tryToPayFromSwapWallet(walletData.utxos))
                    successfullyUsedWallets.push(swapWalletAddress);
            }
            catch (e) {
                this.logger.debug(`checkSwapWalletSwaps(): Tried to process ${swap.getId()}, but invalid wallet UTXO was found! Reason: ${e.toString()}`);
            }
        }
    }
    /**
     * @inheritDoc
     * @internal
     */
    async _checkPastSwaps(pastSwaps) {
        const changedSwaps = new Set();
        const removeSwaps = [];
        const broadcastedOrConfirmedSwaps = [];
        for (let pastSwap of pastSwaps) {
            let changed = false;
            if (pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.DECLINED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
                //Check BTC transaction
                if (await pastSwap._syncStateFromBitcoin(false))
                    changed ||= true;
            }
            if (pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.CREATED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.SIGNED ||
                pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.POSTED) {
                if (await pastSwap._verifyQuoteDefinitelyExpired()) {
                    if (pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.CREATED) {
                        pastSwap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_EXPIRED;
                    }
                    else {
                        pastSwap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED;
                    }
                    changed ||= true;
                }
            }
            if (pastSwap.isQuoteExpired()) {
                removeSwaps.push(pastSwap);
                continue;
            }
            if (changed)
                changedSwaps.add(pastSwap);
            if (pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BROADCASTED || pastSwap._state === SpvFromBTCSwap_1.SpvFromBTCSwapState.BTC_TX_CONFIRMED) {
                if (pastSwap._data != null)
                    broadcastedOrConfirmedSwaps.push(pastSwap);
            }
        }
        const checkWithdrawalStateSwaps = [];
        const _fronts = await this._contract.getFronterAddresses(broadcastedOrConfirmedSwaps.map(val => ({
            ...val.getSpvVaultData(),
            withdrawal: val._data
        })));
        const _vaultUtxos = await this._contract.getVaultLatestUtxos(broadcastedOrConfirmedSwaps.map(val => val.getSpvVaultData()));
        for (const pastSwap of broadcastedOrConfirmedSwaps) {
            const fronterAddress = _fronts[pastSwap._data.getTxId()];
            const vault = pastSwap.getSpvVaultData();
            const latestVaultUtxo = _vaultUtxos[vault.owner]?.[vault.vaultId.toString(10)];
            if (fronterAddress === undefined)
                this.logger.warn(`_checkPastSwaps(): No fronter address returned for ${pastSwap._data.getTxId()}`);
            if (latestVaultUtxo === undefined)
                this.logger.warn(`_checkPastSwaps(): No last vault utxo returned for ${pastSwap._data.getTxId()}`);
            if (await pastSwap._shouldCheckWithdrawalState(fronterAddress, latestVaultUtxo))
                checkWithdrawalStateSwaps.push(pastSwap);
        }
        const withdrawalStates = await this._contract.getWithdrawalStates(checkWithdrawalStateSwaps.map(val => ({
            withdrawal: val._data,
            scStartBlockheight: val._genesisSmartChainBlockHeight
        })));
        for (const pastSwap of checkWithdrawalStateSwaps) {
            const status = withdrawalStates[pastSwap._data.getTxId()];
            if (status == null) {
                this.logger.warn(`_checkPastSwaps(): No withdrawal state returned for ${pastSwap._data.getTxId()}`);
                continue;
            }
            this.logger.debug("syncStateFromChain(): status of " + pastSwap._data.btcTx.txid, status?.type);
            let changed = false;
            switch (status.type) {
                case base_1.SpvWithdrawalStateType.FRONTED:
                    pastSwap._frontTxId = status.txId;
                    pastSwap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.FRONTED;
                    changed ||= true;
                    break;
                case base_1.SpvWithdrawalStateType.CLAIMED:
                    pastSwap._claimTxId = status.txId;
                    pastSwap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.CLAIMED;
                    changed ||= true;
                    break;
                case base_1.SpvWithdrawalStateType.CLOSED:
                    pastSwap._state = SpvFromBTCSwap_1.SpvFromBTCSwapState.CLOSED;
                    changed ||= true;
                    break;
            }
            if (changed)
                changedSwaps.add(pastSwap);
        }
        await this.checkSwapWalletSwaps(pastSwaps);
        return {
            changedSwaps: Array.from(changedSwaps),
            removeSwaps
        };
    }
}
exports.SpvFromBTCWrapper = SpvFromBTCWrapper;
