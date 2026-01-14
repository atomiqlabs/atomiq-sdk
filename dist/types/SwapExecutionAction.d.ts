import { ChainType } from "@atomiqlabs/base";
export type SwapExecutionAction<T extends ChainType> = {
    name: "Payment" | "Commit" | "Claim";
    description: string;
    chain: "LIGHTNING" | "BITCOIN" | T["ChainId"];
    txs: any[];
};
