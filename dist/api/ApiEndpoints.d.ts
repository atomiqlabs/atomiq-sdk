import { SwapExecutionStep } from "../types/SwapExecutionStep";
import { SerializedAction } from "./SerializedAction";
import { SwapExecutionAction } from "../types/SwapExecutionAction";
import { ApiAmount } from "./ApiTypes";
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
/**
 * Shared response type for createSwap and getSwapStatus
 *
 * @category API
 */
export type SwapStatusResponse = {
    swapId: string;
    swapType: string;
    state: {
        number: number;
        name: string;
        description: string;
    };
    isFinished: boolean;
    isSuccess: boolean;
    isFailed: boolean;
    isExpired: boolean;
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
    currentAction: SerializedAction<SwapExecutionAction> | null;
    requiresSecretReveal?: boolean;
};
