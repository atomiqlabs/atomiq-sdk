import {ChainType} from "@atomiqlabs/base";
import {REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE, SpvFromBTCWrapper} from "./SpvFromBTCWrapper.js";
import {extendAbortController} from "../../utils/Utils.js";
import {getWalletAddressUtxos, toCoinselectAddressType} from "../../utils/BitcoinUtils.js";
import {Transaction} from "@scure/btc-signer";
import {Buffer} from "buffer";
import {
    BitcoinWalletUtxo,
    BitcoinWalletUtxoBase,
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
import {CoinselectAddressTypes, utils} from "../../bitcoin/coinselect2/utils.js";
import {isSpvFromBTCSwapInit, SpvFromBTCSwapBase, SpvFromBTCSwapInit, SpvFromBTCSwapState} from "./SpvFromBTCSwapBase.js";
import {Fee} from "../../types/fees/Fee.js";

/**
 * Runtime mode for an SPV BTC -> smart-chain swap.
 *
 * `"psbt"` preserves the normal wallet-funded PSBT flow. `"external"` represents an intermediate-wallet flow where
 * callers deposit one future UTXO to a configured Bitcoin address before signing the fully funded SPV PSBT.
 */
export type SpvFromBTCSwapMode = "psbt" | "external";

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
 * memory, but {@link SpvFromBTCSwap.serialize} persists only {@link SpvExternalSelectedUtxo} fields.
 */
export type SpvFromBTCExternalSwapModeInfo = {
    /**
     * Bitcoin address controlled by the intermediate wallet.
     */
    depositAddress: string;
    /**
     * Coin selection address type inferred from `depositAddress`.
     */
    depositAddressType: CoinselectAddressTypes;
    /**
     * Existing UTXOs selected for the external quote. V1 selects every current UTXO for `depositAddress`.
     */
    selectedExistingUtxos: SpvExternalSelectedUtxo[];
    /**
     * Bitcoin fee rate in sats/vB used for the final fully-spent funding transaction.
     */
    feeRate: number;
    /**
     * CPFP package-fee assumptions for the future incoming deposit UTXO.
     */
    cpfpAssumptions: {
        txVsize: number;
        txEffectiveFeeRate: number;
    };
    /**
     * Satoshis still required as one future UTXO at `depositAddress`.
     */
    requiredAdditionalUtxoAmount: bigint;
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
    private externalSwapModeInfo: SpvFromBTCExternalSwapModeInfo | null = null;
    private externalDepositTxId?: string;

    constructor(wrapper: SpvFromBTCWrapper<T>, init: SpvFromBTCSwapInit);
    constructor(wrapper: SpvFromBTCWrapper<T>, obj: any);
    constructor(wrapper: SpvFromBTCWrapper<T>, initOrObject: SpvFromBTCSwapInit | any) {
        super(wrapper, initOrObject);

        if(!isSpvFromBTCSwapInit(initOrObject)) {
            const info = initOrObject.externalSwapModeInfo;
            if(initOrObject.swapMode === "external" && info != null) {
                this.swapMode = "external";
                this.externalSwapModeInfo = {
                    depositAddress: info.depositAddress,
                    depositAddressType: info.depositAddressType,
                    selectedExistingUtxos: info.selectedExistingUtxos,
                    feeRate: info.feeRate,
                    cpfpAssumptions: {
                        txVsize: info.cpfpAssumptions.txVsize,
                        txEffectiveFeeRate: info.cpfpAssumptions.txEffectiveFeeRate
                    },
                    requiredAdditionalUtxoAmount: BigInt(info.requiredAdditionalUtxoAmount),
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
        const externalSwapModeInfo = this.swapMode === "external" && this.externalSwapModeInfo != null
            ? {
                ...this.externalSwapModeInfo,
                selectedExistingUtxos: this.externalSwapModeInfo.selectedExistingUtxos.map(utxo => ({
                    txId: utxo.txId,
                    vout: utxo.vout,
                    value: utxo.value,
                    type: utxo.type,
                    cpfp: utxo.cpfp == null ? undefined : {
                        txVsize: utxo.cpfp.txVsize,
                        txEffectiveFeeRate: utxo.cpfp.txEffectiveFeeRate
                    }
                })),
                requiredAdditionalUtxoAmount: this.externalSwapModeInfo.requiredAdditionalUtxoAmount.toString(10),
                totalNetworkFee: this.externalSwapModeInfo.totalNetworkFee.toString(10)
            }
            : null;

        return {
            ...super.serialize(),
            swapMode: this.swapMode,
            externalSwapModeInfo,
            externalDepositTxId: this.swapMode === "external" ? this.externalDepositTxId : undefined
        };
    }

    /**
     * Returns the active SPV funding mode.
     *
     * @returns `"psbt"` for the normal wallet-funded PSBT flow or `"external"` for intermediate-wallet deposit mode
     */
    getSwapMode(): SpvFromBTCSwapMode {
        return this.swapMode;
    }

    /**
     * Returns cached external deposit mode metadata when the swap is in external mode.
     *
     * @returns External deposit metadata, or `null` in PSBT mode
     */
    getExternalSwapModeInfo(): SpvFromBTCExternalSwapModeInfo | null {
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
        this.swapMode = "psbt";
        this.externalSwapModeInfo = null;
        this.externalDepositTxId = undefined;
        if(this._persisted) await this._save();
    }

    /**
     * Configures this SPV quote for an external intermediate-wallet deposit flow.
     *
     * @param walletOrAddress Intermediate Bitcoin wallet or deposit address. Wallets provide the receive address via
     * `getReceiveAddress()` and, when `existingUtxos` is omitted, must support `getUtxoPool()`.
     * @param existingUtxos Optional quote-time UTXO set for `walletOrAddress`; when passed, the objects are kept in
     * memory as-is and only narrowed during serialization.
     * @param feeRate Optional Bitcoin fee rate in sats/vB; normalized to at least this quote's minimum LP fee rate.
     * @param cpfpAssumptions CPFP metadata for the future incoming UTXO; defaults to a conservative small package.
     * @returns Cached external mode metadata containing the deposit address, selected UTXOs and required deposit amount
     * @throws {Error} if a wallet cannot expose UTXOs and `existingUtxos` is omitted
     */
    async setSwapModeExternal(
        walletOrAddress: IBitcoinWallet | string,
        existingUtxos?: BitcoinWalletUtxo[],
        feeRate?: number,
        cpfpAssumptions?: {
            txVsize: number,
            txEffectiveFeeRate: number
        }
    ): Promise<SpvFromBTCExternalSwapModeInfo> {
        const depositAddress = typeof walletOrAddress === "string"
            ? walletOrAddress
            : walletOrAddress.getReceiveAddress();

        const depositAddressType = toCoinselectAddressType(this.wrapper._options.bitcoinNetwork, depositAddress);

        const selectedExistingUtxos = existingUtxos ?? (
            typeof walletOrAddress === "string"
                ? await getWalletAddressUtxos(this.wrapper._btcRpc, this.wrapper._options.bitcoinNetwork, depositAddress, depositAddressType)
                : await (async () => {
                    if(typeof(walletOrAddress.getUtxoPool) !== "function") {
                        throw new Error("External SPV deposit mode requires a Bitcoin wallet with getUtxoPool() support or explicit existingUtxos");
                    }
                    return walletOrAddress.getUtxoPool();
                })()
        );
        const resolvedFeeRate = Math.max(feeRate ?? this.minimumBtcFeeRate, this.minimumBtcFeeRate);
        const resolvedCpfpAssumptions = cpfpAssumptions ?? {
            txEffectiveFeeRate: 1,
            txVsize: 200
        };
        const estimation = this.getInputUtxoAmount(
            selectedExistingUtxos,
            depositAddressType,
            resolvedFeeRate,
            resolvedCpfpAssumptions
        );

        const info: SpvFromBTCExternalSwapModeInfo = {
            depositAddress,
            depositAddressType,
            selectedExistingUtxos,
            feeRate: resolvedFeeRate,
            cpfpAssumptions: resolvedCpfpAssumptions,
            requiredAdditionalUtxoAmount: estimation.requiredAdditionalUtxoAmount.rawAmount,
            totalNetworkFee: estimation.totalNetworkFee.rawAmount
        };
        this.swapMode = "external";
        this.externalSwapModeInfo = info;
        this.externalDepositTxId = undefined;
        if(this._persisted) await this._save();
        return info;
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
    private getExternalSwapModeInfoOrThrow(operation: string): SpvFromBTCExternalSwapModeInfo {
        if(this.swapMode !== "external" || this.externalSwapModeInfo == null) {
            throw new Error(`${operation} requires SPV external deposit mode`);
        }
        return this.externalSwapModeInfo;
    }

    /**
     * Checks whether this swap currently exposes address-swap behavior.
     *
     * @returns `true` only in external deposit mode
     */
    isAddressSwapMode(): boolean {
        return this.swapMode === "external";
    }

    /**
     * Returns the intermediate Bitcoin deposit address for external mode.
     *
     * @returns Bitcoin address that should receive the additional future UTXO
     * @throws {Error} if the swap is in PSBT mode
     */
    getAddress(): string {
        return this.getExternalSwapModeInfoOrThrow("getAddress()").depositAddress;
    }

    /**
     * Returns a BIP-21 Bitcoin URI for the external deposit address and required additional UTXO amount.
     *
     * @returns Bitcoin payment URI for QR-code display
     * @throws {Error} if the swap is in PSBT mode
     */
    getHyperlink(): string {
        const info = this.getExternalSwapModeInfoOrThrow("getHyperlink()");
        return "bitcoin:" + info.depositAddress + "?amount=" + encodeURIComponent((Number(info.requiredAdditionalUtxoAmount) / 100000000).toString(10));
    }

    /**
     * Returns the user-facing BTC input amount.
     *
     * @remarks
     * PSBT mode returns the base SPV quote input. External mode includes the input-side Bitcoin network fee cached
     * during {@link setSwapModeExternal}.
     *
     * @returns Input BTC amount in satoshis wrapped as a token amount
     */
    getInput(): TokenAmount<BtcToken<false>, true> {
        if(this.swapMode !== "external" || this.externalSwapModeInfo == null) return super.getInput();
        return toTokenAmount(
            super.getInput().rawAmount + this.externalSwapModeInfo.totalNetworkFee,
            BitcoinTokens.BTC,
            this.wrapper._prices,
            this.pricingInfo
        );
    }

    /**
     * Returns the network fee to be paid on the input/source network
     *
     * @internal
     */
    protected getNetworkInputFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> | null {
        if(this.swapMode !== "external" || this.externalSwapModeInfo == null) return null;

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
     * @returns Matching fresh wallet UTXO, or `null` when it has not arrived yet
     * @throws {Error} if the swap is not in external mode
     */
    private async getMatchingExternalDepositUtxo(): Promise<BitcoinWalletUtxo | null> {
        const info = this.getExternalSwapModeInfoOrThrow("getMatchingExternalDepositUtxo()");
        const requiredAdditionalUtxoAmount = info.requiredAdditionalUtxoAmount;
        if(requiredAdditionalUtxoAmount === 0n) return null;

        const selectedKeys = new Set(info.selectedExistingUtxos.map(utxo => `${utxo.txId}:${utxo.vout}`));
        const currentUtxos = await getWalletAddressUtxos(
            this.wrapper._btcRpc,
            this.wrapper._options.bitcoinNetwork,
            info.depositAddress,
            info.depositAddressType
        );
        return currentUtxos.find(utxo =>
            !selectedKeys.has(`${utxo.txId}:${utxo.vout}`) &&
            BigInt(utxo.value) === requiredAdditionalUtxoAmount
        ) ?? null;
    }

    /**
     * Rehydrates quote-selected external funding UTXOs with fresh signing data while preserving quote-time fee data.
     *
     * @param matchedNewUtxo Optional already-detected future deposit UTXO
     * @returns Exact UTXO set to pass to wallet funding with `spendFully: true`
     * @throws {Error} if a selected UTXO disappeared, changed value/type, or the required new deposit is missing
     */
    private async rehydrateExternalFundingUtxos(matchedNewUtxo?: BitcoinWalletUtxo): Promise<BitcoinWalletUtxo[]> {
        const info = this.getExternalSwapModeInfoOrThrow("rehydrateExternalFundingUtxos()");
        const currentUtxos = await getWalletAddressUtxos(
            this.wrapper._btcRpc,
            this.wrapper._options.bitcoinNetwork,
            info.depositAddress,
            info.depositAddressType
        );
        const currentUtxosByKey = new Map(currentUtxos.map(utxo => [`${utxo.txId}:${utxo.vout}`, utxo]));

        const executionUtxos = info.selectedExistingUtxos.map(selectedUtxo => {
            const freshUtxo = currentUtxosByKey.get(`${selectedUtxo.txId}:${selectedUtxo.vout}`);
            if(freshUtxo == null) {
                throw new Error(`Selected external funding UTXO ${selectedUtxo.txId}:${selectedUtxo.vout} no longer exists; please re-quote`);
            }
            if(freshUtxo.value !== selectedUtxo.value || freshUtxo.type !== selectedUtxo.type) {
                throw new Error(`Selected external funding UTXO ${selectedUtxo.txId}:${selectedUtxo.vout} changed; please re-quote`);
            }
            return {
                ...freshUtxo,
                value: selectedUtxo.value,
                type: selectedUtxo.type,
                cpfp: selectedUtxo.cpfp
            };
        });

        const requiredAdditionalUtxoAmount = info.requiredAdditionalUtxoAmount;
        if(requiredAdditionalUtxoAmount === 0n) return executionUtxos;

        matchedNewUtxo ??= await this.getMatchingExternalDepositUtxo() ?? undefined;
        if(matchedNewUtxo == null) {
            throw new Error("Required external deposit UTXO not found; wait for the deposit before processing");
        }
        const matchedKey = `${matchedNewUtxo.txId}:${matchedNewUtxo.vout}`;
        const freshMatchedUtxo = currentUtxosByKey.get(matchedKey);
        if(freshMatchedUtxo == null) {
            throw new Error(`External deposit UTXO ${matchedKey} no longer exists; please re-check the deposit`);
        }
        if(BigInt(freshMatchedUtxo.value) !== requiredAdditionalUtxoAmount) {
            throw new Error(`External deposit UTXO ${matchedKey} does not match the quoted required amount`);
        }
        executionUtxos.push({
            ...freshMatchedUtxo,
            cpfp: {
                txVsize: info.cpfpAssumptions.txVsize,
                txEffectiveFeeRate: info.cpfpAssumptions.txEffectiveFeeRate
            }
        });
        return executionUtxos;
    }

    /**
     * Waits until the external deposit address receives the exact future UTXO required by this quote.
     *
     * @param maxWaitTimeSeconds Optional maximum wait time before aborting
     * @param pollIntervalSeconds Optional polling interval; defaults to five seconds
     * @param abortSignal Optional external abort signal
     * @returns Fresh wallet UTXO matching `requiredAdditionalUtxoAmount`
     * @throws {Error} if the swap is not in external mode or no additional deposit is required
     */
    async waitForExternalDeposit(
        maxWaitTimeSeconds?: number,
        pollIntervalSeconds?: number,
        abortSignal?: AbortSignal
    ): Promise<BitcoinWalletUtxo> {
        const info = this.getExternalSwapModeInfoOrThrow("waitForExternalDeposit()");
        if(info.requiredAdditionalUtxoAmount === 0n) {
            throw new Error("No external deposit required for this SPV swap");
        }

        const abortController = extendAbortController(
            abortSignal,
            maxWaitTimeSeconds,
            "Timed out waiting for external Bitcoin deposit"
        );
        try {
            while(true) {
                const matchedUtxo = await this.getMatchingExternalDepositUtxo();
                if(matchedUtxo != null) {
                    await this.setExternalDepositTxId(matchedUtxo.txId);
                    abortController.abort();
                    return matchedUtxo;
                }
                await timeoutPromise((pollIntervalSeconds ?? 5) * 1000, abortController.signal);
            }
        } catch (e) {
            abortController.abort();
            throw e;
        }
    }

    /**
     * Signs and submits the SPV funding PSBT from the external intermediate deposit wallet.
     *
     * @remarks
     * This processes only the Bitcoin deposit transaction. It does not wait for Bitcoin confirmations or destination
     * settlement; use the normal swap lifecycle actions after this returns. The funding set is spent fully without a
     * change output.
     *
     * @param wallet Intermediate Bitcoin wallet able to sign the funded PSBT
     * @param matchedNewUtxo Optional already-detected future deposit UTXO
     * @param options.abortSignal Optional abort signal used while waiting for the future deposit when omitted
     * @returns Bitcoin transaction id returned by {@link submitPsbt}
     * @throws {Error} if the swap is not in external mode, the required deposit is missing, or the quote expired
     */
    async processExternalDeposit(
        wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner,
        matchedNewUtxo?: BitcoinWalletUtxo,
        options?: {
            abortSignal?: AbortSignal
        }
    ): Promise<string> {
        const info = this.getExternalSwapModeInfoOrThrow("processExternalDeposit()");
        matchedNewUtxo ??= (
            info.requiredAdditionalUtxoAmount === 0n
                ? undefined
                : await this.waitForExternalDeposit(undefined, undefined, options?.abortSignal)
        );
        const utxos = await this.rehydrateExternalFundingUtxos(matchedNewUtxo);
        await this.setExternalDepositTxId(matchedNewUtxo?.txId);
        const {psbt, psbtBase64, psbtHex, signInputs} = await this.getFundedPsbt(
            wallet,
            info.feeRate,
            undefined,
            utxos,
            true
        );
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
    private async _buildExternalDepositAddressAction(): Promise<SwapExecutionActionSendToAddress<false>> {
        const info = this.getExternalSwapModeInfoOrThrow("_buildExternalDepositAddressAction()");
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
                    info.requiredAdditionalUtxoAmount,
                    BitcoinTokens.BTC,
                    this.wrapper._prices,
                    this.pricingInfo
                )
            }],
            waitForTransactions: async (
                maxWaitTimeSeconds?: number, pollIntervalSeconds?: number, abortSignal?: AbortSignal
            ) => {
                const utxo = await this.waitForExternalDeposit(maxWaitTimeSeconds, pollIntervalSeconds, abortSignal);
                return utxo.txId;
            }
        };
    }

    /**
     * Builds a funded PSBT action for signing with the external intermediate deposit wallet.
     *
     * @param matchedNewUtxo Optional already-detected future deposit UTXO
     * @param actionOptions Action options containing the intermediate Bitcoin wallet public data
     * @returns Funded PSBT action using the quote-stable external funding set
     * @throws {Error} if `bitcoinWallet` is missing while external mode is ready for PSBT signing
     */
    private async _buildExternalDepositPsbtAction(
        matchedNewUtxo: BitcoinWalletUtxo | undefined,
        actionOptions?: {
            bitcoinFeeRate?: number,
            bitcoinWallet?: MinimalBitcoinWalletInterface
        }
    ): Promise<SwapExecutionActionSignPSBT<"FUNDED_PSBT">> {
        const info = this.getExternalSwapModeInfoOrThrow("_buildExternalDepositPsbtAction()");
        if(actionOptions?.bitcoinWallet == null) {
            throw new Error("External SPV deposit mode requires options.bitcoinWallet to build the funded PSBT");
        }
        return {
            type: "SignPSBT",
            name: "Deposit on Bitcoin",
            description: "Sign and submit the Bitcoin swap transaction from the intermediate deposit wallet",
            chain: "BITCOIN",
            txs: [{
                ...await this.getFundedPsbt(
                    actionOptions.bitcoinWallet,
                    info.feeRate,
                    undefined,
                    await this.rehydrateExternalFundingUtxos(matchedNewUtxo),
                    true
                ),
                type: "FUNDED_PSBT"
            }],
            submitPsbt: async (signedPsbt: string | Transaction | (string | Transaction)[], idempotent?: boolean) => {
                await this.setExternalDepositTxId(matchedNewUtxo?.txId);
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
        bitcoinWallet?: MinimalBitcoinWalletInterface,
        manualSettlementSmartChainSigner?: string | T["Signer"] | T["NativeSigner"],
        maxWaitTillAutomaticSettlementSeconds?: number
    }) {
        const executionStatus = await super._getExecutionStatus(options);
        if(
            this.swapMode !== "external" ||
            this.externalSwapModeInfo == null
        ) {
            return executionStatus;
        }

        let buildCurrentAction = executionStatus.buildCurrentAction;
        let matchedNewUtxo: BitcoinWalletUtxo | undefined;
        if(
            executionStatus.state === SpvFromBTCSwapState.CREATED &&
            await this._verifyQuoteValid()
        ) {
            matchedNewUtxo = this.externalSwapModeInfo.requiredAdditionalUtxoAmount === 0n
                ? undefined
                : await this.getMatchingExternalDepositUtxo() ?? undefined;
            await this.setExternalDepositTxId(matchedNewUtxo?.txId);
            buildCurrentAction = this.externalSwapModeInfo.requiredAdditionalUtxoAmount !== 0n && matchedNewUtxo == null
                ? this._buildExternalDepositAddressAction.bind(this)
                : this._buildExternalDepositPsbtAction.bind(this, matchedNewUtxo ?? undefined);
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
     * Estimates the additional future UTXO needed to spend the external deposit wallet's selected funding set.
     *
     * @remarks
     * External mode spends every UTXO supplied in `existingUtxos`, including inputs that increase the effective
     * network fee. The returned `requiredAdditionalUtxoAmount` is the value a caller should deposit as one future
     * UTXO; when existing UTXOs already cover the quote and Bitcoin network fee it is zero.
     *
     * @param existingUtxos Existing deposit-address UTXOs selected for the quote, including unconfirmed CPFP data
     * @param addressType Address type for the future incoming UTXO
     * @param feeRate Bitcoin fee rate in sats/vB used for the final funding transaction
     * @param cpfpAssumptions Optional CPFP package-fee model for the future incoming UTXO
     * @returns Required total BTC input, current selected balance, network fee, required future UTXO, and excess balance
     */
    getInputUtxoAmount(
        existingUtxos: BitcoinWalletUtxoBase[],
        addressType: CoinselectAddressTypes,
        feeRate: number,
        cpfpAssumptions?: {
            txVsize: number,
            txEffectiveFeeRate: number
        }
    ): {
        totalRequiredInputAmount: TokenAmount<BtcToken<false>, true>,
        existingBalance: TokenAmount<BtcToken<false>, true>,
        totalNetworkFee: TokenAmount<BtcToken<false>, true>,
        requiredAdditionalUtxoAmount: TokenAmount<BtcToken<false>, true>,
        excessExistingBalance: TokenAmount<BtcToken<false>, true>
    } {
        let cpfpFeeSum = existingUtxos.reduce((prev, current) => prev + utils.inputCpfpAdditionalFee(current, feeRate), 0);
        const existingUtxoBalance = BigInt(existingUtxos.reduce((prev, current) => prev + current.value, 0));

        const txDetails = this.getTransactionDetails();
        const requiredSendAmount = super.getInput().rawAmount;

        let txSize = utils.transactionBytes(
            [
                {type: REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE},
                ...existingUtxos
            ],
            [
                {script: Buffer.from(txDetails.vaultScript)},
                {script: Buffer.from(txDetails.out1script)},
                {script: Buffer.from(txDetails.out2script)},
            ]
        );

        let requiredFee = BigInt(Math.ceil((txSize * feeRate) + cpfpFeeSum));
        let totalRequiredInputAmount = requiredSendAmount + requiredFee;
        let additionalUtxoAmount = totalRequiredInputAmount - existingUtxoBalance;
        let excessExistingBalance = 0n;
        if(additionalUtxoAmount <= 0n) {
            excessExistingBalance = -additionalUtxoAmount;
            additionalUtxoAmount = 0n;
        } else {
            const expectedUtxo = {
                type: addressType,
                cpfp: cpfpAssumptions
            };
            txSize = utils.transactionBytes(
                [
                    {type: REQUIRED_SPV_SWAP_VAULT_ADDRESS_TYPE},
                    ...existingUtxos,
                    expectedUtxo
                ],
                [
                    {script: Buffer.from(txDetails.vaultScript)},
                    {script: Buffer.from(txDetails.out1script)},
                    {script: Buffer.from(txDetails.out2script)},
                ]
            );
            cpfpFeeSum += utils.inputCpfpAdditionalFee(expectedUtxo, feeRate);
            requiredFee = BigInt(Math.ceil((txSize * feeRate) + cpfpFeeSum));
            totalRequiredInputAmount = requiredSendAmount + requiredFee;
            additionalUtxoAmount = totalRequiredInputAmount - existingUtxoBalance;
            const dustThreshold = BigInt(utils.dustThreshold(expectedUtxo));
            if(additionalUtxoAmount < dustThreshold) {
                // If below dust, let the additional dust amount be consumed as fees.
                requiredFee += dustThreshold - additionalUtxoAmount;
                totalRequiredInputAmount = requiredSendAmount + requiredFee;
                additionalUtxoAmount = dustThreshold;
            }
        }

        return {
            totalRequiredInputAmount: toTokenAmount(totalRequiredInputAmount, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
            existingBalance: toTokenAmount(existingUtxoBalance, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
            totalNetworkFee: toTokenAmount(requiredFee, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
            requiredAdditionalUtxoAmount: toTokenAmount(additionalUtxoAmount, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo),
            excessExistingBalance: toTokenAmount(excessExistingBalance, BitcoinTokens.BTC, this.wrapper._prices, this.pricingInfo)
        };
    }

}
