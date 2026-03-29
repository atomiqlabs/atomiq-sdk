import { SwapExecutionStep } from "../types/SwapExecutionStep";
import { SerializedAction } from "./SerializedAction";
import { SwapExecutionAction } from "../types/SwapExecutionAction";
import { ApiAmount, ApiLNURL, ApiToken } from "./ApiTypes";
export type SwapOutputBase = {
    swapId: string;
    swapType: string;
    state: {
        number: number;
        name: string;
        description: string;
    };
    quote: {
        inputAmount: ApiAmount;
        outputAmount: ApiAmount;
        fees: {
            swap: ApiAmount;
            networkOutput?: ApiAmount;
        };
        expiry: number;
    };
    createdAt: number;
    steps: SwapExecutionStep[];
};
/**
 * Input for creating a new swap
 *
 * @category API
 */
export type CreateSwapInput = {
    srcToken: string;
    dstToken: string;
    amount: bigint;
    amountType: "EXACT_IN" | "EXACT_OUT";
    srcAddress?: string;
    dstAddress: string;
    gasAmount?: bigint;
    paymentHash?: string;
    description?: string;
    descriptionHash?: string;
    expirySeconds?: number;
};
/**
 * Output from create swap endpoint
 *
 * @category API
 */
export type CreateSwapOutput = SwapOutputBase;
/**
 * Input for getting swap status
 *
 * @category API
 */
export type GetSwapStatusInput = {
    swapId: string;
    secret?: string;
    bitcoinAddress?: string;
    bitcoinPublicKey?: string;
    bitcoinFeeRate?: number;
    signer?: string;
};
/**
 * Output from swap status getter
 *
 * @category API
 */
export type ListSwapOutput = SwapOutputBase & {
    isFinished: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    isExpired: boolean;
};
/**
 * Output from swap status getter
 *
 * @category API
 */
export type GetSwapStatusOutput = ListSwapOutput & {
    currentAction: SerializedAction<SwapExecutionAction> | null;
    requiresSecretReveal?: boolean;
};
/**
 * Input for listing swaps
 *
 * @category API
 */
export type ListSwapsInput = {
    signer: string;
    chainId?: string;
};
/**
 * Output from swap list endpoint
 *
 * @category API
 */
export type ListSwapsOutput = ListSwapOutput[];
/**
 * Input for listing actionable swaps
 *
 * @category API
 */
export type ListActionableSwapsInput = ListSwapsInput;
/**
 * Output from actionable swap list endpoint
 *
 * @category API
 */
export type ListActionableSwapsOutput = ListSwapsOutput;
/**
 * Input for listing supported tokens
 *
 * @category API
 */
export type GetSupportedTokensInput = {
    side: "INPUT" | "OUTPUT";
};
/**
 * Output from supported token list endpoint
 *
 * @category API
 */
export type GetSupportedTokensOutput = ApiToken[];
/**
 * Input for listing swap counter-tokens for a given token
 *
 * @category API
 */
export type GetSwapCounterTokensInput = {
    token: string;
    side: "INPUT" | "OUTPUT";
};
/**
 * Output from swap counter-token list endpoint
 *
 * @category API
 */
export type GetSwapCounterTokensOutput = ApiToken[];
/**
 * Input for querying swap limits between two tokens
 *
 * @category API
 */
export type GetSwapLimitsInput = {
    srcToken: string;
    dstToken: string;
};
/**
 * Output from swap limits endpoint
 *
 * @category API
 */
export type GetSwapLimitsOutput = {
    input: {
        min: ApiAmount;
        max?: ApiAmount;
    };
    output: {
        min: ApiAmount;
        max?: ApiAmount;
    };
};
/**
 * Input for parsing an address-like string supported by the SDK
 *
 * @category API
 */
export type ParseAddressInput = {
    address: string;
};
/**
 * Output from address parser endpoint
 *
 * @category API
 */
export type ParseAddressOutput = {
    address: string;
    type: string;
    lnurl?: ApiLNURL;
    min?: ApiAmount;
    max?: ApiAmount;
    amount?: ApiAmount;
};
/**
 * Input for querying spendable wallet balance
 *
 * @category API
 */
export type GetSpendableBalanceInput = {
    wallet: string;
    token: string;
    targetChain?: string;
    gasDrop?: boolean;
    feeRate?: number;
    minFeeRate?: number;
    feeMultiplier?: number;
};
/**
 * Output from spendable balance endpoint
 *
 * @category API
 */
export type GetSpendableBalanceOutput = {
    balance: ApiAmount;
    feeRate?: number;
};
/**
 * Input for submitting signed transactions
 *
 * @category API
 */
export type SubmitTransactionInput = {
    swapId: string;
    signedTxs: string[];
};
/**
 * Output from submitting transactions
 *
 * @category API
 */
export type SubmitTransactionOutput = {
    txHashes: string[];
};
