import { MultiChain, Swapper } from "../swapper/Swapper";
import { ApiEndpoint } from "./ApiTypes";
import { ListActionableSwapsInput, ListActionableSwapsOutput, CreateSwapInput, CreateSwapOutput, GetSwapStatusInput, GetSwapStatusOutput, GetSupportedTokensInput, GetSupportedTokensOutput, GetSwapCounterTokensInput, GetSwapCounterTokensOutput, GetSwapLimitsInput, GetSwapLimitsOutput, GetSpendableBalanceInput, GetSpendableBalanceOutput, ListSwapsInput, ListSwapsOutput, ParseAddressInput, ParseAddressOutput, SubmitTransactionInput, SubmitTransactionOutput } from "./ApiEndpoints";
export type SwapperApiConfig = {
    syncOnGetStatus?: boolean;
};
export declare class SwapperApi<T extends MultiChain> {
    private swapper;
    private readonly config?;
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
    constructor(swapper: Swapper<T>, config?: SwapperApiConfig | undefined);
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
    private parseAddress;
    private getSpendableBalance;
    private getSwapStatus;
    private submitTransaction;
}
