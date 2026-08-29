/// <reference types="node" />
/// <reference types="node" />
import { ChainType } from "@atomiqlabs/base";
import { SpvFromBTCWrapper } from "./SpvFromBTCWrapper.js";
import { Transaction } from "@scure/btc-signer";
import { Buffer } from "buffer";
import { BitcoinWalletUtxo, IBitcoinWallet } from "../../bitcoin/wallet/IBitcoinWallet.js";
import { IAddressSwap } from "../IAddressSwap.js";
import { MinimalBitcoinWalletInterface, MinimalBitcoinWalletInterfaceWithSigner } from "../../types/wallets/MinimalBitcoinWalletInterface.js";
import { FeeType } from "../../enums/FeeType.js";
import { TokenAmount } from "../../types/TokenAmount.js";
import { BtcToken, SCToken } from "../../types/Token.js";
import { SwapExecutionActionSendToAddress, SwapExecutionActionSignPSBT } from "../../types/SwapExecutionAction.js";
import { SwapExecutionStepPayment, SwapExecutionStepSettlement } from "../../types/SwapExecutionStep.js";
import { CoinselectAddressTypes } from "../../bitcoin/coinselect2/utils.js";
import { SpvFromBTCSwapBase, SpvFromBTCSwapBaseExecuteCallbacks, SpvFromBTCSwapBaseExecuteOptions, SpvFromBTCSwapInit } from "./SpvFromBTCSwapBase.js";
import { Fee } from "../../types/fees/Fee.js";
/**
 * An external intermediate-wallet deposit that cannot fund the quoted SPV swap.
 *
 * @remarks
 * `requiredAmount` and `actualAmount` are denominated in satoshis. `effectiveFeeRate` and `minimumFeeRate` are
 * populated when `reason` is `"deposit_fee_too_low"` and are denominated in sats/vB.
 */
