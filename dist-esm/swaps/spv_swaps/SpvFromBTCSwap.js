import { assertSupportedSpvFundingType, DEFAULT_CPFP_ASSUMPTION, REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE } from "./SpvFromBTCWrapper.js";
import { extendAbortController } from "../../utils/Utils.js";
import { fromOutputScript, getUtxoKey, getWalletAddressUtxos, toCoinselectAddressType, toOutputScript, toUtxoMap, toUtxoSet } from "../../utils/BitcoinUtils.js";
import { Buffer } from "buffer";
import { FeeType } from "../../enums/FeeType.js";
import { toTokenAmount } from "../../types/TokenAmount.js";
import { BitcoinTokens } from "../../types/Token.js";
import { timeoutPromise } from "../../utils/TimeoutUtils.js";
import { utils } from "../../bitcoin/coinselect2/utils";
import { isSpvFromBTCSwapInit, SpvFromBTCSwapBase, SpvFromBTCSwapState } from "./SpvFromBTCSwapBase";
import { addPsbtInputs, toBitcoinWallet } from "../../utils/BitcoinWalletUtils";
import { identifyAddressType } from "../../bitcoin/wallet/BitcoinWallet";
import { InvalidBitcoinDepositError } from "../../errors/InvalidBitcoinDepositError";
/**
 * Public SPV vault BTC -> smart-chain swap class.
 *
 * @remarks
 * PSBT mode preserves the existing wallet-funded SPV behavior. External deposit mode is added in the subclass so
 * restored swaps continue to deserialize through this public class while base PSBT mechanics stay reusable.
 *
 * @category Swaps/Bitcoin → Smart chain
 */
