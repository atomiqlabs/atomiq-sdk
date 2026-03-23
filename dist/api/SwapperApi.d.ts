import { MultiChain, Swapper } from "../swapper/Swapper";
import { ApiEndpoint, CreateSwapInput, GetSwapStatusInput, SubmitTransactionInput, SubmitTransactionOutput, SwapStatusResponse } from "./ApiTypes";
export declare class SwapperApi<T extends MultiChain> {
    private swapper;
    readonly endpoints: {
        createSwap: ApiEndpoint<CreateSwapInput, SwapStatusResponse>;
        getSwapStatus: ApiEndpoint<GetSwapStatusInput, SwapStatusResponse>;
        submitTransaction: ApiEndpoint<SubmitTransactionInput, SubmitTransactionOutput>;
    };
    constructor(swapper: Swapper<T>);
    private getTxSerializer;
    init(): Promise<void>;
    poll(): Promise<void>;
    sync(): Promise<void>;
    private createSwap;
    private getSwapStatus;
    private submitTransaction;
}
