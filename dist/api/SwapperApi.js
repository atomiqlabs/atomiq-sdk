"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapperApi = void 0;
const ApiTypes_1 = require("./ApiTypes");
const SwapExecutionAction_1 = require("../types/SwapExecutionAction");
const SerializedAction_1 = require("./SerializedAction");
const FeeType_1 = require("../enums/FeeType");
const SwapType_1 = require("../enums/SwapType");
async function buildSwapStatusResponse(swap, txSerializer, options) {
    const stateInfo = swap.getStateInfo();
    const input = swap.getInput();
    const output = swap.getOutput();
    const feeBreakdown = swap.getFeeBreakdown();
    const { steps, currentAction } = await swap.getExecutionStatus(options);
    // Build fees from breakdown
    const swapFeeEntry = feeBreakdown.find(f => f.type === FeeType_1.FeeType.SWAP);
    const networkFeeEntry = feeBreakdown.find(f => f.type === FeeType_1.FeeType.NETWORK_OUTPUT);
    return {
        swapId: swap.getId(),
        swapType: SwapType_1.SwapType[swap.getType()],
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
            inputAmount: (0, ApiTypes_1.toApiAmount)(input),
            outputAmount: (0, ApiTypes_1.toApiAmount)(output),
            fees: {
                swap: swapFeeEntry
                    ? (0, ApiTypes_1.toApiAmount)(swapFeeEntry.fee.amountInSrcToken)
                    : { amount: "0", rawAmount: "0", decimals: 0, symbol: "", chain: "" },
                ...(networkFeeEntry ? {
                    networkOutput: (0, ApiTypes_1.toApiAmount)(networkFeeEntry.fee.amountInSrcToken)
                } : {})
            },
            expiry: swap.getQuoteExpiry()
        },
        createdAt: swap.createdAt,
        expiresAt: swap.getQuoteExpiry() > 0 ? swap.getQuoteExpiry() : null,
        steps,
        currentAction: currentAction ? await (0, SerializedAction_1.serializeAction)(currentAction, txSerializer) : null,
        transactions: {
            source: {
                init: swap.getInputTxId(),
                settlement: null,
                refund: null // TODO: expose when available on ISwap
            },
            destination: {
                init: null,
                settlement: swap.getOutputTxId()
            }
        }
    };
}
class SwapperApi {
    constructor(swapper) {
        this.swapper = swapper;
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
                    options: {
                        type: "object",
                        required: false,
                        description: "Additional swap options",
                        properties: {
                            description: { type: "string", required: false, description: "Description for Lightning invoice" },
                            descriptionHash: { type: "string", required: false, description: "Description hash for Lightning invoice (hex)" },
                            expirySeconds: { type: "number", required: false, description: "Custom expiry time in seconds" }
                        }
                    }
                },
                callback: (input) => this.createSwap(input)
            },
            getSwapStatus: {
                type: "GET",
                inputSchema: {
                    swapId: { type: "string", required: true, description: "The swap identifier" },
                    secret: { type: "string", required: false, description: "Revealed swap secret pre-image (in hexadecimal format) for lightning network swaps" },
                    bitcoinAddress: { type: "string", required: false, description: "Bitcoin wallet address to obtain funded PSBT" },
                    bitcoinPublicKey: { type: "string", required: false, description: "Bitcoin wallet public key (in hexadecimal format) to obtain funded PSBT" },
                    bitcoinFeeRate: { type: "number", required: false, description: "Fee rate to use when creating a funded PSBT" },
                    signer: { type: "string", required: false, description: "Alternative different smart chain signer to use for refunds and manual settlement" }
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
    txSerializer(chainId, tx) {
        const chain = this.swapper._chains[chainId];
        if (chain == null)
            throw new Error("Unknown chain: " + chainId);
        return chain.chainInterface.serializeTx(tx);
    }
    async init() {
        await this.swapper.init();
    }
    async poll() {
        // TODO: Keep this empty for now, until the swapper instance exposes the poll() function
    }
    async sync() {
        await this.swapper._syncSwaps();
    }
    async createSwap(input) {
        const exactIn = input.amountType === "EXACT_IN";
        // Build options from input
        const options = {};
        if (input.gasAmount != null)
            options.gasAmount = BigInt(input.gasAmount);
        if (input.paymentHash != null)
            options.paymentHash = Buffer.from(input.paymentHash, "hex");
        if (input.options?.description != null)
            options.description = input.options.description;
        if (input.options?.descriptionHash != null)
            options.descriptionHash = Buffer.from(input.options.descriptionHash, "hex");
        if (input.options?.expirySeconds != null)
            options.expirySeconds = input.options.expirySeconds;
        // swapper.swap() handles routing based on token types
        const swap = await this.swapper.swap(input.srcToken, input.dstToken, BigInt(input.amount), exactIn, input.srcAddress, input.dstAddress, Object.keys(options).length > 0 ? options : undefined);
        return buildSwapStatusResponse(swap, this.txSerializer.bind(this));
    }
    async getSwapStatus(input) {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }
        if (input.signer != null && !this.swapper.Utils.isValidSmartChainAddress(input.signer, swap.chainIdentifier)) {
            throw new Error(`Invalid ${swap.chainIdentifier} signer address: ` + input.signer);
        }
        if (input.secret != null) {
            try {
                Buffer.from(input.secret, "hex");
            }
            catch (e) {
                throw new Error(`Invalid secret passed, has to be a hexadecimal string!`);
            }
        }
        let bitcoinWallet;
        if (input.bitcoinAddress != null && input.bitcoinPublicKey != null) {
            bitcoinWallet = {
                publicKey: input.bitcoinPublicKey,
                address: input.bitcoinAddress
            };
        }
        else if (input.bitcoinAddress != null || input.bitcoinPublicKey != null) {
            throw new Error("When specifying bitcoin wallet you have to pass both `bitcoinAddress` and `bitcoinPublicKey` params!");
        }
        if (input.bitcoinFeeRate != null) {
            if (isNaN(input.bitcoinFeeRate))
                throw new Error("Bitcoin fee rate passed cannot be NaN!");
            if (input.bitcoinFeeRate <= 0)
                throw new Error("Bitcoin fee rate passed cannot be negative or 0!");
        }
        return buildSwapStatusResponse(swap, this.txSerializer.bind(this), {
            secret: input.secret,
            bitcoinWallet,
            bitcoinFeeRate: input.bitcoinFeeRate,
            manualSettlementSmartChainSigner: input.signer,
            refundSmartChainSigner: input.signer
        });
    }
    async submitTransaction(input) {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }
        const action = await swap.getCurrentAction();
        if (action == null) {
            throw new Error("No current action for swap - re-fetch status");
        }
        if ((0, SwapExecutionAction_1.isSwapExecutionActionSignPSBT)(action)) {
            const txHashes = await action.submitPsbt(input.signedTxs);
            return { txHashes };
        }
        if ((0, SwapExecutionAction_1.isSwapExecutionActionSignSmartChainTx)(action)) {
            const txHashes = await action.submitTransactions(input.signedTxs);
            return { txHashes };
        }
        throw new Error("Current action is not submittable (type: " + action.type + ") - re-fetch status");
    }
}
exports.SwapperApi = SwapperApi;
