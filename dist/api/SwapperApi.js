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
    constructor(swapper, config) {
        this.swapper = swapper;
        this.config = config;
        this.config ??= {};
        this.config.syncOnGetStatus ??= true;
        this.endpoints = {
            createSwap: (0, ApiTypes_1.createApiEndpoint)("POST", this.createSwap.bind(this), {
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
            }),
            listSwaps: (0, ApiTypes_1.createApiEndpoint)("GET", this.listSwaps.bind(this), {
                signer: { type: "string", required: true, description: "Smart chain signer address to filter swaps for" },
                chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter swaps" }
            }),
            listActionableSwaps: (0, ApiTypes_1.createApiEndpoint)("GET", this.listActionableSwaps.bind(this), {
                signer: { type: "string", required: true, description: "Smart chain signer address to filter actionable swaps for" },
                chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter actionable swaps" }
            }),
            getSupportedTokens: (0, ApiTypes_1.createApiEndpoint)("GET", this.getSupportedTokens.bind(this), {
                side: {
                    type: "string",
                    required: true,
                    description: "Whether to list valid source tokens (INPUT) or destination tokens (OUTPUT)",
                    allowedValues: ["INPUT", "OUTPUT"]
                }
            }),
            getSwapCounterTokens: (0, ApiTypes_1.createApiEndpoint)("GET", this.getSwapCounterTokens.bind(this), {
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
            }),
            getSwapLimits: (0, ApiTypes_1.createApiEndpoint)("GET", this.getSwapLimits.bind(this), {
                srcToken: { type: "string", required: true, description: "Source token identifier accepted by the API, e.g. BTC, BTCLN, STARKNET-STRK" },
                dstToken: { type: "string", required: true, description: "Destination token identifier accepted by the API, e.g. BTC, BTCLN, STARKNET-STRK" }
            }),
            parseAddress: (0, ApiTypes_1.createApiEndpoint)("GET", this.parseAddress.bind(this), {
                address: { type: "string", required: true, description: "Address, invoice, LNURL, or URI string to parse" }
            }),
            getSpendableBalance: (0, ApiTypes_1.createApiEndpoint)("GET", this.getSpendableBalance.bind(this), {
                wallet: { type: "string", required: true, description: "Wallet address to query" },
                token: { type: "string", required: true, description: "Token identifier accepted by the API, e.g. BTC, STARKNET-STRK, or a token address" },
                targetChain: { type: "string", required: false, description: "Destination smart chain for Bitcoin SPV-vault fee estimation" },
                gasDrop: { type: "boolean", required: false, description: "Whether to include gas-drop footprint when estimating Bitcoin SPV-vault spendable balance" },
                feeRate: { type: "number", required: false, description: "Manual fee rate override" },
                minFeeRate: { type: "number", required: false, description: "Minimum Bitcoin fee rate to enforce" },
                feeMultiplier: { type: "number", required: false, description: "Multiplier applied to smart-chain native token commit fee estimate" }
            }),
            getSwapStatus: (0, ApiTypes_1.createApiEndpoint)("GET", this.getSwapStatus.bind(this), {
                swapId: { type: "string", required: true, description: "The swap identifier" },
                secret: { type: "string", required: false, description: "Revealed swap secret pre-image (in hexadecimal format) for lightning network swaps" },
                bitcoinAddress: { type: "string", required: false, description: "Bitcoin wallet address to obtain funded PSBT" },
                bitcoinPublicKey: { type: "string", required: false, description: "Bitcoin wallet public key (in hexadecimal format) to obtain funded PSBT" },
                bitcoinFeeRate: { type: "number", required: false, description: "Fee rate to use when creating a funded PSBT" },
                signer: { type: "string", required: false, description: "Alternative different smart chain signer to use for refunds and manual settlement" }
            }),
            submitTransaction: (0, ApiTypes_1.createApiEndpoint)("POST", this.submitTransaction.bind(this), {
                swapId: { type: "string", required: true, description: "The swap identifier" },
                signedTxs: {
                    type: "array",
                    required: true,
                    description: "Array of signed transaction data",
                    items: { type: "string", required: true, description: "Single string-serialized & signed transaction" }
                }
            })
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
    //TODO: Maybe reload the intermediaries every so often such that when one drops off due to some issue we can reconnect it again, this directly affects the getSupportedTokens endpoint
    async getSupportedTokens(input) {
        return this.swapper.getSupportedTokens(parseSwapSide(input.side)).map(ApiTypes_1.toApiToken);
    }
    async getSwapCounterTokens(input) {
        const token = this.swapper.getToken(input.token);
        return this.swapper.getSwapCounterTokens(token, parseSwapSide(input.side)).map(ApiTypes_1.toApiToken);
    }
    //TODO: Swap limits might not be populated for non-bitcoin tokens in some routes, we can try to fix this by sending a swap request to probe for swap min/max in those cases
    async getSwapLimits(input) {
        const srcToken = this.swapper.getToken(input.srcToken);
        const dstToken = this.swapper.getToken(input.dstToken);
        const limits = this.swapper.getSwapLimits(srcToken, dstToken);
        return {
            input: {
                min: (0, ApiTypes_1.toApiAmount)(limits.input.min),
                ...(limits.input.max != null ? { max: (0, ApiTypes_1.toApiAmount)(limits.input.max) } : {})
            },
            output: {
                min: (0, ApiTypes_1.toApiAmount)(limits.output.min),
                ...(limits.output.max != null ? { max: (0, ApiTypes_1.toApiAmount)(limits.output.max) } : {})
            }
        };
    }
    async parseAddress(input) {
        const result = await this.swapper.Utils.parseAddress(input.address);
        if (result == null)
            throw new Error("Invalid address");
        return {
            address: result.address,
            type: result.type,
            ...(result.lnurl != null ? { lnurl: (0, ApiTypes_1.toApiLNURL)(result.lnurl) } : {}),
            ...(result.min != null ? { min: (0, ApiTypes_1.toApiAmount)(result.min) } : {}),
            ...(result.max != null ? { max: (0, ApiTypes_1.toApiAmount)(result.max) } : {}),
            ...(result.amount != null ? { amount: (0, ApiTypes_1.toApiAmount)(result.amount) } : {})
        };
    }
    async getSpendableBalance(input) {
        const token = this.swapper.getToken(input.token);
        if (token.chainId === "LIGHTNING")
            throw new Error("Lightning wallet spendable balance is not supported by this endpoint.");
        if (token.chainId === "BITCOIN") {
            if (input.feeMultiplier != null)
                throw new Error("`feeMultiplier` is only supported for smart-chain tokens.");
            if (input.targetChain != null && !this.swapper.getSmartChains().includes(input.targetChain)) {
                throw new Error("Unknown targetChain: " + input.targetChain);
            }
            if (!this.swapper.Utils.isValidBitcoinAddress(input.wallet))
                throw new Error(`Invalid BITCOIN wallet address: ` + input.wallet);
            const { balance, feeRate } = await this.swapper.Utils.getBitcoinSpendableBalance(input.wallet, input.targetChain, {
                gasDrop: input.gasDrop,
                feeRate: input.feeRate,
                minFeeRate: input.minFeeRate
            });
            return {
                balance: (0, ApiTypes_1.toApiAmount)(balance),
                feeRate
            };
        }
        if (input.targetChain != null)
            throw new Error("`targetChain` is only supported for Bitcoin balances.");
        if (input.gasDrop != null)
            throw new Error("`gasDrop` is only supported for Bitcoin balances.");
        if (input.minFeeRate != null)
            throw new Error("`minFeeRate` is only supported for Bitcoin balances.");
        if (!this.swapper.Utils.isValidSmartChainAddress(input.wallet, token.chainId))
            throw new Error(`Invalid ${token.chainId} wallet address: ` + input.wallet);
        const balance = await this.swapper.Utils.getSpendableBalance(input.wallet, token, {
            feeMultiplier: input.feeMultiplier,
            feeRate: input.feeRate
        });
        return {
            balance: (0, ApiTypes_1.toApiAmount)(balance)
        };
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
        if (this.config?.syncOnGetStatus)
            await swap._sync(true);
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
