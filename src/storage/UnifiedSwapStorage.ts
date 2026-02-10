import {ChainType} from "@atomiqlabs/base";
import {IUnifiedStorage, QueryParams} from "./IUnifiedStorage";
import {ISwap} from "../swaps/ISwap";

import {getLogger} from "../utils/Logger";

const logger = getLogger("UnifiedSwapStorage: ");

const indexes = [
    {key: "id", type: "string", unique: true, nullable: false},
    {key: "escrowHash", type: "string", unique: true, nullable: true},
    {key: "type", type: "number", unique: false, nullable: false},
    {key: "initiator", type: "string", unique: false, nullable: false},
    {key: "state", type: "number", unique: false, nullable: false},
    {key: "paymentHash", type: "string", unique: false, nullable: true},
] as const;
/**
 * Simple index types for SDK swap storage
 *
 * @category Storage
 */
export type UnifiedSwapStorageIndexes = typeof indexes;

const compositeIndexes = [
    {keys: ["initiator", "id"], unique: false},
    {keys: ["type", "state"], unique: false},
    {keys: ["type", "paymentHash"], unique: false},
    {keys: ["type", "initiator", "state"], unique: false}
] as const;
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
export class UnifiedSwapStorage<T extends ChainType> {

    readonly storage: IUnifiedStorage<UnifiedSwapStorageIndexes, UnifiedSwapStorageCompositeIndexes>;
    readonly weakRefCache: Map<string, WeakRef<ISwap<T>>> = new Map();
    readonly noWeakRefMap?: boolean;

    /**
     * @param storage Underlying storage persistence layer
     * @param noWeakRefMap Whether to disable caching of the swap objects in the weak ref map, this
     *  should be set when you need multiple different clients accessing the same swap database (such
     *  as when running the SDK in a serverless environment like AWS or Azure)
     */
    constructor(storage: IUnifiedStorage<UnifiedSwapStorageIndexes, UnifiedSwapStorageCompositeIndexes>, noWeakRefMap?: boolean) {
        this.storage = storage;
        this.noWeakRefMap = noWeakRefMap;
    }

    /**
     * Initializes the underlying storage
     */
    init(): Promise<void> {
        return this.storage.init(indexes, compositeIndexes);
    }

    /**
     * Params are specified in the following way:
     *  - [[condition1, condition2]] - returns all rows where condition1 AND condition2 is met
     *  - [[condition1], [condition2]] - returns all rows where condition1 OR condition2 is met
     *  - [[condition1, condition2], [condition3]] - returns all rows where (condition1 AND condition2) OR condition3 is met
     * @param params
     * @param reviver
     */
    async query<S extends ISwap<T>>(params: Array<Array<QueryParams>>, reviver: (obj: any) => S | null | undefined): Promise<Array<S>> {
        const rawSwaps = await this.storage.query(params);

        const result: Array<S> = [];
        rawSwaps.forEach(rawObj => {
            if(!this.noWeakRefMap) {
                const savedRef = this.weakRefCache.get(rawObj.id)?.deref();
                if(savedRef!=null) {
                    result.push(savedRef as S);
                    return;
                }
                logger.debug("query(): Reviving new swap instance: "+rawObj.id);
            }
            const value = reviver(rawObj);
            if(value==null) return;
            if(!this.noWeakRefMap) this.weakRefCache.set(rawObj.id, new WeakRef<ISwap<T>>(value));
            result.push(value);
        });

        return result;
    }

    /**
     * Saves the swap to storage, updating indexes as needed
     *
     * @param value Swap to save
     */
    save<S extends ISwap<T>>(value: S): Promise<void> {
        if(!this.noWeakRefMap) this.weakRefCache.set(value.getId(), new WeakRef<ISwap<T>>(value));
        return this.storage.save(value.serialize());
    }

    /**
     * Saves multiple swaps to storage in a batch operation
     * @param values Array of swaps to save
     */
    saveAll<S extends ISwap<T>>(values: S[]): Promise<void> {
        if(!this.noWeakRefMap) values.forEach(value => this.weakRefCache.set(value.getId(), new WeakRef<ISwap<T>>(value)));
        return this.storage.saveAll(values.map(obj => obj.serialize()));
    }

    /**
     * Removes a swap from storage
     * @param value Swap to remove
     */
    remove<S extends ISwap<T>>(value: S): Promise<void> {
        if(!this.noWeakRefMap) this.weakRefCache.delete(value.getId());
        return this.storage.remove(value.serialize());
    }

    /**
     * Removes multiple swaps from storage in a batch operation
     * @param values Array of swaps to remove
     */
    removeAll<S extends ISwap<T>>(values: S[]): Promise<void> {
        if(!this.noWeakRefMap) values.forEach(value => this.weakRefCache.delete(value.getId()));
        return this.storage.removeAll(values.map(obj => obj.serialize()));
    }

}
