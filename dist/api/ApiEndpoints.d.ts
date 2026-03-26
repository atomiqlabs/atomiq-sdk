import { SwapExecutionStep } from "../types/SwapExecutionStep";
import { SerializedAction } from "./SerializedAction";
import { SwapExecutionAction } from "../types/SwapExecutionAction";
import { ApiAmount, ApiToken } from "./ApiTypes";
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
    srcAddress: string;
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