export class SpvFromBTCSwap extends SpvFromBTCSwapBase {
    constructor(wrapper, initOrObject) {
        super(wrapper, initOrObject);
        this.swapMode = "psbt";
        this.externalSwapModeInfo = null;
        if (!isSpvFromBTCSwapInit(initOrObject)) {
            this.swapMode = initOrObject.swapMode ?? "psbt";
            this.externalDepositTxId = initOrObject.externalDepositTxId;
            const info = initOrObject.externalSwapModeInfo;
            if (info != null)
                this.externalSwapModeInfo = {
                    ...info,
                    selectedExistingUtxos: info.selectedExistingUtxos.map((utxo) => ({
                        ...utxo,
                        outputScript: Buffer.from(utxo.outputScript, "hex"),
                    })),
                    requiredDeposit: info.requiredDeposit == null ? undefined : {
                        ...info.requiredDeposit,
                        amount: BigInt(info.requiredDeposit.amount)
                    },
                    changeAmount: info.changeAmount == null ? undefined : BigInt(info.changeAmount),
                    totalNetworkFee: BigInt(info.totalNetworkFee)
                };
        }
    }
    async setExternalDepositTxId(txId) {
        if (txId == null || this.externalDepositTxId === txId)
            return;
        this.externalDepositTxId = txId;
        if (this._persisted)
            await this._save();
    }
    /**
     * Returns external mode metadata or throws a mode-specific error.
     *
     * @param operation Human-readable operation name included in the thrown error
     * @returns Active external mode metadata
     * @throws {Error} if the swap is not currently configured for external deposit mode
     */
    getIntermediateWalletSwapModeInfoOrThrow(operation) {
        if (this.swapMode !== "intermediate_wallet" || this.externalSwapModeInfo == null) {
            throw new Error(`${operation} requires 'intermediate_wallet' swap mode`);
        }
        return this.externalSwapModeInfo;
    }
    /**
     * Returns the network fee to be paid on the input/source network
     *
     * @internal
     */
    getNetworkInputFee() {
        if (this.swapMode !== "intermediate_wallet" || this.externalSwapModeInfo == null)
            return null;
        if (this.pricingInfo == null)
            throw new Error("No pricing info known, cannot estimate fee!");
        const outputToken = this.getOutputToken();
        const networkFee = this.externalSwapModeInfo.totalNetworkFee;
        const networkFeeInOutputToken = networkFee
            * (10n ** BigInt(outputToken.decimals))
            * 1000000n
            / this.pricingInfo.swapPriceUSatPerToken;
        const amountInSrcToken = toTokenAmount(networkFee, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(networkFeeInOutputToken, outputToken, this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }
    getFinalizedCoinselect(inputs, outputs, feeRate = this.minimumBtcFeeRate, changeType = null) {
        const txDetails = this.getTransactionDetails();
        return utils.finalize([
            {
                value: Number(txDetails.vaultAmount),
                type: REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE
            },
            ...inputs
        ], [
            {
                value: Number(txDetails.vaultAmount),
                script: Buffer.from(txDetails.vaultScript)
            },
            {
                value: 0,
                script: Buffer.from(txDetails.out1script)
            },
            {
                value: Number(txDetails.out2amount),
                script: Buffer.from(txDetails.out2script)
            },
            ...outputs
        ], feeRate, changeType);
    }
    getFundingFeeRate(utxos) {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getExternalDepositFeeRate()");
        return this.getFinalizedCoinselect(utxos, info.changeAmount == null ? [] : [{ value: Number(info.changeAmount), type: info.walletAddressType }]).effectiveFeeRate ?? 0;
    }
    /**
     * Serializes this swap, including external mode metadata when active.
     *
     * @remarks
     * In-memory `selectedExistingUtxos` may be full {@link BitcoinWalletUtxo} objects, but persistence narrows each
     * UTXO to JSON-safe primitive fields and quote-time CPFP metadata.
     *
     * @returns JSON stringifiable swap data suitable for SDK storage
     */
    serialize() {
        const externalSwapModeInfo = this.externalSwapModeInfo != null
            ? {
                ...this.externalSwapModeInfo,
                selectedExistingUtxos: this.externalSwapModeInfo.selectedExistingUtxos.map(utxo => ({
                    txId: utxo.txId,
                    vout: utxo.vout,
                    value: utxo.value,
                    type: utxo.type,
                    outputScript: utxo.outputScript.toString("hex"),
                    publicKey: utxo.publicKey,
                    cpfp: utxo.cpfp == null ? undefined : {
                        txVsize: utxo.cpfp.txVsize,
                        txEffectiveFeeRate: utxo.cpfp.txEffectiveFeeRate
                    }
                })),
                requiredDeposit: this.externalSwapModeInfo.requiredDeposit == null ? undefined : {
                    ...this.externalSwapModeInfo.requiredDeposit,
                    amount: this.externalSwapModeInfo.requiredDeposit?.amount.toString(10)
                },
                changeAmount: this.externalSwapModeInfo.changeAmount?.toString(10),
                totalNetworkFee: this.externalSwapModeInfo.totalNetworkFee.toString(10)
            }
            : null;
        return {
            ...super.serialize(),
            swapMode: this.swapMode,
            externalSwapModeInfo,
            externalDepositTxId: this.externalDepositTxId
        };
    }
    /**
     * Returns the active SPV funding mode.
     *
     * @returns `"psbt"` for the normal wallet-funded PSBT flow or `"intermediate_wallet"` for intermediate-wallet deposit mode
     */
    getSwapMode() {
        return this.swapMode;
    }
    /**
     * Switches this swap back to normal PSBT mode and optionally clears cached external deposit metadata.
     *
     * @param clearMetadata Whether to also clean the internal saved metadata for the "intermedate_wallet" swap mode
     *  (if it was used before this function got called), if `false` is passed you can get back to "intermediate_wallet"
     *  swap mode by calling {@link returnToIntermediateWalletSwapMode}
     */
    async setSwapModePsbt(clearMetadata = true) {
        if (this._state !== SpvFromBTCSwapState.CREATED)
            throw new Error("Cannot change swap mode outside of CREATED state!");
        this.swapMode = "psbt";
        if (clearMetadata) {
            this.externalSwapModeInfo = null;
            this.externalDepositTxId = undefined;
        }
        if (this._persisted)
            await this._save();
    }
    /**
     * Returns back to the "intermediate_wallet" swap mode with the already saved and persisted mode metadata (selected
     *  utxos, fee rate, required deposit, etc.), this is possible if the swap was previously switched from
     *  "intermediate_wallet" swap mode to "psbt" swap mode by calling the {@link setSwapModePsbt} and passing the
     *  `clearMetadata=false`, which retains the swap mode metadata.
     */
    async returnToIntermediateWalletSwapMode() {
        if (this._state !== SpvFromBTCSwapState.CREATED)
            throw new Error("Cannot change swap mode outside of CREATED state!");
        if (this.externalSwapModeInfo == null)
            throw new Error("No 'intermediate_wallet' swap mode metadata found!");
        this.swapMode = "intermediate_wallet";
        if (this._persisted)
            await this._save();
    }
    /**
     * Configures this SPV quote for an external intermediate-wallet deposit flow.
     *
     * @param intermediateWallet Intermediate Bitcoin wallet or deposit address. Wallets provide the receive address via
     *  `getReceiveAddress()` and, when `existingUtxos` is omitted, must support `getUtxoPool()`.
     * @param existingUtxos Optional quote-time UTXO set for `intermediateWallet`; when passed, the objects are kept in
     *  memory as-is and only narrowed during serialization.
     * @param feeRate Optional Bitcoin fee rate in sats/vB; normalized to at least this quote's minimum LP fee rate.
     * @param cpfpAssumptions CPFP metadata for the future incoming UTXO; defaults to a conservative small package.
     * @throws {Error} if the wallet cannot expose the information required for its funding plan or the fee rate is invalid
     */
    async setSwapModeIntermediateWallet(intermediateWallet, existingUtxos, feeRate, cpfpAssumptions) {
        if (this._state !== SpvFromBTCSwapState.CREATED)
            throw new Error("Cannot change swap mode outside of CREATED state!");
        const wallet = toBitcoinWallet(intermediateWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const walletAddressInfo = wallet.getAddressInfo(false);
        const walletAddressType = toCoinselectAddressType(this.wrapper._options.bitcoinNetwork, walletAddressInfo.address);
        assertSupportedSpvFundingType(walletAddressType);
        if (existingUtxos == null) {
            existingUtxos = await wallet.getUtxoPool();
        }
        existingUtxos.forEach(utxo => assertSupportedSpvFundingType(utxo.type));
        let resolvedFeeRate = Math.max(feeRate ?? this.minimumBtcFeeRate, this.minimumBtcFeeRate);
        if (!Number.isFinite(resolvedFeeRate) || resolvedFeeRate <= 0)
            throw new Error("Bitcoin fee rate must be a positive number!");
        const resolvedCpfpAssumptions = cpfpAssumptions ?? DEFAULT_CPFP_ASSUMPTION;
        let totalNetworkFee;
        let requiredDepositAmount;
        let changeAmount;
        const { fee, effectiveFeeRate, expectedFee, changeOutputAdded } = this.getFinalizedCoinselect(existingUtxos, [], resolvedFeeRate, walletAddressType);
        if (effectiveFeeRate != null && fee >= expectedFee) {
            //Wallet has enough funds
            if (changeOutputAdded) {
                //Also change output should be added
                changeAmount = BigInt(changeOutputAdded.value);
            }
            totalNetworkFee = BigInt(fee);
            resolvedFeeRate = effectiveFeeRate;
        }
        else {
            //Requires additional fake UTXO to fund
            //Calculate tx size with 1 additional UTXO
            const expectedUtxo = {
                value: 0,
                type: walletAddressType,
                cpfp: resolvedCpfpAssumptions
            };
            const { expectedFee } = this.getFinalizedCoinselect([expectedUtxo].concat(existingUtxos), [], resolvedFeeRate);
            const existingUtxoBalance = existingUtxos.reduce((total, utxo) => total + BigInt(utxo.value), 0n);
            //Calculate additional external funding required
            requiredDepositAmount = super.getInput().rawAmount + BigInt(expectedFee) - existingUtxoBalance;
            //Check sub-dust
            const dustThreshold = BigInt(utils.dustThreshold({ type: walletAddressType }));
            if (requiredDepositAmount < dustThreshold) {
                requiredDepositAmount = dustThreshold;
            }
            //Re-calculate the final coinselection result
            expectedUtxo.value = Number(requiredDepositAmount);
            const finalResult = this.getFinalizedCoinselect([expectedUtxo].concat(existingUtxos), [], resolvedFeeRate);
            totalNetworkFee = BigInt(finalResult.fee);
            resolvedFeeRate = finalResult.effectiveFeeRate;
        }
        return await this._setSwapModeIntermediateWallet({
            walletAddressType,
            selectedExistingUtxos: existingUtxos,
            requiredDeposit: requiredDepositAmount == null ? undefined : {
                ...walletAddressInfo,
                amount: requiredDepositAmount,
                cpfpAssumptions: resolvedCpfpAssumptions
            },
            changeAmount,
            feeRate: resolvedFeeRate,
            totalNetworkFee
        });
    }
    /**
     * Applies a precomputed intermediate-wallet funding plan to this swap.
     *
     * @param fundingPlan Verified funding plan produced while creating the quote
     * @returns The applied intermediate-wallet mode information
     * @internal
     */
    async _setSwapModeIntermediateWallet(fundingPlan) {
        if (this._state !== SpvFromBTCSwapState.CREATED)
            throw new Error("Cannot change swap mode outside of CREATED state!");
        assertSupportedSpvFundingType(fundingPlan.walletAddressType);
        fundingPlan.selectedExistingUtxos.forEach(utxo => assertSupportedSpvFundingType(utxo.type));
        this.swapMode = "intermediate_wallet";
        this.externalSwapModeInfo = fundingPlan;
        this.externalDepositTxId = undefined;
        if (this._persisted)
            await this._save();
        return fundingPlan;
    }
    /**
     * Checks whether this swap currently exposes address-swap behavior.
     *
     * @returns `true` only in external deposit mode
     */
    isAddressSwapMode() {
        return this.swapMode === "intermediate_wallet" && this.externalSwapModeInfo?.requiredDeposit != null;
    }
    /**
     * Returns the intermediate Bitcoin deposit address for external mode.
     *
     * @returns Bitcoin address that should receive the additional future UTXO
     * @throws {Error} if the swap is in PSBT mode
     */
    getAddress() {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getAddress()");
        if (info.requiredDeposit == null)
            throw new Error("Needs to specify a required deposit amount!");
        return info.requiredDeposit.address;
    }
    /**
     * Returns a BIP-21 Bitcoin URI for the external deposit address and required additional UTXO amount.
     *
     * @returns Bitcoin payment URI for QR-code display
     * @throws {Error} if the swap is in PSBT mode
     */
    getHyperlink() {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getHyperlink()");
        if (info.requiredDeposit == null)
            throw new Error("Needs to specify a required deposit amount!");
        return "bitcoin:" + info.requiredDeposit.address + "?amount=" + encodeURIComponent((Number(info.requiredDeposit.amount) / 100000000).toString(10));
    }
    /**
     * Returns whether the current swap in "intermediate_wallet" mode requires an additional external deposit to be made
     */
    requiresExternalDeposit() {
        return this.isAddressSwapMode();
    }
    /**
     * Returns the required additional external deposit amount in "intermediate_wallet" mode, or `null` if not required
     *
     * @throws {Error} If the swap is not using the "intermediate_wallet" swap mode.
     */
    getExternalDepositAmount() {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getExternalDepositAmount()");
        if (info.requiredDeposit == null)
            return null;
        return toTokenAmount(info.requiredDeposit.amount, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Returns the user-facing BTC input amount.
     *
     * @remarks
     * PSBT mode returns the base SPV quote input. External mode includes the input-side Bitcoin network fee cached
     * during {@link setSwapModeIntermediateWallet}.
     *
     * @returns Input BTC amount in satoshis wrapped as a token amount
     */
    getInput() {
        if (this.swapMode !== "intermediate_wallet" || this.externalSwapModeInfo == null)
            return super.getInput();
        return toTokenAmount(super.getInput().rawAmount + this.externalSwapModeInfo.totalNetworkFee, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * @inheritDoc
     */
    getFee() {
        const swapFee = this.getSwapFee();
        const watchtowerFee = this.getWatchtowerFee();
        const networkInputFee = this.getNetworkInputFee();
        const amountInSrcToken = toTokenAmount(swapFee.amountInSrcToken.rawAmount + watchtowerFee.amountInSrcToken.rawAmount + (networkInputFee?.amountInSrcToken.rawAmount ?? 0n), BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(swapFee.amountInDstToken.rawAmount + watchtowerFee.amountInDstToken.rawAmount + (networkInputFee?.amountInDstToken.rawAmount ?? 0n), this.getOutputToken(), this.wrapper._prices, this.pricingInfo),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }
    /**
     * @inheritDoc
     *
     * @returns Fee breakdown with `FeeType.NETWORK_INPUT` only when external deposit mode is active
     * @throws {Error} if pricing data is unavailable in external mode
     */
    getFeeBreakdown() {
        const baseBreakdown = super._getFeeBreakdown();
        const networkInputFee = this.getNetworkInputFee();
        if (networkInputFee == null)
            return baseBreakdown;
        return [
            {
                type: FeeType.NETWORK_INPUT,
                fee: networkInputFee
            },
            ...baseBreakdown
        ];
    }
    /**
     * Looks for the future external deposit UTXO matching the cached required additional amount.
     *
     * @param rehydratedWalletUtxos
     * @param ignoredUtxoKeys Invalid UTXO keys already handled by the waiting callback
     * @returns Matching fresh wallet UTXO or all newly detected invalid UTXOs
     * @throws {Error} if the swap is not in external mode
     */
    getMatchingExternalDepositUtxo(rehydratedWalletUtxos, ignoredUtxoKeys) {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getMatchingExternalDepositUtxo()");
        if (info.requiredDeposit == null)
            return {
                matchedUtxo: null,
                invalidUtxos: []
            };
        const requiredDepositInfo = info.requiredDeposit;
        const rehydratedWalletUtxosMap = toUtxoMap(rehydratedWalletUtxos);
        const rehydratedSelectedUtxos = info.selectedExistingUtxos.map(utxo => rehydratedWalletUtxosMap.get(getUtxoKey(utxo)) ?? utxo);
        const selectedUtxosKeys = toUtxoSet(info.selectedExistingUtxos);
        const invalidUtxos = [];
        for (const utxo of rehydratedWalletUtxos) {
            //Only check UTXOs at the expected address
            if (utxo.address !== requiredDepositInfo.address)
                continue;
            const key = getUtxoKey(utxo);
            if (selectedUtxosKeys.has(key) || ignoredUtxoKeys?.has(key))
                continue;
            const actualAmount = BigInt(utxo.value);
            if (actualAmount < requiredDepositInfo.amount) {
                invalidUtxos.push({
                    key,
                    utxo,
                    reason: "amount_too_small",
                    requiredAmount: requiredDepositInfo.amount,
                    actualAmount
                });
                continue;
            }
            if (actualAmount > requiredDepositInfo.amount) {
                invalidUtxos.push({
                    key,
                    utxo,
                    reason: "amount_too_large",
                    requiredAmount: requiredDepositInfo.amount,
                    actualAmount
                });
                continue;
            }
            const effectiveFeeRate = this.getFundingFeeRate(rehydratedSelectedUtxos.concat([utxo]));
            if (effectiveFeeRate >= this.minimumBtcFeeRate)
                return {
                    matchedUtxo: utxo,
                    invalidUtxos: []
                };
            invalidUtxos.push({
                key,
                utxo,
                reason: "deposit_fee_too_low",
                requiredAmount: requiredDepositInfo.amount,
                actualAmount,
                effectiveFeeRate,
                minimumFeeRate: this.minimumBtcFeeRate
            });
        }
        return {
            matchedUtxo: null,
            invalidUtxos
        };
    }
    /**
     * Rehydrates quote-selected external funding UTXOs with fresh signing data while preserving quote-time fee data.
     *
     * @param rehydratedWalletUtxos
     * @returns Rehydrated selected wallet utxos
     * @throws {Error} if a selected UTXO disappeared, changed value/type, or the required new deposit is missing
     */
    getRehydratedSelectedExistingUtxos(rehydratedWalletUtxos) {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getRehydratedSelectedExistingUtxos()");
        const rehydratedWalletUtxosMap = toUtxoMap(rehydratedWalletUtxos);
        return info.selectedExistingUtxos.map(selectedUtxo => {
            const freshUtxo = rehydratedWalletUtxosMap.get(`${selectedUtxo.txId}:${selectedUtxo.vout}`);
            if (freshUtxo == null) {
                throw new Error(`Selected external funding UTXO ${selectedUtxo.txId}:${selectedUtxo.vout} no longer exists; please re-quote`);
            }
            if (freshUtxo.value !== selectedUtxo.value || freshUtxo.type !== selectedUtxo.type) {
                throw new Error(`Selected external funding UTXO ${selectedUtxo.txId}:${selectedUtxo.vout} changed; please re-quote`);
            }
            return freshUtxo;
        });
    }
    /**
     * Returns fresh UTXOs for every address involved in the intermediate-wallet funding plan.
     *
     * A supplied wallet remains authoritative. Without one, persisted output scripts and public keys provide enough
     * information to query the wrapper's address-index backend directly.
     */
    async getIntermediateWalletUtxos(_intermediateWallet) {
        if (_intermediateWallet != null) {
            const intermediateWallet = toBitcoinWallet(_intermediateWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
            return await intermediateWallet.getUtxoPool();
        }
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getIntermediateWalletUtxos()");
        const network = this.wrapper._options.bitcoinNetwork;
        const addresses = new Map();
        for (const utxo of info.selectedExistingUtxos) {
            const address = fromOutputScript(network, utxo.outputScript.toString("hex"));
            addresses.set(address, {
                publicKey: utxo.publicKey,
                addressType: utxo.type
            });
        }
        if (info.requiredDeposit != null)
            addresses.set(info.requiredDeposit.address, {
                publicKey: info.requiredDeposit.publicKey,
                addressType: info.walletAddressType
            });
        return (await Promise.all(Array.from(addresses, ([address, addressInfo]) => getWalletAddressUtxos(this.wrapper._btcRpc, network, address, addressInfo.publicKey, addressInfo.addressType)))).flat();
    }
    async getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs, utxos, spendFully) {
        if (this.swapMode === "psbt")
            return await super.getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs, utxos, spendFully);
        if (feeRate != null)
            throw new Error("Manual fee rate is not supported in the intermediate wallet mode!");
        if (additionalOutputs != null)
            throw new Error("Additional outputs are not supported in the intermediate wallet mode!");
        if (spendFully != null)
            throw new Error("Spend fully flag is not supported in the intermediate wallet mode!");
        const bitcoinWallet = toBitcoinWallet(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const rehydratedWalletUtxos = utxos ?? await bitcoinWallet.getUtxoPool();
        const selectedRehydratedUtxos = this.getRehydratedSelectedExistingUtxos(rehydratedWalletUtxos);
        //Add external funding if required
        if (this.externalSwapModeInfo?.requiredDeposit != null) {
            const result = this.getMatchingExternalDepositUtxo(rehydratedWalletUtxos);
            if (result.matchedUtxo == null)
                throw new Error(`Expected external funding of ${this.externalSwapModeInfo.requiredDeposit.amount.toString(10)} sats, not found in the wallet!`);
            await this.setExternalDepositTxId(result.matchedUtxo.txId);
            selectedRehydratedUtxos.push(result.matchedUtxo);
        }
        const { psbt, in1sequence } = this.getPsbt();
        await addPsbtInputs(psbt, selectedRehydratedUtxos, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        psbt.updateInput(1, { sequence: in1sequence });
        //Add change output if required
        if (this.externalSwapModeInfo?.changeAmount != null) {
            if (bitcoinWallet.getChangeAddress == null)
                throw new Error("Intermediate bitcoin wallet has to support getChangeAddress() fn!");
            const changeAddress = bitcoinWallet.getChangeAddress();
            if (this.externalSwapModeInfo.walletAddressType !== identifyAddressType(changeAddress, this.wrapper._options.bitcoinNetwork))
                throw new Error(`Wallet returned an invalid change address type, expected: ${this.externalSwapModeInfo.walletAddressType}`);
            psbt.addOutput({
                amount: this.externalSwapModeInfo.changeAmount,
                script: toOutputScript(this.wrapper._options.bitcoinNetwork, changeAddress)
            });
        }
        const { effectiveFeeRate } = this.getFinalizedCoinselect(selectedRehydratedUtxos, this.externalSwapModeInfo?.changeAmount == null
            ? []
            : [{ value: Number(this.externalSwapModeInfo.changeAmount), type: this.externalSwapModeInfo.walletAddressType }]);
        if (effectiveFeeRate == null)
            throw new Error("Not enough balance to create the swap PSBT!");
        if (effectiveFeeRate < this.minimumBtcFeeRate)
            throw new Error("PSBT effective fee rate is below minimum required by the LP!");
        //Sign every input except the first one
        const signInputs = [];
        for (let i = 1; i < psbt.inputsLength; i++) {
            signInputs.push(i);
        }
        const serializedPsbt = Buffer.from(psbt.toPSBT());
        return {
            psbt,
            psbtHex: serializedPsbt.toString("hex"),
            psbtBase64: serializedPsbt.toString("base64"),
            signInputs,
            feeRate: effectiveFeeRate
        };
    }
    /**
     * @throws {InvalidBitcoinDepositError} If an invalid deposit was mode and was not consumed by the `onInvalidDeposit`
     *  callback
     *
     * @private
     */
    async _waitForExternalDeposit(_intermediateWallet, maxWaitTimeSeconds, pollIntervalSeconds, onInvalidDeposit, abortSignal) {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("waitForExternalDeposit()");
        if (info.requiredDeposit == null) {
            throw new Error("No external deposit required for this SPV swap");
        }
        const abortController = extendAbortController(abortSignal, maxWaitTimeSeconds, "Timed out waiting for external Bitcoin deposit");
        const ignoredUtxoKeys = new Set();
        try {
            while (this._state !== SpvFromBTCSwapState.QUOTE_EXPIRED && await this._verifyQuoteValid()) {
                const walletUtxos = await this.getIntermediateWalletUtxos(_intermediateWallet);
                const rehydratedUtxos = this.getRehydratedSelectedExistingUtxos(walletUtxos);
                const matchResult = this.getMatchingExternalDepositUtxo(walletUtxos, ignoredUtxoKeys);
                if (matchResult.matchedUtxo != null) {
                    await this.setExternalDepositTxId(matchResult.matchedUtxo.txId);
                    return {
                        rehydratedUtxos,
                        newlyDepositedUtxo: matchResult.matchedUtxo
                    };
                }
                if (matchResult.invalidUtxos.length > 0) {
                    if (onInvalidDeposit == null || !await onInvalidDeposit(matchResult.invalidUtxos))
                        throw new InvalidBitcoinDepositError(matchResult.invalidUtxos);
                    matchResult.invalidUtxos.forEach(invalidUtxo => {
                        if (invalidUtxo.reason !== "deposit_fee_too_low")
                            ignoredUtxoKeys.add(invalidUtxo.key);
                    });
                }
                const sleepTime = Math.min((pollIntervalSeconds ?? 5) * 1000, this.expiry - Date.now());
                if (sleepTime <= 0)
                    break;
                await timeoutPromise(sleepTime, abortController.signal);
            }
            throw new Error("Quote expired while waiting for external deposit!");
        }
        catch (e) {
            throw e;
        }
        finally {
            abortController.abort();
        }
    }
    /**
     * Waits until the external deposit address receives the exact future UTXO required by this quote.
     *
     * @param _intermediateWallet Optional wallet used to fetch UTXOs; the configured Bitcoin RPC is used when omitted
     * @param maxWaitTimeSeconds Optional maximum wait time before aborting
     * @param pollIntervalSeconds Optional polling interval; defaults to five seconds
     * @param onInvalidDeposit Optional callback invoked with all newly detected invalid UTXOs; return falsish to stop waiting
     * @param abortSignal Optional external abort signal
     * @returns The newly deposited UTXO matching the quote
     * @throws {Error} if the swap is not in external mode or no additional deposit is required
     * @throws {InvalidBitcoinDepositError} If an invalid deposit was mode and was not consumed by the `onInvalidDeposit`
     *  callback
     */
    async waitForExternalDeposit(_intermediateWallet, maxWaitTimeSeconds, pollIntervalSeconds, onInvalidDeposit, abortSignal) {
        const result = await this._waitForExternalDeposit(_intermediateWallet, maxWaitTimeSeconds, pollIntervalSeconds, onInvalidDeposit, abortSignal);
        return result.newlyDepositedUtxo;
    }
    /**
     * @inheritDoc
     */
    async estimateBitcoinFee(_bitcoinWallet, feeRate) {
        if (this.swapMode === "psbt")
            return await super.estimateBitcoinFee(_bitcoinWallet, feeRate);
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("estimateBitcoinFee");
        return toTokenAmount(info.totalNetworkFee, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);
    }
    /**
     * Executes this swap, waiting for the quoted external deposit first when intermediate-wallet funding is active.
     *
     * @param wallet Bitcoin wallet used to discover and sign the intermediate-wallet funding inputs
     * @param callbacks Callbacks used to track the external deposit and normal SPV execution lifecycle
     * @param options Execution polling, timeout, and cancellation options
     * @returns Whether the swap settled automatically
     * @throws {InvalidBitcoinDepositError} If an invalid deposit was mode and was not consumed by the `onInvalidDeposit`
     *  callback
     */
    async execute(wallet, callbacks, options) {
        let baseOptions = options;
        if (this.swapMode === "intermediate_wallet") {
            if (options?.feeRate !== undefined)
                throw new Error("Manual fee rate is not supported in the intermediate wallet mode!");
            if (options?.utxos !== undefined)
                throw new Error("Manual UTXO selection is not supported in the intermediate wallet mode!");
            if (options?.spendFully !== undefined)
                throw new Error("Spend fully flag is not supported in the intermediate wallet mode!");
            if (this._state === SpvFromBTCSwapState.CREATED && this.externalSwapModeInfo?.requiredDeposit != null) {
                const result = await this._waitForExternalDeposit(wallet, options?.maxWaitForExternalDepositSeconds, options?.externalDepositCheckIntervalSeconds, callbacks?.onInvalidExternalDeposit, options?.abortSignal);
                callbacks?.onExternalDepositReceived?.(result.newlyDepositedUtxo.txId);
                baseOptions = {
                    ...options,
                    utxos: result.rehydratedUtxos.concat([result.newlyDepositedUtxo])
                };
            }
        }
        return await super.execute(wallet, callbacks, baseOptions);
    }
    /**
     * Builds an address action for the future external deposit UTXO.
     *
     * @returns Send-to-address action that waits only for the matching UTXO to appear
     * @throws {Error} if the swap is not in external mode
     */
    async _buildExternalDepositAddressAction(bitcoinWallet, options) {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("_buildExternalDepositAddressAction()");
        return {
            type: "SendToAddress",
            name: "Deposit on Bitcoin",
            description: "Send funds to the Bitcoin deposit address",
            chain: "BITCOIN",
            txs: [{
                    type: "BITCOIN_ADDRESS",
                    address: this.getAddress(),
                    hyperlink: this.getHyperlink(),
                    amount: toTokenAmount(info.requiredDeposit.amount, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo)
                }],
            waitForTransactions: async (maxWaitTimeSeconds, pollIntervalSeconds, abortSignal) => {
                const waitStatus = await this.waitForExternalDeposit(options?.bitcoinWallet ?? bitcoinWallet, maxWaitTimeSeconds, pollIntervalSeconds, () => true, abortSignal);
                return waitStatus.txId;
            }
        };
    }
    /**
     * Builds a funded PSBT action for signing with the external intermediate deposit wallet.
     *
     * @param rehydratedWalletUtxos
     * @param bitcoinWallet
     * @param options Additional options allow overriding the provided bitcoin wallet
     * @returns Funded PSBT action using the quote-stable external funding set
     * @throws {Error} if `bitcoinWallet` is missing while external mode is ready for PSBT signing
     */
    async _buildExternalDepositPsbtAction(rehydratedWalletUtxos, bitcoinWallet, options) {
        const _bitcoinWallet = options?.bitcoinWallet ?? bitcoinWallet;
        if (_bitcoinWallet == null)
            throw new Error("Bitcoin wallet is required to construct a swap PSBT!");
        const resolvedBtcWallet = toBitcoinWallet(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        return {
            type: "SignPSBT",
            name: "Deposit on Bitcoin",
            description: "Sign and submit the Bitcoin swap transaction from the intermediate deposit wallet",
            chain: "BITCOIN",
            txs: [{
                    ...await this.getFundedPsbt(resolvedBtcWallet, undefined, undefined, rehydratedWalletUtxos),
                    type: "FUNDED_PSBT"
                }],
            submitPsbt: async (signedPsbt, idempotent) => {
                return this._submitExecutionTransactions(Array.isArray(signedPsbt) ? signedPsbt : [signedPsbt], undefined, [SpvFromBTCSwapState.CREATED, SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED], idempotent);
            }
        };
    }
    /**
     * Adds external-mode staged actions on top of the base SPV execution status.
     *
     * @param options Optional execution action context, especially `bitcoinWallet` for funded external PSBTs
     * @returns Execution status with SendToAddress or funded SignPSBT action while external mode is in CREATED state
     * @internal
     */
    async _getExecutionStatus(options) {
        const executionStatus = await super._getExecutionStatus(options);
        if (this.swapMode !== "intermediate_wallet")
            return executionStatus;
        let buildCurrentAction = executionStatus.buildCurrentAction;
        let matchedNewUtxo;
        if (executionStatus.state === SpvFromBTCSwapState.CREATED &&
            await this._verifyQuoteValid()) {
            const rehydratedWalletUtxos = await this.getIntermediateWalletUtxos(options?.bitcoinWallet);
            this.getRehydratedSelectedExistingUtxos(rehydratedWalletUtxos);
            if (this.externalSwapModeInfo?.requiredDeposit != null) {
                matchedNewUtxo = this.getMatchingExternalDepositUtxo(rehydratedWalletUtxos).matchedUtxo ?? undefined;
                if (matchedNewUtxo != null) {
                    await this.setExternalDepositTxId(matchedNewUtxo?.txId);
                    buildCurrentAction = this._buildExternalDepositPsbtAction.bind(this, rehydratedWalletUtxos, options?.bitcoinWallet);
                }
                else {
                    buildCurrentAction = this._buildExternalDepositAddressAction.bind(this, options?.bitcoinWallet);
                }
            }
            else {
                buildCurrentAction = this._buildExternalDepositPsbtAction.bind(this, rehydratedWalletUtxos, options?.bitcoinWallet);
            }
        }
        const steps = executionStatus.steps;
        const externalPaymentStep = {
            ...steps[0],
            description: "Fund the intermediate Bitcoin swap wallet, then sign and submit the swap transaction PSBT and wait for it to confirm",
            initTxId: this.externalDepositTxId ?? matchedNewUtxo?.txId,
            settleTxId: this.getInputTxId() ?? undefined
        };
        return {
            ...executionStatus,
            steps: [
                externalPaymentStep,
                steps[1]
            ],
            buildCurrentAction
        };
    }
    /**
     * @inheritDoc
     */
    async getExecutionSteps(options) {
        return (await this._getExecutionStatus(options)).steps;
    }
}