export type SpvFromBTCExternalDepositInvalidUtxo = {
    key: string;
    utxo: BitcoinWalletUtxo;
    reason: "amount_too_small" | "amount_too_large" | "deposit_fee_too_low";
    requiredAmount: bigint;
    actualAmount: bigint;
    effectiveFeeRate?: number;
    minimumFeeRate?: number;
};
type SpvFromBTCSwapExecuteCallbacks = SpvFromBTCSwapBaseExecuteCallbacks & {
    onExternalDepositReceived?: (depositTxId: string) => void;
    onInvalidExternalDeposit?: (invalidDeposits: SpvFromBTCExternalDepositInvalidUtxo[]) => boolean | void | Promise<boolean | void>;
};
type SpvFromBTCSwapExecuteOptions = SpvFromBTCSwapBaseExecuteOptions & {
    externalDepositCheckIntervalSeconds?: number;
    maxWaitForExternalDepositSeconds?: number;
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
    outputScript: Buffer;
    /**
     * Public key associated with the UTXO
     */
    publicKey: string;
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
    };
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
export declare class SpvFromBTCSwap<T extends ChainType> extends SpvFromBTCSwapBase<T> implements IAddressSwap {
    private swapMode;
    private externalSwapModeInfo;
    private externalDepositTxId?;
    constructor(wrapper: SpvFromBTCWrapper<T>, init: SpvFromBTCSwapInit);
    constructor(wrapper: SpvFromBTCWrapper<T>, obj: any);
    private setExternalDepositTxId;
    /**
     * Returns external mode metadata or throws a mode-specific error.
     *
     * @param operation Human-readable operation name included in the thrown error
     * @returns Active external mode metadata
     * @throws {Error} if the swap is not currently configured for external deposit mode
     */
    private getIntermediateWalletSwapModeInfoOrThrow;
    /**
     * Returns the network fee to be paid on the input/source network
     *
     * @internal
     */
    protected getNetworkInputFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>> | null;
    private getFinalizedCoinselect;
    private getFundingFeeRate;
    /**
     * Serializes this swap, including external mode metadata when active.
     *
     * @remarks
     * In-memory `selectedExistingUtxos` may be full {@link BitcoinWalletUtxo} objects, but persistence narrows each
     * UTXO to JSON-safe primitive fields and quote-time CPFP metadata.
     *
     * @returns JSON stringifiable swap data suitable for SDK storage
     */
    serialize(): any;
    /**
     * Returns the active SPV funding mode.
     *
     * @returns `"psbt"` for the normal wallet-funded PSBT flow or `"intermediate_wallet"` for intermediate-wallet deposit mode
     */
    getSwapMode(): SpvFromBTCSwapMode;
    /**
     * Switches this swap back to normal PSBT mode and optionally clears cached external deposit metadata.
     *
     * @param clearMetadata Whether to also clean the internal saved metadata for the "intermedate_wallet" swap mode
     *  (if it was used before this function got called), if `false` is passed you can get back to "intermediate_wallet"
     *  swap mode by calling {@link returnToIntermediateWalletSwapMode}
     */
    setSwapModePsbt(clearMetadata?: boolean): Promise<void>;
    /**
     * Returns back to the "intermediate_wallet" swap mode with the already saved and persisted mode metadata (selected
     *  utxos, fee rate, required deposit, etc.), this is possible if the swap was previously switched from
     *  "intermediate_wallet" swap mode to "psbt" swap mode by calling the {@link setSwapModePsbt} and passing the
     *  `clearMetadata=false`, which retains the swap mode metadata.
     */
    returnToIntermediateWalletSwapMode(): Promise<void>;
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
    setSwapModeIntermediateWallet(intermediateWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, existingUtxos?: BitcoinWalletUtxo[], feeRate?: number, cpfpAssumptions?: {
        txVsize: number;
        txEffectiveFeeRate: number;
    }): Promise<SpvFromBTCIntermediateWalletSwapModeInfo>;
    /**
     * Applies a precomputed intermediate-wallet funding plan to this swap.
     *
     * @param fundingPlan Verified funding plan produced while creating the quote
     * @returns The applied intermediate-wallet mode information
     * @internal
     */
    _setSwapModeIntermediateWallet(fundingPlan: SpvFromBTCIntermediateWalletSwapModeInfo): Promise<SpvFromBTCIntermediateWalletSwapModeInfo>;
    /**
     * Checks whether this swap currently exposes address-swap behavior.
     *
     * @returns `true` only in external deposit mode
     */
    isAddressSwapMode(): boolean;
    /**
     * Returns the intermediate Bitcoin deposit address for external mode.
     *
     * @returns Bitcoin address that should receive the additional future UTXO
     * @throws {Error} if the swap is in PSBT mode
     */
    getAddress(): string;
    /**
     * Returns a BIP-21 Bitcoin URI for the external deposit address and required additional UTXO amount.
     *
     * @returns Bitcoin payment URI for QR-code display
     * @throws {Error} if the swap is in PSBT mode
     */
    getHyperlink(): string;
    /**
     * Returns whether the current swap in "intermediate_wallet" mode requires an additional external deposit to be made
     */
    requiresExternalDeposit(): boolean;
    /**
     * Returns the required additional external deposit amount in "intermediate_wallet" mode, or `null` if not required
     *
     * @throws {Error} If the swap is not using the "intermediate_wallet" swap mode.
     */
    getExternalDepositAmount(): TokenAmount<BtcToken<false>, true> | null;
    /**
     * Returns the user-facing BTC input amount.
     *
     * @remarks
     * PSBT mode returns the base SPV quote input. External mode includes the input-side Bitcoin network fee cached
     * during {@link setSwapModeIntermediateWallet}.
     *
     * @returns Input BTC amount in satoshis wrapped as a token amount
     */
    getInput(): TokenAmount<BtcToken<false>, true>;
    /**
     * @inheritDoc
     */
    getFee(): Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
    /**
     * @inheritDoc
     *
     * @returns Fee breakdown with `FeeType.NETWORK_INPUT` only when external deposit mode is active
     * @throws {Error} if pricing data is unavailable in external mode
     */
    getFeeBreakdown(): [
        {
            type: FeeType.SWAP;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        },
        {
            type: FeeType.NETWORK_OUTPUT;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        }
    ] | [
        {
            type: FeeType.NETWORK_INPUT;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        },
        {
            type: FeeType.SWAP;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        },
        {
            type: FeeType.NETWORK_OUTPUT;
            fee: Fee<T["ChainId"], BtcToken<false>, SCToken<T["ChainId"]>>;
        }
    ];
    /**
     * Looks for the future external deposit UTXO matching the cached required additional amount.
     *
     * @param rehydratedWalletUtxos
     * @param ignoredUtxoKeys Invalid UTXO keys already handled by the waiting callback
     * @returns Matching fresh wallet UTXO or all newly detected invalid UTXOs
     * @throws {Error} if the swap is not in external mode
     */
    private getMatchingExternalDepositUtxo;
    /**
     * Rehydrates quote-selected external funding UTXOs with fresh signing data while preserving quote-time fee data.
     *
     * @param rehydratedWalletUtxos
     * @returns Rehydrated selected wallet utxos
     * @throws {Error} if a selected UTXO disappeared, changed value/type, or the required new deposit is missing
     */
    private getRehydratedSelectedExistingUtxos;
    /**
     * Returns fresh UTXOs for every address involved in the intermediate-wallet funding plan.
     *
     * A supplied wallet remains authoritative. Without one, persisted output scripts and public keys provide enough
     * information to query the wrapper's address-index backend directly.
     */
    private getIntermediateWalletUtxos;
    getFundedPsbt(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number, additionalOutputs?: ({
        amount: bigint;
        outputScript: Uint8Array;
    } | {
        amount: bigint;
        address: string;
    })[], utxos?: BitcoinWalletUtxo[], spendFully?: boolean): Promise<{
        psbt: Transaction;
        psbtHex: string;
        psbtBase64: string;
        signInputs: number[];
        feeRate: number;
    }>;
    /**
     * @throws {InvalidBitcoinDepositError} If an invalid deposit was mode and was not consumed by the `onInvalidDeposit`
     *  callback
     *
     * @private
     */
    private _waitForExternalDeposit;
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
    waitForExternalDeposit(_intermediateWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface, maxWaitTimeSeconds?: number, pollIntervalSeconds?: number, onInvalidDeposit?: (invalidUtxos: SpvFromBTCExternalDepositInvalidUtxo[]) => boolean | void | Promise<boolean | void>, abortSignal?: AbortSignal): Promise<BitcoinWalletUtxo>;
    /**
     * @inheritDoc
     */
    estimateBitcoinFee(_bitcoinWallet: IBitcoinWallet | MinimalBitcoinWalletInterface, feeRate?: number): Promise<TokenAmount<BtcToken<false>, true> | null>;
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
    execute(wallet: IBitcoinWallet | MinimalBitcoinWalletInterfaceWithSigner, callbacks?: SpvFromBTCSwapExecuteCallbacks, options?: SpvFromBTCSwapExecuteOptions): Promise<boolean>;
    /**
     * Builds an address action for the future external deposit UTXO.
     *
     * @returns Send-to-address action that waits only for the matching UTXO to appear
     * @throws {Error} if the swap is not in external mode
     */
    private _buildExternalDepositAddressAction;
    /**
     * Builds a funded PSBT action for signing with the external intermediate deposit wallet.
     *
     * @param rehydratedWalletUtxos
     * @param bitcoinWallet
     * @param options Additional options allow overriding the provided bitcoin wallet
     * @returns Funded PSBT action using the quote-stable external funding set
     * @throws {Error} if `bitcoinWallet` is missing while external mode is ready for PSBT signing
     */
    private _buildExternalDepositPsbtAction;
    /**
     * Adds external-mode staged actions on top of the base SPV execution status.
     *
     * @param options Optional execution action context, especially `bitcoinWallet` for funded external PSBTs
     * @returns Execution status with SendToAddress or funded SignPSBT action while external mode is in CREATED state
     * @internal
     */
    protected _getExecutionStatus(options?: {
        bitcoinFeeRate?: number;
        bitcoinWallet?: MinimalBitcoinWalletInterface | IBitcoinWallet;
        manualSettlementSmartChainSigner?: string | T["Signer"] | T["NativeSigner"];
        maxWaitTillAutomaticSettlementSeconds?: number;
    }): Promise<{
        steps: [SwapExecutionStepPayment<"BITCOIN">, SwapExecutionStepSettlement<T["ChainId"], "awaiting_automatic" | "awaiting_manual">];
        buildCurrentAction: (actionOptions?: {
            bitcoinFeeRate?: number | undefined;
            bitcoinWallet?: IBitcoinWallet | MinimalBitcoinWalletInterface | undefined;
            manualSettlementSmartChainSigner?: string | T["Signer"] | T["NativeSigner"] | undefined;
            maxWaitTillAutomaticSettlementSeconds?: number | undefined;
        } | undefined) => Promise<SwapExecutionActionSignPSBT<"FUNDED_PSBT" | "RAW_PSBT"> | SwapExecutionActionSendToAddress<false> | import("../../types/SwapExecutionAction.js").SwapExecutionActionWait<"SETTLEMENT" | "BITCOIN_CONFS"> | import("../../types/SwapExecutionAction.js").SwapExecutionActionSignSmartChainTx<T> | undefined>;
        state: number;
    }>;
    /**
     * @inheritDoc
     */
    getExecutionSteps(options?: {
        maxWaitTillAutomaticSettlementSeconds?: number;
        bitcoinWallet?: MinimalBitcoinWalletInterface | IBitcoinWallet;
    }): Promise<[
        SwapExecutionStepPayment<"BITCOIN">,
        SwapExecutionStepSettlement<T["ChainId"], "awaiting_automatic" | "awaiting_manual">
    ]>;
}
export {};
