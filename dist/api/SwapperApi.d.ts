import { MultiChain, Swapper } from "../swapper/Swapper";
import { ApiEndpoint } from "./ApiTypes";
import { CreateSwapInput, CreateSwapOutput, GetSwapStatusInput, GetSwapStatusOutput, SubmitTransactionInput, SubmitTransactionOutput } from "./ApiEndpoints";
export declare class SwapperApi<T extends MultiChain> {
    private swapper;
    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, CreateSwapOutput, "POST">;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, GetSwapStatusOutput, "GET">;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput, "POST">;
    };
    constructor(swapper: Swapper<T>);
    private txSerializer;
    init(): Promise<void>;
    poll(): Promise<void>;
    sync(): Promise<void>;
    private createSwap;
    private getSwapStatus;
    private submitTransaction;
}
