"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapperApi = void 0;
const ApiTypes_1 = require("./ApiTypes");
const SwapExecutionAction_1 = require("../types/SwapExecutionAction");
const SerializedAction_1 = require("./SerializedAction");
const FeeType_1 = require("../enums/FeeType");
const SwapSide_1 = require("../enums/SwapSide");
const SwapType_1 = require("../enums/SwapType");
const FromBTCLNSwap_1 = require("../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap");
const FromBTCLNAutoSwap_1 = require("../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap");
function requiresSecretRevealForApi(swap, state) {
    if (swap instanceof FromBTCLNSwap_1.FromBTCLNSwap) {
        if (swap.hasSecretPreimage())
            return false;
        return state === FromBTCLNSwap_1.FromBTCLNSwapState.PR_PAID || state === FromBTCLNSwap_1.FromBTCLNSwapState.CLAIM_COMMITED;
    }
    if (swap instanceof FromBTCLNAutoSwap_1.FromBTCLNAutoSwap) {
        if (swap.hasSecretPreimage())
            return false;
        return state === FromBTCLNAutoSwap_1.FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }
}
function createSwapOutputBase(swap, steps, stateInfo) {
    const input = swap.getInput();
    const output = swap.getOutput();
    const feeBreakdown = swap.getFeeBreakdown();
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
        steps
    };
}
function createListSwapOutput(swap, steps, stateInfo) {
    return {
        ...createSwapOutputBase(swap, steps, stateInfo),
        isFinished: swap.isFinished(),
        isSuccess: swap.isSuccessful(),
        isFailed: swap.isFailed(),
        isExpired: swap.isQuoteExpired()
    };
}
function parseSwapSide(side) {
    return side === "INPUT" ? SwapSide_1.SwapSide.INPUT : SwapSide_1.SwapSide.OUTPUT;
}
class SwapperApi {
    constructor(swapper) {
        this.swapper = swapper;
        this.endpoints = {
            createSwap: {
                type: "POST",
                inputSchema: {
                    srcToken: { type: "string", required: true, description: "Source token ticker (e.g. 'BTC', 'BTCLN', 'STARKNET-STRK', 'SOLANA-SOL')" },
                    dstToken: { type: "string", required: true, description: "Destination token ticker" },
                    amount: { type: "bigint", required: true, description: "Amount in base units as an integer" },
                    amountType: { type: "string", required: true, description: "EXACT_IN or EXACT_OUT", allowedValues: ["EXACT_IN", "EXACT_OUT"] },
                    srcAddress: { type: "string", required: true, description: "Source address or Lightning invoice" },
                    dstAddress: { type: "string", required: true, description: "Destination address" },
                    gasAmount: { type: "bigint", required: false, description: "Gas token amount to receive on destination chain, in base units" },
                    paymentHash: { type: "string", required: false, description: "Custom payment hash for Lightning swaps" },
                    description: { type: "string", required: false, description: "Description for Lightning invoice" },
                    descriptionHash: { type: "string", required: false, description: "Description hash for Lightning invoice (hex)" },
                    expirySeconds: { type: "number", required: false, description: "Custom expiry time in seconds" }
                },
                callback: (input) => this.createSwap(input)
            },
            listSwaps: {
                type: "GET",
                inputSchema: {
                    signer: { type: "string", required: true, description: "Smart chain signer address to filter swaps for" },
                    chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter swaps" }
                },
                callback: (input) => this.listSwaps(input)
            },
            listActionableSwaps: {
                type: "GET",
                inputSchema: {
                    signer: { type: "string", required: true, description: "Smart chain signer address to filter actionable swaps for" },
                    chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter actionable swaps" }
                },
                callback: (input) => this.listActionableSwaps(input)
            },
            getSupportedTokens: {
                type: "GET",
                inputSchema: {
                    side: {
                        type: "string",
                        required: true,
                        description: "Whether to list valid source tokens (INPUT) or destination tokens (OUTPUT)",
                        allowedValues: ["INPUT", "OUTPUT"]
                    }
                },
                callback: (input) => this.getSupportedTokens(input)
            },
            getSwapCounterTokens: {
                type: "GET",
                inputSchema: {
                    token: {
                        type: "string",
                        required: true,
                        description: "Token identifier accepted by the API, e.g. BTC, BTCLN, STARKNET-STRK, or a token address"
                    },
                    side: {
                        type: "string",
                        required: true,
                        description: "Treat the provided token as a source token (INPUT) or destination token (OUTPUT)",
                        allowedValues: ["INPUT", "OUTPUT"]
                    }
                },
                callback: (input) => this.getSwapCounterTokens(input)
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
                    signedTxs: {
                        type: "array",
                        required: true,
                        description: "Array of signed transaction data",
                        items: { type: "string", required: true, description: "Single string-serialized & signed transaction" }
                    }
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
            options.gasAmount = input.gasAmount;
        if (input.paymentHash != null)
            options.paymentHash = Buffer.from(input.paymentHash, "hex");
        if (input.description != null)
            options.description = input.description;
        if (input.descriptionHash != null)
            options.descriptionHash = Buffer.from(input.descriptionHash, "hex");
        if (input.expirySeconds != null)
            options.expirySeconds = input.expirySeconds;
        // swapper.swap() handles routing based on token types
        const swap = await this.swapper.swap(input.srcToken, input.dstToken, input.amount, exactIn, input.srcAddress, input.dstAddress, Object.keys(options).length > 0 ? options : undefined);
        const { steps, stateInfo } = await swap.getExecutionStatus({ skipBuildingAction: true });
        return createSwapOutputBase(swap, steps, stateInfo);
    }
    validateSwapListInput(input) {
        if (input.chainId != null && !this.swapper.getSmartChains().includes(input.chainId)) {
            throw new Error("Unknown chainId: " + input.chainId);
        }
        if (!this.swapper.Utils.isValidSmartChainAddress(input.signer, input.chainId)) {
            throw new Error(input.chainId != null
                ? `Invalid ${input.chainId} signer address: ` + input.signer
                : `Invalid smart chain signer address: ` + input.signer);
        }
    }
    async createListedSwapOutputs(swaps) {
        return Promise.all(swaps
            .filter(swap => swap.getType() !== SwapType_1.SwapType.TRUSTED_FROM_BTC)
            .map(async (swap) => {
            const { steps, stateInfo } = await swap.getExecutionStatus({ skipBuildingAction: true });
            return createListSwapOutput(swap, steps, stateInfo);
        }));
    }
    async listSwaps(input) {
        this.validateSwapListInput(input);
        const swaps = await this.swapper.getAllSwaps(input.chainId, input.signer);
        return this.createListedSwapOutputs(swaps);
    }
    async listActionableSwaps(input) {
        this.validateSwapListInput(input);
        const swaps = await this.swapper.getActionableSwaps(input.chainId, input.signer);
        return this.createListedSwapOutputs(swaps);
    }
    async getSupportedTokens(input) {
        return this.swapper.getSupportedTokens(parseSwapSide(input.side)).map(ApiTypes_1.toApiToken);
    }
    async getSwapCounterTokens(input) {
        const token = this.swapper.getToken(input.token);
        return this.swapper.getSwapCounterTokens(token, parseSwapSide(input.side)).map(ApiTypes_1.toApiToken);
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
        const { steps, stateInfo, currentAction } = await swap.getExecutionStatus({
            secret: input.secret,
            bitcoinWallet,
            bitcoinFeeRate: input.bitcoinFeeRate,
            manualSettlementSmartChainSigner: input.signer,
            refundSmartChainSigner: input.signer
        });
        return {
            ...createListSwapOutput(swap, steps, stateInfo),
            currentAction: currentAction ? await (0, SerializedAction_1.serializeAction)(currentAction, this.txSerializer.bind(this)) : null,
            requiresSecretReveal: requiresSecretRevealForApi(swap, stateInfo.state)
        };
    }
    async submitTransaction(input) {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }
        const action = await swap.getExecutionAction();
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
