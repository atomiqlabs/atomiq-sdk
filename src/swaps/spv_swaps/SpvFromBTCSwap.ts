import {ChainType} from "@atomiqlabs/base";
import {
    assertSupportedSpvFundingType,
    DEFAULT_CPFP_ASSUMPTION,
    REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE,
    SpvFromBTCWrapper
} from "./SpvFromBTCWrapper.js";
import {extendAbortController} from "../../utils/Utils.js";
import {
    fromOutputScript,
    getUtxoKey,
    getWalletAddressUtxos,
    toCoinselectAddressType, toOutputScript,
    toUtxoMap,
    toUtxoSet
} from "../../utils/BitcoinUtils.js";
import {Transaction} from "@scure/btc-signer";
import {Buffer} from "buffer";
import {
    BitcoinWalletUtxo,
    IBitcoinWallet,
    isIBitcoinWallet
} from "../../bitcoin/wallet/IBitcoinWallet.js";
import {IAddressSwap} from "../IAddressSwap.js";
import {
    MinimalBitcoinWalletInterface,
    MinimalBitcoinWalletInterfaceWithSigner
} from "../../types/wallets/MinimalBitcoinWalletInterface.js";
import {FeeType} from "../../enums/FeeType.js";
import {TokenAmount, toTokenAmount} from "../../types/TokenAmount.js";
import {BitcoinTokens, BtcToken, SCToken} from "../../types/Token.js";
import {timeoutPromise} from "../../utils/TimeoutUtils.js";
import {
    SwapExecutionActionSendToAddress,
    SwapExecutionActionSignPSBT,
    SwapExecutionActionSignSmartChainTx,
    SwapExecutionActionWait
} from "../../types/SwapExecutionAction.js";
import {SwapExecutionStepPayment, SwapExecutionStepSettlement} from "../../types/SwapExecutionStep.js";
import {SwapStateInfo} from "../../types/SwapStateInfo.js";
import {CoinselectAddressTypes, CoinselectTxInput, CoinselectTxOutput, utils} from "../../bitcoin/coinselect2/utils.js";
import {isSpvFromBTCSwapInit, SpvFromBTCSwapBase, SpvFromBTCSwapInit, SpvFromBTCSwapState} from "./SpvFromBTCSwapBase.js";
import {Fee} from "../../types/fees/Fee.js";
import {addPsbtInputs, toBitcoinWallet} from "../../utils/BitcoinWalletUtils";
import {identifyAddressType} from "../../bitcoin/wallet/BitcoinWallet";

type ExternalDepositInvalidReason = "amount_too_small" | "amount_too_large" | "deposit_fee_too_low";

type ExternalDepositInvalidUtxo = {
    key: string,
    utxo: BitcoinWalletUtxo,
    reason: ExternalDepositInvalidReason,
    requiredAmount: bigint,
    actualAmount: bigint,
    effectiveFeeRate?: number,
    minimumFeeRate?: number
};

type ExternalDepositMatchResult = {
    matchedUtxo: BitcoinWalletUtxo | null,
    invalidUtxos: ExternalDepositInvalidUtxo[]
};

/**
 * Runtime mode for an SPV BTC -> smart-chain swap.
 *
 * `"psbt"` preserves the normal wallet-funded PSBT flow. `"intermediate_wallet"` represents an intermediate-wallet flow where
 * callers deposit one future UTXO to a configured Bitcoin address before signing the fully funded SPV PSBT.
 */
export type SpvFromBTCSwapMode = "psbt" | "intermediate_wallet";

/**
 * Minimal persisted UTXO snapshot used by SPV external deposit mode.
 *
 * @remarks
 * Full {@link BitcoinWalletUtxo} objects may be kept in memory, but serialization narrows them to this JSON-safe
 * primitive shape so output scripts and other binary fields are not persisted.
 */
export type SpvExternalSelectedUtxo = {
    /**
     * Bitcoin transaction id containing the UTXO.
     */
    txId: string;
    /**
     * Output index inside `txId`.
     */
    vout: number;
    /**
     * UTXO value in satoshis.
     */
    value: number;
    /**
     * Address type used for coin selection and transaction-size estimation.
     */
    type: CoinselectAddressTypes;
    /**
     * Output script of the UTXO
     */
    outputScript: Buffer,
    /**
     * Public key associated with the UTXO
     */
    publicKey: string,
    /**
     * Optional quote-time CPFP metadata for unconfirmed inputs.
     */
    cpfp?: {
        txVsize: number;
        txEffectiveFeeRate: number;
    };
};

