import {MultiChain, Swapper} from "../swapper/Swapper";
import {ApiEndpoint, createApiEndpoint, toApiAmount, toApiLNURL, toApiToken} from "./ApiTypes";
import {isSwapExecutionActionSignPSBT, isSwapExecutionActionSignSmartChainTx} from "../types/SwapExecutionAction";
import {ISwap} from "../swaps/ISwap";
import {serializeAction} from "./SerializedAction";
import {FeeType} from "../enums/FeeType";
import {SwapSide} from "../enums/SwapSide";
import {SwapType} from "../enums/SwapType";
import {MinimalBitcoinWalletInterface} from "../types/wallets/MinimalBitcoinWalletInterface";
import {FromBTCLNSwap, FromBTCLNSwapState} from "../swaps/escrow_swaps/frombtc/ln/FromBTCLNSwap";
import {FromBTCLNAutoSwap, FromBTCLNAutoSwapState} from "../swaps/escrow_swaps/frombtc/ln_auto/FromBTCLNAutoSwap";
import {
    ListActionableSwapsInput,
    ListActionableSwapsOutput,
    CreateSwapInput,
    CreateSwapOutput,
    GetSwapStatusInput,
    GetSwapStatusOutput,
    GetSupportedTokensInput,
    GetSupportedTokensOutput,
    GetSwapCounterTokensInput,
    GetSwapCounterTokensOutput,
    GetSwapLimitsInput,
    GetSwapLimitsOutput,
    GetSpendableBalanceInput,
    GetSpendableBalanceOutput,
    ListSwapOutput,
    ListSwapsInput,
    ListSwapsOutput,
    ParseAddressInput,
    ParseAddressOutput,
    SubmitTransactionInput,
    SubmitTransactionOutput,
    SwapOutputBase
} from "./ApiEndpoints";
import {SwapExecutionStep} from "../types/SwapExecutionStep";
import {SwapStateInfo} from "../types/SwapStateInfo";
import {IEscrowSwap} from "../swaps/escrow_swaps/IEscrowSwap";

function requiresSecretRevealForApi(swap: ISwap, state: number): boolean | undefined {
    if(swap instanceof FromBTCLNSwap) {
        if(swap.hasSecretPreimage()) return false;
        return state===FromBTCLNSwapState.PR_PAID || state===FromBTCLNSwapState.CLAIM_COMMITED;
    }
    if(swap instanceof FromBTCLNAutoSwap) {
        if(swap.hasSecretPreimage()) return false;
        return state===FromBTCLNAutoSwapState.CLAIM_COMMITED;
    }
}

function createSwapOutputBase(
    swap: ISwap,
    steps: SwapExecutionStep[],
    stateInfo: SwapStateInfo<number>
): SwapOutputBase {
    const input = swap.getInput();
    const output = swap.getOutput();
    const feeBreakdown = swap.getFeeBreakdown();

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

        steps
    };
}

function createListSwapOutput(
    swap: ISwap,
    steps: SwapExecutionStep[],
    stateInfo: SwapStateInfo<number>
): ListSwapOutput {
    return {
        ...createSwapOutputBase(swap, steps, stateInfo),

        isFinished: swap.isFinished(),
        isSuccess: swap.isSuccessful(),
        isFailed: swap.isFailed(),
        isExpired: swap.isQuoteExpired()
    };
}

function parseSwapSide(side: "INPUT" | "OUTPUT"): SwapSide {
    return side === "INPUT" ? SwapSide.INPUT : SwapSide.OUTPUT;
}

export type SwapperApiConfig = {
    syncOnGetStatus?: boolean
};

