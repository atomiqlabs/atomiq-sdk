import {MultiChain, Swapper} from "../swapper/Swapper";
import {
    ApiAmount,
    ApiEndpoint,
    CreateSwapInput,
    GetSwapStatusInput,
    SubmitTransactionInput,
    SubmitTransactionOutput,
    SwapStatusResponse
} from "./ApiTypes";
import {
    isSwapExecutionActionSignPSBT,
    isSwapExecutionActionSignSmartChainTx
} from "../types/SwapExecutionAction";
import {ISwap} from "../swaps/ISwap";
import {TokenAmount} from "../types/TokenAmount";
import {serializeAction} from "./SerializedAction";
import {FeeType} from "../enums/FeeType";
import {SwapType} from "../enums/SwapType";

function toApiAmount(tokenAmount: TokenAmount): ApiAmount {
    return {
        amount: tokenAmount.amount,
        rawAmount: tokenAmount.rawAmount != null ? tokenAmount.rawAmount.toString() : "0",
        decimals: tokenAmount.token.decimals,
        symbol: tokenAmount.token.ticker,
        chain: tokenAmount.token.chainId
    };
}

async function buildSwapStatusResponse(swap: ISwap): Promise<SwapStatusResponse> {
    const stateInfo = swap.getStateInfo();
    const input = swap.getInput();
    const output = swap.getOutput();
    const feeBreakdown = swap.getFeeBreakdown();
    const {steps, currentAction} = await swap.getExecutionStatus();

    // Build fees from breakdown
    const swapFeeEntry = feeBreakdown.find(f => f.type === FeeType.SWAP);
    const networkFeeEntry = feeBreakdown.find(f => f.type === FeeType.NETWORK_OUTPUT);

    return {
        swapId: swap.getId(),
        swapType: SwapType[swap.getType()],

        state: {
            number: stateInfo.state,
            name: stateInfo.name,
            description: stateInfo.description
        },
        isFinished: swap.isFinished(),
        isSuccess: swap.isSuccessful(),
        isFailed: swap.isFailed(),
        isExpired: swap.isQuoteExpired(),

        quote: {
            inputAmount: toApiAmount(input),
            outputAmount: toApiAmount(output),
            fees: {
                swap: swapFeeEntry
                    ? toApiAmount(swapFeeEntry.fee.amountInSrcToken)
                    : { amount: "0", rawAmount: "0", decimals: 0, symbol: "", chain: "" },
                ...(networkFeeEntry ? {
                    networkOutput: toApiAmount(networkFeeEntry.fee.amountInSrcToken)
                } : {})
            },
            expiry: swap.getQuoteExpiry()
        },

        createdAt: swap.createdAt,
        expiresAt: swap.getQuoteExpiry() > 0 ? swap.getQuoteExpiry() : null,

        steps,
        currentAction: currentAction ? serializeAction(currentAction) : null,

        transactions: {
            source: {
                init: swap.getInputTxId(),
                settlement: null,  // TODO: expose when available on ISwap
                refund: null       // TODO: expose when available on ISwap
            },
            destination: {
                init: null,  // TODO: expose when available on ISwap
                settlement: swap.getOutputTxId()
            }
        }
    };
}

export class SwapperApi<T extends MultiChain> {

    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, SwapStatusResponse>;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, SwapStatusResponse>;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput>;
    };

    constructor(private swapper: Swapper<T>) {
        this.endpoints = {
            createSwap: {
                type: "POST",
                inputSchema: {
                    srcToken: { type: "string", required: true, description: "Source token ticker (e.g. 'BTC', 'BTCLN', 'STRK')" },
                    dstToken: { type: "string", required: true, description: "Destination token ticker" },
                    amount: { type: "string", required: true, description: "Amount in base units as string" },
                    amountType: { type: "string", required: true, description: "EXACT_IN or EXACT_OUT" },
                    srcAddress: { type: "string", required: true, description: "Source address or Lightning invoice" },
                    dstAddress: { type: "string", required: true, description: "Destination address" },
                    gasAmount: { type: "string", required: false, description: "Gas token amount to receive on destination chain" },
                    paymentHash: { type: "string", required: false, description: "Custom payment hash for Lightning swaps" },
                    options: { type: "object", required: false, description: "Additional options: description, descriptionHash, expirySeconds" }
                },
                callback: (input) => this.createSwap(input)
            },
            getSwapStatus: {
                type: "GET",
                inputSchema: {
                    swapId: { type: "string", required: true, description: "The swap identifier" }
                },
                callback: (input) => this.getSwapStatus(input)
            },
            submitTransaction: {
                type: "POST",
                inputSchema: {
                    swapId: { type: "string", required: true, description: "The swap identifier" },
                    signedTxs: { type: "array", required: true, description: "Array of signed transaction data" }
                },
                callback: (input) => this.submitTransaction(input)
            }
        };
    }

    async init(): Promise<void> {
        await this.swapper.init();
    }

    async poll(): Promise<void> {
        // TODO: Keep this empty for now, until the swapper instance exposes the poll() function
    }

    async sync(): Promise<void> {
        await this.swapper._syncSwaps();
    }

    private async createSwap(input: CreateSwapInput): Promise<SwapStatusResponse> {
        const exactIn = input.amountType === "EXACT_IN";

        // Build options from input
        const options: any = {};
        if (input.gasAmount != null) options.gasAmount = BigInt(input.gasAmount);
        if (input.paymentHash != null) options.paymentHash = Buffer.from(input.paymentHash, "hex");
        if (input.options?.description != null) options.description = input.options.description;
        if (input.options?.descriptionHash != null) options.descriptionHash = Buffer.from(input.options.descriptionHash, "hex");
        if (input.options?.expirySeconds != null) options.expirySeconds = input.options.expirySeconds;

        // swapper.swap() handles routing based on token types
        const swap = await this.swapper.swap(
            input.srcToken,
            input.dstToken,
            BigInt(input.amount),
            exactIn,
            input.srcAddress,
            input.dstAddress,
            Object.keys(options).length > 0 ? options : undefined
        );

        return buildSwapStatusResponse(swap);
    }

    private async getSwapStatus(input: GetSwapStatusInput): Promise<SwapStatusResponse> {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }
        return buildSwapStatusResponse(swap);
    }

    private async submitTransaction(input: SubmitTransactionInput): Promise<SubmitTransactionOutput> {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }

        const action = await swap.getCurrentAction();
        if (action == null) {
            throw new Error("No current action for swap — re-fetch status");
        }

        if (isSwapExecutionActionSignPSBT(action)) {
            const txHashes = await action.submitPsbt(input.signedTxs);
            return { txHashes };
        }

        if (isSwapExecutionActionSignSmartChainTx(action)) {
            const txHashes = await action.submitTransactions(input.signedTxs);
            return { txHashes };
        }

        throw new Error(
            "Current action is not submittable (type: " + action.type + ") — re-fetch status"
        );
    }

}