/**
 * Cached external deposit mode data stored on a public {@link SpvFromBTCSwap}.
 *
 * @remarks
 * `requiredAdditionalUtxoAmount` and `totalNetworkFee` are bigint satoshi amounts so restored quotes can show the
 * same external deposit requirement without re-estimating. `selectedExistingUtxos` may contain full wallet UTXOs in
 * memory, but {@link SpvFromBTCSwap.serialize} persists only {@link SpvExternalSelectedUtxo} fields. `spendFully`
 * controls whether those selected UTXOs are consumed without change (`true`) or fund the PSBT with wallet change
 * allowed (`false`).
 */
export type SpvFromBTCIntermediateWalletSwapModeInfo = {
    /**
     * Coin selection address type inferred from `depositAddress`.
     */
    walletAddressType: CoinselectAddressTypes;
    /**
     * Existing UTXOs selected for the external quote. Full-spend mode uses the full selected set; change-aware mode
     * treats this as the wallet funding pool for the quote.
     */
    selectedExistingUtxos: SpvExternalSelectedUtxo[];
    /**
     * Bitcoin address controlled by the intermediate wallet.
     */
    requiredDeposit?: {
        address: string;
        publicKey: string;
        /**
         * Satoshis still required as one future UTXO at `depositAddress`.
         */
        amount: bigint;
        /**
         * CPFP package-fee assumptions for the future incoming deposit UTXO.
         */
        cpfpAssumptions: {
            txVsize: number;
            txEffectiveFeeRate: number;
        };
    },
    /**
     * Amount to send back to the original wallet as change
     */
    changeAmount?: bigint;
    /**
     * Bitcoin fee rate in sats/vB used for the final funding transaction.
     */
    feeRate: number;
    /**
     * Estimated input-side Bitcoin network fee in satoshis.
     */
    totalNetworkFee: bigint;
};

/**
 * Public SPV vault BTC -> smart-chain swap class.
 *
 * @remarks
 * PSBT mode preserves the existing wallet-funded SPV behavior. External deposit mode is added in the subclass so
 * restored swaps continue to deserialize through this public class while base PSBT mechanics stay reusable.
 *
 * @category Swaps/Bitcoin → Smart chain
 */
export class SpvFromBTCSwap<T extends ChainType> extends SpvFromBTCSwapBase<T> implements IAddressSwap {

    private swapMode: SpvFromBTCSwapMode = "psbt";
    private externalSwapModeInfo: SpvFromBTCIntermediateWalletSwapModeInfo | null = null;
    private externalDepositTxId?: string;

    constructor(wrapper: SpvFromBTCWrapper<T>, init: SpvFromBTCSwapInit);
    constructor(wrapper: SpvFromBTCWrapper<T>, obj: any);
    constructor(wrapper: SpvFromBTCWrapper<T>, initOrObject: SpvFromBTCSwapInit | any) {
        super(wrapper, initOrObject);

        if(!isSpvFromBTCSwapInit(initOrObject)) {
            const info = initOrObject.externalSwapModeInfo;
            if(initOrObject.swapMode === "intermediate_wallet" && info != null) {
                this.swapMode = "intermediate_wallet";
                this.externalSwapModeInfo = {
                    ...info,
                    selectedExistingUtxos: info.selectedExistingUtxos.map((utxo: any) => ({
                        ...utxo,
                        outputScript: Buffer.from(utxo.outputScript, "hex"),
                    })),
                    requiredDeposit: info.requiredDeposit==null ? undefined : {
                        ...info.requiredDeposit,
                        amount: BigInt(info.requiredDeposit.amount)
                    },
                    changeAmount: info.changeAmount==null ? undefined : BigInt(info.changeAmount),
                    totalNetworkFee: BigInt(info.totalNetworkFee)
                };
                this.externalDepositTxId = initOrObject.externalDepositTxId;
            } else {
                this.swapMode = "psbt";
                this.externalSwapModeInfo = null;
                this.externalDepositTxId = undefined;
            }
        }
    }

    private async setExternalDepositTxId(txId?: string): Promise<void> {
        if(txId == null || this.externalDepositTxId === txId) return;
        this.externalDepositTxId = txId;
        if(this._persisted) await this._save();
    }

    /**
     * Returns external mode metadata or throws a mode-specific error.
     *
     * @param operation Human-readable operation name included in the thrown error
     * @returns Active external mode metadata
     * @throws {Error} if the swap is not currently configured for external deposit mode
     */
    private getIntermediateWalletSwapModeInfoOrThrow(operation: string): SpvFromBTCIntermediateWalletSwapModeInfo {
        if(this.swapMode !== "intermediate_wallet" || this.externalSwapModeInfo == null) {
            throw new Error(`${operation} requires SPV external deposit mode`);
        }
        return this.externalSwapModeInfo;
    }

