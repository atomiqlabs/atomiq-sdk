import { MultiChain, Swapper } from "../swapper/Swapper";
import { ApiEndpoint } from "./ApiTypes";
import { ListActionableSwapsInput, ListActionableSwapsOutput, CreateSwapInput, CreateSwapOutput, GetSwapStatusInput, GetSwapStatusOutput, GetSupportedTokensInput, GetSupportedTokensOutput, GetSwapCounterTokensInput, GetSwapCounterTokensOutput, GetSwapLimitsInput, GetSwapLimitsOutput, ListSwapsInput, ListSwapsOutput, SubmitTransactionInput, SubmitTransactionOutput } from "./ApiEndpoints";
export declare class SwapperApi<T extends MultiChain> {
    private swapper;
    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, CreateSwapOutput, "POST">;
        listSwaps: ApiEndpoint<ListSwapsInput, ListSwapsOutput, "GET">;
        listActionableSwaps: ApiEndpoint<ListActionableSwapsInput, ListActionableSwapsOutput, "GET">;
        getSupportedTokens: ApiEndpoint<GetSupportedTokensInput, GetSupportedTokensOutput, "GET">;
        getSwapCounterTokens: ApiEndpoint<GetSwapCounterTokensInput, GetSwapCounterTokensOutput, "GET">;
        getSwapLimits: ApiEndpoint<GetSwapLimitsInput, GetSwapLimitsOutput, "GET">;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, GetSwapStatusOutput, "GET">;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput, "POST">;
    };
    constructor(swapper: Swapper<T>);
    private txSerializer;
    init(): Promise<void>;
    poll(): Promise<void>;
    sync(): Promise<void>;
    private createSwap;
    private validateSwapListInput;
    private createListedSwapOutputs;
    private listSwaps;
    private listActionableSwaps;
    private getSupportedTokens;
    private getSwapCounterTokens;
    private getSwapLimits;
    private getSwapStatus;
    private submitTransaction;
}