export class SwapperApi<T extends MultiChain> {

    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, CreateSwapOutput, "POST">;
        listSwaps: ApiEndpoint<ListSwapsInput, ListSwapsOutput, "GET">;
        listActionableSwaps: ApiEndpoint<ListActionableSwapsInput, ListActionableSwapsOutput, "GET">;
        getSupportedTokens: ApiEndpoint<GetSupportedTokensInput, GetSupportedTokensOutput, "GET">;
        getSwapCounterTokens: ApiEndpoint<GetSwapCounterTokensInput, GetSwapCounterTokensOutput, "GET">;
        getSwapLimits: ApiEndpoint<GetSwapLimitsInput, GetSwapLimitsOutput, "GET">;
        parseAddress: ApiEndpoint<ParseAddressInput, ParseAddressOutput, "GET">;
        getSpendableBalance: ApiEndpoint<GetSpendableBalanceInput, GetSpendableBalanceOutput, "GET">;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, GetSwapStatusOutput, "GET">;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput, "POST">;
    };

    constructor(private swapper: Swapper<T>, private readonly config?: SwapperApiConfig) {
        this.config ??= {};
        this.config.syncOnGetStatus ??= true;
        this.endpoints = {
            createSwap: createApiEndpoint<CreateSwapInput, CreateSwapOutput, "POST">("POST", this.createSwap.bind(this), {
                srcToken: { type: "string", required: true, description: "Source token ticker (e.g. 'BTC', 'BTCLN', 'STARKNET-STRK', 'SOLANA-SOL')" },
                dstToken: { type: "string", required: true, description: "Destination token ticker" },
                amount: { type: "bigint", required: true, description: "Amount in base units as an integer" },
                amountType: { type: "string", required: true, description: "EXACT_IN or EXACT_OUT", allowedValues: ["EXACT_IN", "EXACT_OUT"] },
                srcAddress: { type: "string", required: false, description: "Source address (only required for Smart chain -> BTC/Lightning swaps)" },
                dstAddress: { type: "string", required: true, description: "Destination address" },
                gasAmount: { type: "bigint", required: false, description: "Gas token amount to receive on destination chain, in base units" },
                paymentHash: { type: "string", required: false, description: "Custom payment hash for Lightning swaps" },
                description: { type: "string", required: false, description: "Description for Lightning invoice" },
                descriptionHash: { type: "string", required: false, description: "Description hash for Lightning invoice (hex)" },
                expirySeconds: { type: "number", required: false, description: "Custom expiry time in seconds" }
            }),
            listSwaps: createApiEndpoint<ListSwapsInput, ListSwapsOutput, "GET">("GET", this.listSwaps.bind(this), {
                signer: { type: "string", required: true, description: "Smart chain signer address to filter swaps for" },
                chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter swaps" }
            }),
            listActionableSwaps: createApiEndpoint<ListActionableSwapsInput, ListActionableSwapsOutput, "GET">("GET", this.listActionableSwaps.bind(this), {
                signer: { type: "string", required: true, description: "Smart chain signer address to filter actionable swaps for" },
                chainId: { type: "string", required: false, description: "Optional smart chain identifier to filter actionable swaps" }
            }),
            getSupportedTokens: createApiEndpoint<GetSupportedTokensInput, GetSupportedTokensOutput, "GET">("GET", this.getSupportedTokens.bind(this), {
                side: {
                    type: "string",
                    required: true,
                    description: "Whether to list valid source tokens (INPUT) or destination tokens (OUTPUT)",
                    allowedValues: ["INPUT", "OUTPUT"]
                }
            }),
            getSwapCounterTokens: createApiEndpoint<GetSwapCounterTokensInput, GetSwapCounterTokensOutput, "GET">("GET", this.getSwapCounterTokens.bind(this), {
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
            getSwapLimits: createApiEndpoint<GetSwapLimitsInput, GetSwapLimitsOutput, "GET">("GET", this.getSwapLimits.bind(this), {
                srcToken: { type: "string", required: true, description: "Source token identifier accepted by the API, e.g. BTC, BTCLN, STARKNET-STRK" },
                dstToken: { type: "string", required: true, description: "Destination token identifier accepted by the API, e.g. BTC, BTCLN, STARKNET-STRK" }
            }),
            parseAddress: createApiEndpoint<ParseAddressInput, ParseAddressOutput, "GET">("GET", this.parseAddress.bind(this), {
                address: { type: "string", required: true, description: "Address, invoice, LNURL, or URI string to parse" }
            }),
            getSpendableBalance: createApiEndpoint<GetSpendableBalanceInput, GetSpendableBalanceOutput, "GET">("GET", this.getSpendableBalance.bind(this), {
                wallet: { type: "string", required: true, description: "Wallet address to query" },
                token: { type: "string", required: true, description: "Token identifier accepted by the API, e.g. BTC, STARKNET-STRK, or a token address" },
                targetChain: { type: "string", required: false, description: "Destination smart chain for Bitcoin SPV-vault fee estimation" },
                gasDrop: { type: "boolean", required: false, description: "Whether to include gas-drop footprint when estimating Bitcoin SPV-vault spendable balance" },
                feeRate: { type: "number", required: false, description: "Manual fee rate override" },
                minFeeRate: { type: "number", required: false, description: "Minimum Bitcoin fee rate to enforce" },
                feeMultiplier: { type: "number", required: false, description: "Multiplier applied to smart-chain native token commit fee estimate" }
            }),
            getSwapStatus: createApiEndpoint<GetSwapStatusInput, GetSwapStatusOutput, "GET">("GET", this.getSwapStatus.bind(this), {
                swapId: { type: "string", required: true, description: "The swap identifier" },
                secret: { type: "string", required: false, description: "Revealed swap secret pre-image (in hexadecimal format) for lightning network swaps" },
                bitcoinAddress: { type: "string", required: false, description: "Bitcoin wallet address to obtain funded PSBT" },
                bitcoinPublicKey: { type: "string", required: false, description: "Bitcoin wallet public key (in hexadecimal format) to obtain funded PSBT" },
                bitcoinFeeRate: { type: "number", required: false, description: "Fee rate to use when creating a funded PSBT" },
                signer: { type: "string", required: false, description: "Alternative different smart chain signer to use for refunds and manual settlement" }
            }),
            submitTransaction: createApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput, "POST">("POST", this.submitTransaction.bind(this), {
                swapId: { type: "string", required: true, description: "The swap identifier" },
                signedTxs: {
                    type: "array",
                    required: true,
                    description: "Array of signed transaction data",
                    items: {type: "string", required: true, description: "Single string-serialized & signed transaction"}
                }
            })
        };
    }

    private txSerializer(chainId: string, tx: any): Promise<string> {
        const chain = (this.swapper._chains as any)[chainId];
        if (chain == null) throw new Error("Unknown chain: " + chainId);
        return chain.chainInterface.serializeTx(tx);
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

    private async createSwap(input: CreateSwapInput): Promise<CreateSwapOutput> {
        const exactIn = input.amountType === "EXACT_IN";

        // Build options from input
        const options: any = {};
        if (input.gasAmount != null) options.gasAmount = input.gasAmount;
        if (input.paymentHash != null) options.paymentHash = Buffer.from(input.paymentHash, "hex");
        if (input.description != null) options.description = input.description;
        if (input.descriptionHash != null) options.descriptionHash = Buffer.from(input.descriptionHash, "hex");
        if (input.expirySeconds != null) options.expirySeconds = input.expirySeconds;

        // swapper.swap() handles routing based on token types
        const swap = await this.swapper.swap(
            input.srcToken,
            input.dstToken,
            input.amount,
            exactIn,
            input.srcAddress,
            input.dstAddress,
            Object.keys(options).length > 0 ? options : undefined
        );

        const {steps, stateInfo} = await swap.getExecutionStatus({skipBuildingAction: true});

        return createSwapOutputBase(swap, steps, stateInfo);
    }

    private validateSwapListInput(input: ListSwapsInput): void {
        if (input.chainId != null && !this.swapper.getSmartChains().includes(input.chainId as any)) {
            throw new Error("Unknown chainId: " + input.chainId);
        }

        if (!this.swapper.Utils.isValidSmartChainAddress(input.signer, input.chainId as any)) {
            throw new Error(
                input.chainId != null
                    ? `Invalid ${input.chainId} signer address: ` + input.signer
                    : `Invalid smart chain signer address: ` + input.signer
            );
        }
    }

    private async createListedSwapOutputs(swaps: ISwap[]): Promise<ListSwapsOutput> {
        return Promise.all(
            swaps
                .filter(swap => swap.getType() !== SwapType.TRUSTED_FROM_BTC)
                .map(async swap => {
                    const {steps, stateInfo} = await swap.getExecutionStatus({skipBuildingAction: true});
                    return createListSwapOutput(swap, steps, stateInfo);
                })
        );
    }

    private async listSwaps(input: ListSwapsInput): Promise<ListSwapsOutput> {
        this.validateSwapListInput(input);

        const swaps = await this.swapper.getAllSwaps(input.chainId as any, input.signer);
        return this.createListedSwapOutputs(swaps);
    }

    private async listActionableSwaps(input: ListActionableSwapsInput): Promise<ListActionableSwapsOutput> {
        this.validateSwapListInput(input);

        const swaps = await this.swapper.getActionableSwaps(input.chainId as any, input.signer);
        return this.createListedSwapOutputs(swaps);
    }

    //TODO: Maybe reload the intermediaries every so often such that when one drops off due to some issue we can reconnect it again, this directly affects the getSupportedTokens endpoint
    private async getSupportedTokens(input: GetSupportedTokensInput): Promise<GetSupportedTokensOutput> {
        return this.swapper.getSupportedTokens(parseSwapSide(input.side)).map(toApiToken);
    }

    private async getSwapCounterTokens(input: GetSwapCounterTokensInput): Promise<GetSwapCounterTokensOutput> {
        const token = this.swapper.getToken(input.token);
        return this.swapper.getSwapCounterTokens(token, parseSwapSide(input.side)).map(toApiToken);
    }

    //TODO: Swap limits might not be populated for non-bitcoin tokens in some routes, we can try to fix this by sending a swap request to probe for swap min/max in those cases
    private async getSwapLimits(input: GetSwapLimitsInput): Promise<GetSwapLimitsOutput> {
        const srcToken = this.swapper.getToken(input.srcToken);
        const dstToken = this.swapper.getToken(input.dstToken);
        const limits = this.swapper.getSwapLimits(srcToken, dstToken);

        return {
            input: {
                min: toApiAmount(limits.input.min),
                ...(limits.input.max != null ? {max: toApiAmount(limits.input.max)} : {})
            },
            output: {
                min: toApiAmount(limits.output.min),
                ...(limits.output.max != null ? {max: toApiAmount(limits.output.max)} : {})
            }
        };
    }

    private async parseAddress(input: ParseAddressInput): Promise<ParseAddressOutput> {
        const result = await this.swapper.Utils.parseAddress(input.address);
        if(result == null) throw new Error("Invalid address");

        return {
            address: result.address,
            type: result.type,
            ...(result.lnurl != null ? {lnurl: toApiLNURL(result.lnurl)} : {}),
            ...(result.min != null ? {min: toApiAmount(result.min)} : {}),
            ...(result.max != null ? {max: toApiAmount(result.max)} : {}),
            ...(result.amount != null ? {amount: toApiAmount(result.amount)} : {})
        };
    }

    private async getSpendableBalance(input: GetSpendableBalanceInput): Promise<GetSpendableBalanceOutput> {
        const token = this.swapper.getToken(input.token);

        if(token.chainId === "LIGHTNING")
            throw new Error("Lightning wallet spendable balance is not supported by this endpoint.");

        if(token.chainId === "BITCOIN") {
            if(input.feeMultiplier != null) throw new Error("`feeMultiplier` is only supported for smart-chain tokens.");
            if(input.targetChain != null && !this.swapper.getSmartChains().includes(input.targetChain as any)) {
                throw new Error("Unknown targetChain: " + input.targetChain);
            }

            if (!this.swapper.Utils.isValidBitcoinAddress(input.wallet))
                throw new Error(`Invalid BITCOIN wallet address: ` + input.wallet);

            const {balance, feeRate} = await this.swapper.Utils.getBitcoinSpendableBalance(input.wallet, input.targetChain as any, {
                gasDrop: input.gasDrop,
                feeRate: input.feeRate,
                minFeeRate: input.minFeeRate
            });

            return {
                balance: toApiAmount(balance),
                feeRate
            };
        }

        if(input.targetChain != null) throw new Error("`targetChain` is only supported for Bitcoin balances.");
        if(input.gasDrop != null) throw new Error("`gasDrop` is only supported for Bitcoin balances.");
        if(input.minFeeRate != null) throw new Error("`minFeeRate` is only supported for Bitcoin balances.");

        if (!this.swapper.Utils.isValidSmartChainAddress(input.wallet, token.chainId))
            throw new Error(`Invalid ${token.chainId} wallet address: ` + input.wallet);

        const balance = await this.swapper.Utils.getSpendableBalance(input.wallet, token as any, {
            feeMultiplier: input.feeMultiplier,
            feeRate: input.feeRate
        });

        return {
            balance: toApiAmount(balance)
        };
    }

    private async getSwapStatus(input: GetSwapStatusInput): Promise<GetSwapStatusOutput> {
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
            } catch (e) {
                throw new Error(`Invalid secret passed, has to be a hexadecimal string!`);
            }
        }

        let bitcoinWallet: MinimalBitcoinWalletInterface | undefined;
        if (input.bitcoinAddress != null && input.bitcoinPublicKey != null) {
            bitcoinWallet = {
                publicKey: input.bitcoinPublicKey,
                address: input.bitcoinAddress
            };
        } else if(input.bitcoinAddress != null || input.bitcoinPublicKey != null) {
            throw new Error("When specifying bitcoin wallet you have to pass both `bitcoinAddress` and `bitcoinPublicKey` params!");
        }

        if (input.bitcoinFeeRate != null) {
            if(isNaN(input.bitcoinFeeRate)) throw new Error("Bitcoin fee rate passed cannot be NaN!");
            if(input.bitcoinFeeRate <= 0) throw new Error("Bitcoin fee rate passed cannot be negative or 0!");
        }

        if(this.config?.syncOnGetStatus) await swap._sync(true);

        const {steps, stateInfo, currentAction} = await swap.getExecutionStatus({
            secret: input.secret,

            bitcoinWallet,
            bitcoinFeeRate: input.bitcoinFeeRate,

            manualSettlementSmartChainSigner: input.signer,
            refundSmartChainSigner: input.signer
        });

        return {
            ...createListSwapOutput(swap, steps, stateInfo),

            currentAction: currentAction ? await serializeAction(currentAction, this.txSerializer.bind(this)) : null,
            requiresSecretReveal: requiresSecretRevealForApi(swap, stateInfo.state),

            escrow: swap instanceof IEscrowSwap && swap._data!=null ? {
                data: swap._data.serialize(),
                initTxId: swap._commitTxId
            } : undefined
        };
    }

    private async submitTransaction(input: SubmitTransactionInput): Promise<SubmitTransactionOutput> {
        const swap = await this.swapper.getSwapById(input.swapId);
        if (swap == null) {
            throw new Error("Swap not found: " + input.swapId);
        }

        return {
            txHashes: await swap._submitExecutionTransactions(input.signedTxs)
        }
    }

}