    /**
     * Returns the network fee to be paid on the input/source network
     *
     * @internal
     */
    protected getNetworkInputFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> | null {
        if(this.swapMode !== "intermediate_wallet" || this.externalSwapModeInfo == null) return null;

        if(this.pricingInfo==null) throw new Error("No pricing info known, cannot estimate fee!");

        const outputToken = this.getOutputToken();
        const networkFee = this.externalSwapModeInfo.totalNetworkFee;
        const networkFeeInOutputToken = networkFee
            * (10n ** BigInt(outputToken.decimals))
            * 1_000_000n
            / this.pricingInfo.swapPriceUSatPerToken;
        const amountInSrcToken = toTokenAmount(networkFee, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo);

        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(
                networkFeeInOutputToken,
                outputToken,
                this.wrapper._prices,
                this.pricingInfo
            ),
            currentUsdValue: amountInSrcToken.currentUsdValue,
            usdValue: amountInSrcToken.usdValue,
            pastUsdValue: amountInSrcToken.pastUsdValue
        };
    }

    private getFinalizedCoinselect(
        inputs: Omit<CoinselectTxInput, "txId" | "address" | "vout" | "outputScript">[],
        outputs: CoinselectTxOutput[],
        feeRate: number = this.minimumBtcFeeRate,
        changeType: CoinselectAddressTypes | null = null
    ) {
        const txDetails = this.getTransactionDetails();
        return utils.finalize(
            [
                {
                    value: Number(txDetails.vaultAmount),
                    type: REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE
                },
                ...inputs
            ],
            [
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
            ],
            feeRate,
            changeType
        );
    }

    private getFundingFeeRate(utxos: SpvExternalSelectedUtxo[]): number {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getExternalDepositFeeRate()");
        return this.getFinalizedCoinselect(
            utxos,
            info.changeAmount==null ? [] : [{value: Number(info.changeAmount), type: info.walletAddressType}]
        ).effectiveFeeRate ?? 0;
    }

    /**
     * Serializes this swap, including external mode metadata when active.
     *
     * @remarks
     * In-memory `selectedExistingUtxos` may be full {@link BitcoinWalletUtxo} objects, but persistence narrows each
     * UTXO to JSON-safe primitive fields and quote-time CPFP metadata. PSBT mode serializes `externalSwapModeInfo`
     * as `null`.
     *
     * @returns JSON stringifiable swap data suitable for SDK storage
     */
    serialize(): any {
        const externalSwapModeInfo = this.swapMode === "intermediate_wallet" && this.externalSwapModeInfo != null
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
                requiredDeposit: this.externalSwapModeInfo.requiredDeposit==null ? undefined : {
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
            externalDepositTxId: this.swapMode === "intermediate_wallet" ? this.externalDepositTxId : undefined
        };
    }

    /**
     * Returns the active SPV funding mode.
     *
     * @returns `"psbt"` for the normal wallet-funded PSBT flow or `"intermediate_wallet"` for intermediate-wallet deposit mode
     */
    getSwapMode(): SpvFromBTCSwapMode {
        return this.swapMode;
    }

    /**
     * Returns cached external deposit mode metadata when the swap is in external mode.
     *
     * @returns External deposit metadata, or `null` in PSBT mode
     */
    getIntermediateWalletSwapModeInfo(): SpvFromBTCIntermediateWalletSwapModeInfo | null {
        return this.externalSwapModeInfo;
    }

    /**
     * Switches this swap back to normal PSBT mode and clears cached external deposit metadata.
     *
     * @remarks
     * If the swap was already persisted, the mode change is saved asynchronously because this API is intentionally
     * synchronous.
     */
    async setSwapModePsbt(): Promise<void> {
        if(this._state !== SpvFromBTCSwapState.CREATED) throw new Error("Cannot change swap mode outside of CREATED state!");
        this.swapMode = "psbt";
        this.externalSwapModeInfo = null;
        this.externalDepositTxId = undefined;
        if(this._persisted) await this._save();
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
    async setSwapModeIntermediateWallet(
        intermediateWallet: IBitcoinWallet | MinimalBitcoinWalletInterface,
        existingUtxos?: BitcoinWalletUtxo[],
        feeRate?: number,
        cpfpAssumptions?: {
            txVsize: number,
            txEffectiveFeeRate: number
        }
    ): Promise<SpvFromBTCIntermediateWalletSwapModeInfo> {
        if(this._state !== SpvFromBTCSwapState.CREATED) throw new Error("Cannot change swap mode outside of CREATED state!");

        const wallet = toBitcoinWallet(intermediateWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);

        const walletAddressInfo = wallet.getAddressInfo(false);
        const walletAddressType = toCoinselectAddressType(this.wrapper._options.bitcoinNetwork, walletAddressInfo.address);
        assertSupportedSpvFundingType(walletAddressType);

        if(existingUtxos==null) {
            existingUtxos = await wallet.getUtxoPool();
        }
        existingUtxos.forEach(utxo => assertSupportedSpvFundingType(utxo.type));

        let resolvedFeeRate = Math.max(feeRate ?? this.minimumBtcFeeRate, this.minimumBtcFeeRate);
        if(!Number.isFinite(resolvedFeeRate) || resolvedFeeRate<=0) throw new Error("Bitcoin fee rate must be a positive number!");
        const resolvedCpfpAssumptions = cpfpAssumptions ?? DEFAULT_CPFP_ASSUMPTION;

        let totalNetworkFee: bigint;
        let requiredDepositAmount: bigint | undefined;
        let changeAmount: bigint | undefined;

        const {fee, effectiveFeeRate, expectedFee, changeOutputAdded} = this.getFinalizedCoinselect(existingUtxos, [], resolvedFeeRate, walletAddressType);
        if(effectiveFeeRate!=null && fee>=expectedFee) {
            //Wallet has enough funds
            if(changeOutputAdded) {
                //Also change output should be added
                changeAmount = BigInt(changeOutputAdded.value);
            }
            totalNetworkFee = BigInt(fee);
            resolvedFeeRate = effectiveFeeRate;
        } else {
            //Requires additional fake UTXO to fund
            //Calculate tx size with 1 additional UTXO
            const expectedUtxo: Omit<CoinselectTxInput, "txId" | "address" | "vout" | "outputScript"> = {
                value: 0,
                type: walletAddressType,
                cpfp: resolvedCpfpAssumptions
            };
            const {expectedFee} = this.getFinalizedCoinselect([expectedUtxo].concat(existingUtxos), [], resolvedFeeRate);
            const existingUtxoBalance = existingUtxos.reduce((total, utxo) => total + BigInt(utxo.value), 0n);

            //Calculate additional external funding required
            requiredDepositAmount = super.getInput().rawAmount + BigInt(expectedFee) - existingUtxoBalance;

            //Check sub-dust
            const dustThreshold = BigInt(utils.dustThreshold({type: walletAddressType}));
            if(requiredDepositAmount<dustThreshold) {
                requiredDepositAmount = dustThreshold;
            }

            //Re-calculate the final coinselection result
            expectedUtxo.value = Number(requiredDepositAmount);
            const finalResult = this.getFinalizedCoinselect([expectedUtxo].concat(existingUtxos), [], resolvedFeeRate);
            totalNetworkFee = BigInt(finalResult.fee);
            resolvedFeeRate = finalResult.effectiveFeeRate!;
        }

        return await this._setSwapModeIntermediateWallet({
            walletAddressType,
            selectedExistingUtxos: existingUtxos,
            requiredDeposit: requiredDepositAmount==null ? undefined : {
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
    async _setSwapModeIntermediateWallet(
        fundingPlan: SpvFromBTCIntermediateWalletSwapModeInfo
    ): Promise<SpvFromBTCIntermediateWalletSwapModeInfo> {
        if(this._state !== SpvFromBTCSwapState.CREATED) throw new Error("Cannot change swap mode outside of CREATED state!");
        assertSupportedSpvFundingType(fundingPlan.walletAddressType);
        fundingPlan.selectedExistingUtxos.forEach(utxo => assertSupportedSpvFundingType(utxo.type));

        this.swapMode = "intermediate_wallet";
        this.externalSwapModeInfo = fundingPlan;
        this.externalDepositTxId = undefined;
        if(this._persisted) await this._save();
        return fundingPlan;
    }

    /**
     * Checks whether this swap currently exposes address-swap behavior.
     *
     * @returns `true` only in external deposit mode
     */
    isAddressSwapMode(): boolean {
        return this.swapMode === "intermediate_wallet" && this.externalSwapModeInfo?.requiredDeposit!=null;
    }

    /**
     * Returns the intermediate Bitcoin deposit address for external mode.
     *
     * @returns Bitcoin address that should receive the additional future UTXO
     * @throws {Error} if the swap is in PSBT mode
     */
    getAddress(): string {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getAddress()");
        if(info.requiredDeposit==null) throw new Error("Needs to specify a required deposit amount!");
        return info.requiredDeposit.address;
    }

    /**
     * Returns a BIP-21 Bitcoin URI for the external deposit address and required additional UTXO amount.
     *
     * @returns Bitcoin payment URI for QR-code display
     * @throws {Error} if the swap is in PSBT mode
     */
    getHyperlink(): string {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getHyperlink()");
        if(info.requiredDeposit==null) throw new Error("Needs to specify a required deposit amount!");
        return "bitcoin:" + info.requiredDeposit.address + "?amount=" + encodeURIComponent((Number(info.requiredDeposit.amount) / 100000000).toString(10));
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
    getInput(): TokenAmount<BtcToken<false>, true> {
        if(this.swapMode !== "intermediate_wallet" || this.externalSwapModeInfo == null) return super.getInput();
        return toTokenAmount(
            super.getInput().rawAmount + this.externalSwapModeInfo.totalNetworkFee,
            BitcoinTokens.BTC,
            this.wrapper._prices,
            this.pricingInfo
        );
    }

    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> {
        const swapFee = this.getSwapFee();
        const watchtowerFee = this.getWatchtowerFee();
        const networkInputFee = this.getNetworkInputFee();

        const amountInSrcToken = toTokenAmount(
            swapFee.amountInSrcToken.rawAmount + watchtowerFee.amountInSrcToken.rawAmount + (networkInputFee?.amountInSrcToken.rawAmount ?? 0n),
            BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo
        );
        return {
            amountInSrcToken,
            amountInDstToken: toTokenAmount(
                swapFee.amountInDstToken.rawAmount + watchtowerFee.amountInDstToken.rawAmount + (networkInputFee?.amountInDstToken.rawAmount ?? 0n),
                this.getOutputToken(), this.wrapper._prices, this.pricingInfo
            ),
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
    getFeeBreakdown(): [
        {type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>},
        {type: FeeType.NETWORK_OUTPUT, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>}
    ] | [
        {type: FeeType.NETWORK_INPUT, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>},
        {type: FeeType.SWAP, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>},
        {type: FeeType.NETWORK_OUTPUT, fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>}
    ] {
        const baseBreakdown = super._getFeeBreakdown();
        const networkInputFee = this.getNetworkInputFee();
        if(networkInputFee == null) return baseBreakdown;

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
    private getMatchingExternalDepositUtxo(rehydratedWalletUtxos: BitcoinWalletUtxo[], ignoredUtxoKeys?: Set<string>): ExternalDepositMatchResult {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getMatchingExternalDepositUtxo()");
        if(info.requiredDeposit == null) return {
            matchedUtxo: null,
            invalidUtxos: []
        };
        const requiredDepositInfo = info.requiredDeposit;

        const rehydratedWalletUtxosMap = toUtxoMap(rehydratedWalletUtxos);
        const rehydratedSelectedUtxos: SpvExternalSelectedUtxo[] = info.selectedExistingUtxos.map(
            utxo => rehydratedWalletUtxosMap.get(getUtxoKey(utxo)) ?? utxo
        );
        const selectedUtxosKeys = toUtxoSet(info.selectedExistingUtxos);

        const invalidUtxos: ExternalDepositInvalidUtxo[] = [];
        for(const utxo of rehydratedWalletUtxos) {
            //Only check UTXOs at the expected address
            if(utxo.address!==requiredDepositInfo.address) continue;

            const key = getUtxoKey(utxo);
            if(selectedUtxosKeys.has(key) || ignoredUtxoKeys?.has(key)) continue;

            const actualAmount = BigInt(utxo.value);
            if(actualAmount < requiredDepositInfo.amount) {
                invalidUtxos.push({
                    key,
                    utxo,
                    reason: "amount_too_small",
                    requiredAmount: requiredDepositInfo.amount,
                    actualAmount
                });
                continue;
            }
            if(actualAmount > requiredDepositInfo.amount) {
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
            if(effectiveFeeRate >= this.minimumBtcFeeRate) return {
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
    private getRehydratedSelectedExistingUtxos(rehydratedWalletUtxos: BitcoinWalletUtxo[]): BitcoinWalletUtxo[] {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getRehydratedSelectedExistingUtxos()");
        const rehydratedWalletUtxosMap = toUtxoMap(rehydratedWalletUtxos);

        return info.selectedExistingUtxos.map(selectedUtxo => {
            const freshUtxo = rehydratedWalletUtxosMap.get(`${selectedUtxo.txId}:${selectedUtxo.vout}`);
            if(freshUtxo == null) {
                throw new Error(`Selected external funding UTXO ${selectedUtxo.txId}:${selectedUtxo.vout} no longer exists; please re-quote`);
            }
            if(freshUtxo.value !== selectedUtxo.value || freshUtxo.type !== selectedUtxo.type) {
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
    private async getIntermediateWalletUtxos(
        _intermediateWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface
    ): Promise<BitcoinWalletUtxo[]> {
        if(_intermediateWallet != null) {
            const intermediateWallet = toBitcoinWallet(
                _intermediateWallet,
                this.wrapper._btcRpc,
                this.wrapper._options.bitcoinNetwork
            );
            return await intermediateWallet.getUtxoPool();
        }

        const info = this.getIntermediateWalletSwapModeInfoOrThrow("getIntermediateWalletUtxos()");
        const network = this.wrapper._options.bitcoinNetwork;
        const addresses = new Map<string, {publicKey: string, addressType: CoinselectAddressTypes}>();

        for(const utxo of info.selectedExistingUtxos) {
            const address = fromOutputScript(network, utxo.outputScript.toString("hex"));
            addresses.set(address, {
                publicKey: utxo.publicKey,
                addressType: utxo.type
            });
        }
        if(info.requiredDeposit != null) addresses.set(info.requiredDeposit.address, {
            publicKey: info.requiredDeposit.publicKey,
            addressType: info.walletAddressType
        });

        return (await Promise.all(Array.from(addresses, ([address, addressInfo]) => getWalletAddressUtxos(
            this.wrapper._btcRpc,
            network,
            address,
            addressInfo.publicKey,
            addressInfo.addressType
        )))).flat();
    }

    async getFundedPsbt(
        _bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface,
        feeRate?: number,
        additionalOutputs?: ({
            amount: bigint;
            outputScript: Uint8Array
        } | { amount: bigint; address: string })[],
        utxos?: BitcoinWalletUtxo[],
        spendFully?: boolean
    ): Promise<{
        psbt: Transaction;
        psbtHex: string;
        psbtBase64: string;
        signInputs: number[];
        feeRate: number
    }> {
        if(this.swapMode==="psbt") return await super.getFundedPsbt(_bitcoinWallet, feeRate, additionalOutputs, utxos, spendFully);
        if(feeRate!=null) throw new Error("Manual fee rate is not supported in the intermediate wallet mode!");
        if(additionalOutputs!=null) throw new Error("Additional outputs are not supported in the intermediate wallet mode!");
        if(spendFully!=null) throw new Error("Spend fully flag is not supported in the intermediate wallet mode!");

        const bitcoinWallet = toBitcoinWallet(_bitcoinWallet, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        const rehydratedWalletUtxos = utxos ?? await bitcoinWallet.getUtxoPool();
        const selectedRehydratedUtxos = this.getRehydratedSelectedExistingUtxos(rehydratedWalletUtxos);

        //Add external funding if required
        if(this.externalSwapModeInfo?.requiredDeposit!=null) {
            const result = this.getMatchingExternalDepositUtxo(rehydratedWalletUtxos);
            if(result.matchedUtxo==null)
                throw new Error(`Expected external funding of ${this.externalSwapModeInfo.requiredDeposit.amount.toString(10)} sats, not found in the wallet!`);
            await this.setExternalDepositTxId(result.matchedUtxo.txId);
            selectedRehydratedUtxos.push(result.matchedUtxo);
        }

        const {psbt, in1sequence} = this.getPsbt();
        await addPsbtInputs(psbt, selectedRehydratedUtxos, this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork);
        psbt.updateInput(1, {sequence: in1sequence});

        //Add change output if required
        if(this.externalSwapModeInfo?.changeAmount!=null) {
            if(bitcoinWallet.getChangeAddress==null) throw new Error("Intermediate bitcoin wallet has to support getChangeAddress() fn!");
            const changeAddress = bitcoinWallet.getChangeAddress();
            if(this.externalSwapModeInfo.walletAddressType!==identifyAddressType(changeAddress, this.wrapper._options.bitcoinNetwork))
                throw new Error(`Wallet returned an invalid change address type, expected: ${this.externalSwapModeInfo.walletAddressType}`);
            psbt.addOutput({
                amount: this.externalSwapModeInfo.changeAmount,
                script: toOutputScript(this.wrapper._options.bitcoinNetwork, changeAddress)
            });
        }

        const {effectiveFeeRate} = this.getFinalizedCoinselect(
            selectedRehydratedUtxos,
            this.externalSwapModeInfo?.changeAmount==null
                ? []
                : [{value: Number(this.externalSwapModeInfo.changeAmount), type: this.externalSwapModeInfo.walletAddressType}]
        );
        if(effectiveFeeRate==null) throw new Error("Not enough balance to create the swap PSBT!");
        if(effectiveFeeRate<this.minimumBtcFeeRate) throw new Error("PSBT effective fee rate is below minimum required by the LP!");

        //Sign every input except the first one
        const signInputs: number[] = [];
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
     * Waits until the external deposit address receives the exact future UTXO required by this quote.
     *
     * @param _intermediateWallet Optional wallet used to fetch UTXOs; the configured Bitcoin RPC is used when omitted
     * @param maxWaitTimeSeconds Optional maximum wait time before aborting
     * @param pollIntervalSeconds Optional polling interval; defaults to five seconds
     * @param onInvalidDeposit Optional callback invoked with all newly detected invalid UTXOs; return falsish to stop waiting
     * @param abortSignal Optional external abort signal
     * @returns External deposit wait status
     * @throws {Error} if the swap is not in external mode or no additional deposit is required
     */
    async waitForExternalDeposit(
        _intermediateWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface,
        maxWaitTimeSeconds?: number,
        pollIntervalSeconds?: number,
        onInvalidDeposit?: (invalidUtxos: ExternalDepositInvalidUtxo[]) => boolean | void | Promise<boolean | void>,
        abortSignal?: AbortSignal
    ): Promise<BitcoinWalletUtxo> {
        const info = this.getIntermediateWalletSwapModeInfoOrThrow("waitForExternalDeposit()");
        if(info.requiredDeposit == null) {
            throw new Error("No external deposit required for this SPV swap");
        }

        const abortController = extendAbortController(
            abortSignal,
            maxWaitTimeSeconds,
            "Timed out waiting for external Bitcoin deposit"
        );
        const ignoredUtxoKeys = new Set<string>();
        try {
            while(this._state !== SpvFromBTCSwapState.QUOTE_EXPIRED && await this._verifyQuoteValid()) {
                const walletUtxos = await this.getIntermediateWalletUtxos(_intermediateWallet);

                this.getRehydratedSelectedExistingUtxos(walletUtxos);
                const matchResult = this.getMatchingExternalDepositUtxo(walletUtxos, ignoredUtxoKeys);
                if(matchResult.matchedUtxo != null) {
                    await this.setExternalDepositTxId(matchResult.matchedUtxo.txId);
                    return matchResult.matchedUtxo;
                }
                if(matchResult.invalidUtxos.length > 0) {
                    if(onInvalidDeposit == null || !await onInvalidDeposit(matchResult.invalidUtxos))
                        throw new Error("Invalid Bitcoin amount deposited, please re-quote!");
                    matchResult.invalidUtxos.forEach(invalidUtxo => {
                        if(invalidUtxo.reason!=="deposit_fee_too_low") ignoredUtxoKeys.add(invalidUtxo.key);
                    });
                }

                const sleepTime = Math.min((pollIntervalSeconds ?? 5) * 1000, this.expiry - Date.now());
                if(sleepTime <= 0) break;
                await timeoutPromise(sleepTime, abortController.signal);
            }

            throw new Error("Quote expired while waiting for external deposit!");
        } catch (e) {
            throw e;
        } finally {
            abortController.abort();
        }
    }

    /**
     * Signs and submits the SPV funding PSBT from the external intermediate deposit wallet.
     *
     * @remarks
     * This processes only the Bitcoin deposit transaction. It does not wait for Bitcoin confirmations or destination
     * settlement; use the normal swap lifecycle actions after this returns. Full-spend external mode consumes the
     * funding set without change, while change-aware mode allows wallet change from the selected UTXOs.
     *
     * @param wallet Intermediate Bitcoin wallet able to sign the funded PSBT
     * @returns Bitcoin transaction id returned by {@link submitPsbt}
     * @throws {Error} if the swap is not in external mode, the required deposit is missing, or the quote expired
     */
    async processViaIntermediateWallet(
        wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner
    ): Promise<string> {
        if(!await this._verifyQuoteValid()) throw new Error("Swap quote expired!");
        if(this.swapMode!=="intermediate_wallet") throw new Error("Only available in intermediate wallet swap mode!");
        const {psbt, psbtBase64, psbtHex, signInputs} = await this.getFundedPsbt(wallet);
        const signedPsbt = isIBitcoinWallet(wallet)
            ? await wallet.signPsbt(psbt, signInputs)
            : await wallet.signPsbt({psbt, psbtHex, psbtBase64}, signInputs);
        return await this.submitPsbt(signedPsbt);
    }

    /**
     * Builds an address action for the future external deposit UTXO.
     *
     * @returns Send-to-address action that waits only for the matching UTXO to appear
     * @throws {Error} if the swap is not in external mode
     */
    private async _buildExternalDepositAddressAction(
        bitcoinWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface,
        options?: {
            bitcoinWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface
        }
    ): Promise<SwapExecutionActionSendToAddress<false>> {
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
                amount: toTokenAmount(
                    info.requiredDeposit!.amount,
                    BitcoinTokens.BTC,
                    this.wrapper._prices,
                    this.pricingInfo
                )
            }],
            waitForTransactions: async (
                maxWaitTimeSeconds?: number, pollIntervalSeconds?: number, abortSignal?: AbortSignal
            ) => {
                const waitStatus = await this.waitForExternalDeposit(
                    options?.bitcoinWallet ?? bitcoinWallet,
                    maxWaitTimeSeconds,
                    pollIntervalSeconds,
                    () => true,
                    abortSignal
                );
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
    private async _buildExternalDepositPsbtAction(
        rehydratedWalletUtxos: BitcoinWalletUtxo[],
        bitcoinWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface,
        options?: {
            bitcoinWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface
        }
    ): Promise<SwapExecutionActionSignPSBT<"FUNDED_PSBT">> {
        const _bitcoinWallet = options?.bitcoinWallet ?? bitcoinWallet;
        if(_bitcoinWallet==null) throw new Error("Bitcoin wallet is required to construct a swap PSBT!");
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
            submitPsbt: async (signedPsbt: string | Transaction | (string | Transaction)[], idempotent?: boolean) => {
                return this._submitExecutionTransactions(
                    Array.isArray(signedPsbt) ? signedPsbt : [signedPsbt],
                    undefined,
                    [SpvFromBTCSwapState.CREATED, SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED],
                    idempotent
                );
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
    protected async _getExecutionStatus(options?: {
        bitcoinFeeRate?: number,
        bitcoinWallet?: MinimalBitcoinWalletInterface | IBitcoinWallet,
        manualSettlementSmartChainSigner?: string | T["Signer"] | T["NativeSigner"],
        maxWaitTillAutomaticSettlementSeconds?: number
    }) {
        const executionStatus = await super._getExecutionStatus(options);
        if(this.swapMode !== "intermediate_wallet") return executionStatus;

        let buildCurrentAction = executionStatus.buildCurrentAction;
        let matchedNewUtxo: BitcoinWalletUtxo | undefined;
        if(
            executionStatus.state === SpvFromBTCSwapState.CREATED &&
            await this._verifyQuoteValid()
        ) {
            const rehydratedWalletUtxos = await this.getIntermediateWalletUtxos(options?.bitcoinWallet);
            this.getRehydratedSelectedExistingUtxos(rehydratedWalletUtxos);

            if(this.externalSwapModeInfo?.requiredDeposit!=null) {
                matchedNewUtxo = this.getMatchingExternalDepositUtxo(rehydratedWalletUtxos).matchedUtxo ?? undefined;
                if(matchedNewUtxo!=null) {
                    await this.setExternalDepositTxId(matchedNewUtxo?.txId);
                    buildCurrentAction = this._buildExternalDepositPsbtAction.bind(this, rehydratedWalletUtxos, options?.bitcoinWallet);
                } else {
                    buildCurrentAction = this._buildExternalDepositAddressAction.bind(this, options?.bitcoinWallet)
                }
            } else {
                buildCurrentAction = this._buildExternalDepositPsbtAction.bind(this, rehydratedWalletUtxos, options?.bitcoinWallet);
            }
        }

        const steps = executionStatus.steps;
        const externalPaymentStep: SwapExecutionStepPayment<"BITCOIN"> = {
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
            ] as [
                SwapExecutionStepPayment<"BITCOIN">,
                SwapExecutionStepSettlement<T["ChainId"], "awaiting_automatic" | "awaiting_manual">
            ],
            buildCurrentAction
        };
    }

    /**
     * @inheritDoc
     */
    async getExecutionSteps(options?: {
        maxWaitTillAutomaticSettlementSeconds?: number,
        bitcoinWallet?: MinimalBitcoinWalletInterface | IBitcoinWallet
    }): Promise<[
        SwapExecutionStepPayment<"BITCOIN">,
        SwapExecutionStepSettlement<T["ChainId"], "awaiting_automatic" | "awaiting_manual">
    ]> {
        return (await this._getExecutionStatus(options)).steps;
    }

}
