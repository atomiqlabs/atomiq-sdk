import { ChainEvent, ChainType } from "@atomiqlabs/base";
import { ISwap } from "../swaps/ISwap";
import { SwapType } from "../enums/SwapType";
import { UnifiedSwapStorage } from "../storage/UnifiedSwapStorage";
export type SwapEventListener<T extends ChainType, S extends ISwap<T>> = (event: ChainEvent<T["Data"]>, swap: S) => Promise<void>;
export declare class UnifiedSwapEventListener<T extends ChainType> {
    readonly storage: UnifiedSwapStorage<T>;
    readonly events: T["Events"];
    readonly listeners: {
        [key in SwapType]?: {
            listener: SwapEventListener<T, any>;
            reviver: new (obj: any) => ISwap<T>;
        };
    };
    constructor(unifiedStorage: UnifiedSwapStorage<T>, events: T["Events"]);
    processEvents(events: ChainEvent<T["Data"]>[]): Promise<void>;
    private noAutomaticPoll?;
    private listener?;
    start(noAutomaticPoll?: boolean): Promise<void>;
    poll(previousState: any): Promise<any>;
    stop(): Promise<void>;
    registerListener<S extends ISwap<T>>(type: SwapType, listener: SwapEventListener<T, S>, reviver: new (val: any) => S): void;
    unregisterListener(type: SwapType): boolean;
}
