
/**
 * Query parameters for storage operations
 * @category Storage
 */
export type QueryParams = {
    key: string,
    value: any | any[]
};

/**
 * Base type for stored objects
 * @category Storage
 */
export type UnifiedStoredObject = {id: string} & any;

/**
 * Defines simple indexes (for queries that use a single key)
 * @category Storage
 */
export type UnifiedStorageIndexes = readonly {
    key: string,
    type: "number" | "string" | "boolean",
    unique: boolean,
    nullable: boolean
}[];

/**
 * Defines composite indexes (for queries that use multiple keys)
 * @category Storage
 */
export type UnifiedStorageCompositeIndexes = readonly {
    keys: readonly string[],
    unique: boolean
}[];

/**
 * Interface for unified storage implementations
 * @category Storage
 */
export interface IUnifiedStorage<I extends UnifiedStorageIndexes, C extends UnifiedStorageCompositeIndexes> {

    /**
     * Initializes the storage with given indexes and composite indexes
     * @param indexes
     * @param compositeIndexes
     */
    init(indexes: I, compositeIndexes: C): Promise<void>;

    /**
     * Params are specified in the following way:
     *  - [[condition1, condition2]] - returns all rows where condition1 AND condition2 is met
     *  - [[condition1], [condition2]] - returns all rows where condition1 OR condition2 is met
     *  - [[condition1, condition2], [condition3]] - returns all rows where (condition1 AND condition2) OR condition3 is met
     * @param params
     */
    query(params: Array<Array<QueryParams>>): Promise<Array<UnifiedStoredObject>>;

    save(value: UnifiedStoredObject): Promise<void>;

    saveAll(value: UnifiedStoredObject[]): Promise<void>;

    remove(value: UnifiedStoredObject): Promise<void>;

    removeAll(value: UnifiedStoredObject[]): Promise<void>;

}
