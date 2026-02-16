import { ChainType } from "@atomiqlabs/base";
import { IUnifiedStorage, QueryParams } from "./IUnifiedStorage";
import { ISwap } from "../swaps/ISwap";
declare const indexes: readonly [{
    readonly key: "id";
    readonly type: "string";
    readonly unique: true;
    readonly nullable: false;
}, {
    readonly key: "escrowHash";
    readonly type: "string";
    readonly unique: true;
    readonly nullable: true;
}, {
    readonly key: "type";
    readonly type: "number";
    readonly unique: false;
    readonly nullable: false;
}, {
    readonly key: "initiator";
    readonly type: "string";
    readonly unique: false;
    readonly nullable: false;
}, {
    readonly key: "state";
    readonly type: "number";
    readonly unique: false;
    readonly nullable: false;
}, {
    readonly key: "paymentHash";
    readonly type: "string";
    readonly unique: false;
    readonly nullable: true;
}];
/**
 * Simple index types for SDK swap storage
 *
 * @category Storage
 */
export type UnifiedSwapStorageIndexes = typeof indexes;
declare const compositeIndexes: readonly [{
    readonly keys: readonly ["initiator", "id"];
    readonly unique: false;
}, {
    readonly keys: readonly ["type", "state"];
    readonly unique: false;
}, {
    readonly keys: readonly ["type", "paymentHash"];
    readonly unique: false;
}, {
    readonly keys: readonly ["type", "initiator", "state"];
    readonly unique: false;
}];
/**
 * Composite index types for SDK swap storage
 *
 * @category Storage
 */
export type UnifiedSwapStorageCompositeIndexes = typeof compositeIndexes;
/**
 * Unified swap persistence layer for the SDK utilizing an underlying {@link IUnifiedStorage} instance
 *  with optional in-memory caching via weak refs {@link WeakRef}
 *
 * @category Storage
 */
export declare class UnifiedSwapStorage<T extends ChainType> {
    readonly storage: IUnifiedStorage<UnifiedSwapStorageIndexes, UnifiedSwapStorageCompositeIndexes>;
    readonly weakRefCache: Map<string, WeakRef<ISwap<T>>>;
    readonly noWeakRefMap?: boolean;
    /**
     * @param storage Underlying storage persistence layer
     * @param noWeakRefMap Whether to disable caching of the swap objects in the weak ref map, this
     *  should be set when you need multiple different clients accessing the same swap database (such
     *  as when running the SDK in a serverless environment like AWS or Azure)
     */
    constructor(storage: IUnifiedStorage<UnifiedSwapStorageIndexes, UnifiedSwapStorageCompositeIndexes>, noWeakRefMap?: boolean);
    /**
     * Initializes the underlying storage
     */
    init(): Promise<void>;
    /**
     * Params are specified in the following way:
     *  - [[condition1, condition2]] - returns all rows where condition1 AND condition2 is met
     *  - [[condition1], [condition2]] - returns all rows where condition1 OR condition2 is met
     *  - [[condition1, condition2], [condition3]] - returns all rows where (condition1 AND condition2) OR condition3 is met
     * @param params
     * @param reviver
     */
    query<S extends ISwap<T>>(params: Array<Array<QueryParams>>, reviver: (obj: any) => S | null | undefined): Promise<Array<S>>;
    /**
     * Saves the swap to storage, updating indexes as needed
     *
     * @param value Swap to save
     */
    save<S extends ISwap<T>>(value: S): Promise<void>;
    /**
     * Saves multiple swaps to storage in a batch operation
     * @param values Array of swaps to save
     */
    saveAll<S extends ISwap<T>>(values: S[]): Promise<void>;
    /**
     * Removes a swap from storage
     * @param value Swap to remove
     */
    remove<S extends ISwap<T>>(value: S): Promise<void>;
    /**
     * Removes multiple swaps from storage in a batch operation
     * @param values Array of swaps to remove
     */
    removeAll<S extends ISwap<T>>(values: S[]): Promise<void>;
}
export {};
