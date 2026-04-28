"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwapperApi = void 0;
const ApiTypes_1 = require("./ApiTypes");
const SerializedAction_1 = require("./SerializedAction");
const FeeType_1 = require("../enums/FeeType");
const SwapSide_1 = require("../enums/SwapSide");
const SwapType_1 = require("../enums/SwapType");
const FromBTCLNSwap_1 = require("../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap");
const FromBTCLNAutoSwap_1 = require("../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap");
const IEscrowSwap_1 = require("../swaps/escrow_swaps/IEscrowSwap");
const ToBTCLNSwap_1 = require("../swaps/escrow_swaps/tobtc/ln/ToBTCLNSwap");
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
            expiry: swap.getQuoteExpiry(),
            outputAddress: swap.getOutputAddress()
        },
        createdAt: swap.createdAt,
        steps,
        ...(swap instanceof ToBTCLNSwap_1.ToBTCLNSwap && swap.isLNURL() ? {
            lnurl: {
                pay: swap.getLNURL(),
                successAction: swap.getSuccessAction() ?? undefined
            }
        } : (swap instanceof FromBTCLNSwap_1.FromBTCLNSwap || swap instanceof FromBTCLNAutoSwap_1.FromBTCLNAutoSwap) && swap.isLNURL() ? {
            lnurl: {
                withdraw: swap.getLNURL(),
            }
        } : {})
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
                srcAddress: { type: "string", required: false, description: "Source address (only required for Smart chain -> BTC/Lightning swaps)" },
                dstAddress: { type: "string", required: true, description: "Destination address" },
                gasAmount: { type: "bigint", required: false, description: "Gas token amount to receive on destination chain, in base units" },
                paymentHash: { type: "string", required: false, description: "Custom payment hash for Lightning swaps" },
                lightningInvoiceDescription: { type: "string", required: false, description: "Description for Lightning invoice" },
                lightningInvoiceDescriptionHash: { type: "string", required: false, description: "Description hash for Lightning invoice (hex)" },
                lightningPaymentHTLCTimeout: { type: "number", required: false, description: "Custom expiry time in seconds" }
            }),
            listSwaps: (0, ApiTypes_1.createApiEndpoint)("GET", this.listSwaps.bind(this), {
                signer: { type: "string", required: true, description: "Smart chain signer address to filter swaps for" },
                chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter swaps" }
            }),
            listPendingSwaps: (0, ApiTypes_1.createApiEndpoint)("GET", this.listPendingSwaps.bind(this), {
                signer: { type: "string", required: true, description: "Smart chain signer address to filter pending swaps for" },
                chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter pending swaps" }
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
                feeRate: { type: "string", required: false, description: "Manual fee rate override" },
                minBitcoinFeeRate: { type: "number", required: false, description: "Minimum Bitcoin fee rate to enforce" },
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
            }),
            settleWithLnurl: (0, ApiTypes_1.createApiEndpoint)("POST", this.settleWithLnurl.bind(this), {
                swapId: { type: "string", required: true, description: "The swap identifier" },
                lnurlWithdraw: { type: "string", required: false, description: "LNURL-withdraw link to use to settle the Lightning network swap, if the swap was already created with the LNURL-withdraw link, this is optional" }
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
    /**
     * Should be ran periodically, this synchronizes the swap's state with the on-chain data and also purges
     *  expired swaps from the persistent storage
     */
    async sync() {
        await this.swapper._syncSwaps();
    }
    /**
     * Optionally good to run this periodically, such that any LPs that are dropped off because they are unresponsive
     *  can be found again.
     */
    async reloadLps() {
        await this.swapper.intermediaryDiscovery.reloadIntermediaries();
    }
    async createSwap(input) {
        const exactIn = input.amountType === "EXACT_IN";
        // Build options from input
        const options = {};
        if (input.gasAmount != null)
            options.gasAmount = input.gasAmount;
        if (input.paymentHash != null)
            options.paymentHash = Buffer.from(input.paymentHash, "hex");
        if (input.lightningInvoiceDescription != null)
            options.description = input.lightningInvoiceDescription;
        if (input.lightningInvoiceDescriptionHash != null)
            options.descriptionHash = Buffer.from(input.lightningInvoiceDescriptionHash, "hex");
        if (input.lightningPaymentHTLCTimeout != null)
            options.expirySeconds = input.lightningPaymentHTLCTimeout;
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
    async listPendingSwaps(input) {
        this.validateSwapListInput(input);
        const swaps = await this.swapper.getPendingSwaps(input.chainId, input.signer);
        return this.createListedSwapOutputs(swaps);
    }
    async getSupportedTokens(input) {
        return this.swapper.getSupportedTokens(parseSwapSide(input.side)).map(ApiTypes_1.toApiToken);
    }
    async getSwapCounterTokens(input) {
        const token = this.swapper.getToken(input.token);
        return this.swapper.getSwapCounterTokens(token, parseSwapSide(input.side)).map(ApiTypes_1.toApiToken);
    }
    async getSwapLimits(input) {
        const srcToken = this.swapper.getToken(input.srcToken);
        const dstToken = this.swapper.getToken(input.dstToken);
        let limits = this.swapper.getSwapLimits(srcToken, dstToken);
        if (dstToken.chainId !== "LIGHTNING") {
            if (limits.input.min.rawAmount === 1n || limits.output.min.rawAmount === 1n) {
                // Execute a dummy swap to get the proper limits
                try {
                    await this.swapper.swap(srcToken, dstToken, 1n, limits.input.min.rawAmount === 1n, srcToken.chainId === "LIGHTNING" ? undefined : this.swapper.Utils.randomAddress(srcToken.chainId), this.swapper.Utils.randomAddress(dstToken.chainId));
                }
                catch (e) { }
                limits = this.swapper.getSwapLimits(srcToken, dstToken);
            }
        }
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
            ...(result.lnurl != null ? { lnurl: (0, ApiTypes_1.toApiLNURL)(result.lnurl, this.swapper) } : {}),
            ...(result.min != null ? { min: (0, ApiTypes_1.toApiAmount)(result.min) } : {}),
            ...(result.max != null ? { max: (0, ApiTypes_1.toApiAmount)(result.max) } : {}),
            ...(result.amount != null ? { amount: (0, ApiTypes_1.toApiAmount)(result.amount) } : {})
        };
    }
    async getSpendableBalance(input) {
        const token = this.swapper.getToken(input.token);
        if (token.chainId === "LIGHTNING")
            throw new Error("Lightning wallet spendable balance is not supported by this endpoint.");
        if (input.feeRate != null && input.feeMultiplier != null)
            throw new Error("`feeMultiplier` cannot be specified alongside the `feeRate` parameter.");
        if (token.chainId === "BITCOIN") {
            if (input.targetChain != null && !this.swapper.getSmartChains().includes(input.targetChain)) {
                throw new Error("Unknown targetChain: " + input.targetChain);
            }
            if (!this.swapper.Utils.isValidBitcoinAddress(input.wallet))
                throw new Error(`Invalid BITCOIN wallet address: ` + input.wallet);
            let btcFeeRate;
            if (input.feeRate != null) {
                btcFeeRate = parseFloat(input.feeRate);
                if (isNaN(btcFeeRate) || btcFeeRate <= 0)
                    throw new Error("Bitcoin `feeRate` must be a valid positive number!");
            }
            else
                btcFeeRate = await this.swapper._bitcoinRpc.getFeeRate();
            if (input.feeMultiplier != null)
                btcFeeRate *= input.feeMultiplier;
            const { balance, feeRate } = await this.swapper.Utils.getBitcoinSpendableBalance(input.wallet, input.targetChain, {
                gasDrop: input.gasDrop,
                feeRate: btcFeeRate,
                minFeeRate: input.minBitcoinFeeRate
            });
            return {
                balance: (0, ApiTypes_1.toApiAmount)(balance),
                feeRate
            };
        }
        if (input.gasDrop === true)
            throw new Error("`gasDrop` is only supported for Bitcoin balances.");
        if (input.minBitcoinFeeRate != null)
            throw new Error("`minBitcoinFeeRate` is only supported for Bitcoin balances.");
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
            requiresSecretReveal: requiresSecretRevealForApi(swap, stateInfo.state),
            escrow: swap instanceof IEscrowSwap_1.IEscrowSwap && swap._data != null ? {
                data: swap._data.getEscrowStruct(),
                initTxId: swap._commitTxId
            } : undefined
        };
    }
    async submitTransaction(input) {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }
        return {
            txHashes: await swap._submitExecutionTransactions(input.signedTxs, undefined, undefined, this.config?.idempotentTxSubmission)
        };
    }
    async settleWithLnurl(input) {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null)
            throw new Error("Swap not found: " + input.swapId);
        if (swap instanceof FromBTCLNAutoSwap_1.FromBTCLNAutoSwap) {
            if (swap._state !== FromBTCLNAutoSwap_1.FromBTCLNAutoSwapState.PR_CREATED)
                throw new Error("Invalid swap state, must be in PR_CREATED state!");
        }
        else if (swap instanceof FromBTCLNSwap_1.FromBTCLNSwap) {
            if (swap._state !== FromBTCLNSwap_1.FromBTCLNSwapState.PR_CREATED)
                throw new Error("Invalid swap state, must be in PR_CREATED state!");
        }
        else {
            throw new Error("Endpoint only supports swaps from Lightning");
        }
        if (!swap.isLNURL()) {
            if (input.lnurlWithdraw == null)
                throw new Error("The swap is not configured to use LNURL, please pass the `lnurlWithdraw` parameter!");
            if (!this.swapper.Utils.isValidLNURL(input.lnurlWithdraw))
                throw new Error("Invalid LNURL-withdraw link provided: " + input.lnurlWithdraw);
            await swap.settleWithLNURLWithdraw(input.lnurlWithdraw);
        }
        else {
            if (input.lnurlWithdraw != null)
                throw new Error("The swap is already configured with an LNURL link, don't pass the `lnurlWithdraw` parameter!");
        }
        let success;
        if (swap instanceof FromBTCLNAutoSwap_1.FromBTCLNAutoSwap) {
            // For non-legacy swap, we don't need to wait till the swap advances all the way to committed state
            success = await swap._waitForLpPaymentReceived(2);
        }
        else {
            // For legacy swap waitForPayment waits just for the swap to transition into PR_PAID
            success = await swap.waitForPayment(undefined, 2);
        }
        if (!success)
            throw new Error("Failed to settle the swap with the LNURL-withdraw link!");
        return {
            paymentHash: swap.getInputTxId()
        };
    }
}
exports.SwapperApi = SwapperApi;
