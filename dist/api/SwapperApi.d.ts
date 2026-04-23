import { MultiChain, Swapper } from "../swapper/Swapper";
import { ApiEndpoint } from "./ApiTypes";
import { CreateSwapInput, CreateSwapOutput, GetSpendableBalanceInput, GetSpendableBalanceOutput, GetSupportedTokensInput, GetSupportedTokensOutput, GetSwapCounterTokensInput, GetSwapCounterTokensOutput, GetSwapLimitsInput, GetSwapLimitsOutput, GetSwapStatusInput, GetSwapStatusOutput, ListPendingSwapsInput, ListPendingSwapsOutput, ListSwapsInput, ListSwapsOutput, ParseAddressInput, ParseAddressOutput, SettleWithLnurlInput, SettleWithLnurlOutput, SubmitTransactionInput, SubmitTransactionOutput } from "./ApiEndpoints";
export type SwapperApiConfig = {
    syncOnGetStatus?: boolean;
};
export declare class SwapperApi<T extends MultiChain> {
    private swapper;
    private readonly config?;
    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, CreateSwapOutput, "POST">;
        listSwaps: ApiEndpoint<ListSwapsInput, ListSwapsOutput, "GET">;
        listPendingSwaps: ApiEndpoint<ListPendingSwapsInput, ListPendingSwapsOutput, "GET">;
        getSupportedTokens: ApiEndpoint<GetSupportedTokensInput, GetSupportedTokensOutput, "GET">;
        getSwapCounterTokens: ApiEndpoint<GetSwapCounterTokensInput, GetSwapCounterTokensOutput, "GET">;
        getSwapLimits: ApiEndpoint<GetSwapLimitsInput, GetSwapLimitsOutput, "GET">;
        parseAddress: ApiEndpoint<ParseAddressInput, ParseAddressOutput, "GET">;
        getSpendableBalance: ApiEndpoint<GetSpendableBalanceInput, GetSpendableBalanceOutput, "GET">;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, GetSwapStatusOutput, "GET">;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput, "POST">;
        settleWithLnurl: ApiEndpoint<SettleWithLnurlInput, SettleWithLnurlOutput, "POST">;
    };
    constructor(swapper: Swapper<T>, config?: SwapperApiConfig | undefined);
    private txSerializer;
    init(): Promise<void>;
    /**
     * Should be ran periodically, this synchronizes the swap's state with the on-chain data and also purges
     *  expired swaps from the persistent storage
     */
    sync(): Promise<void>;
    /**
     * Optionally good to run this periodically, such that any LPs that are dropped off because they are unresponsive
     *  can be found again.
     */
    reloadLps(): Promise<void>;
    private createSwap;
    private validateSwapListInput;
    private createListedSwapOutputs;
    private listSwaps;
    private listPendingSwaps;
    private getSupportedTokens;
    private getSwapCounterTokens;
    private getSwapLimits;
    private parseAddress;
    private getSpendableBalance;
    private getSwapStatus;
    private submitTransaction;
    private settleWithLnurl;
}
