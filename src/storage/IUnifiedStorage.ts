
/**
 * Params for querying the storage
 *
 * @category Storage
 */
export type QueryParams = {
    /**
     * Key that should be matched
     */
    key: string,
    /**
     * A value that the key needs to have, if an array is passed, the conditions are `OR`-ed
     */
    value: any | any[]
};

/**
 * Base type for stored objects, every storage object MUST have an `id` field
 *
 * @category Storage
 */
export type UnifiedStoredObject = {id: string} & any;

/**
 * Defines simple indexes (for queries that use a single key)
 *
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
 *
 * @category Storage
 */
export type UnifiedStorageCompositeIndexes = readonly {
    keys: readonly string[],
    unique: boolean
}[];

/**
 * Interface for a generic unified storage implementations
 *
 * @category Storage
 */
export interface IUnifiedStorage<I extends UnifiedStorageIndexes, C extends UnifiedStorageCompositeIndexes> {

    /**
     * Initializes the storage with given indexes and composite indexes
     *
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

    /**
     * Saves an object to storage, updating indexes as needed
     * @param value Object to save (must have an id property)
     */
    save(value: UnifiedStoredObject): Promise<void>;

    /**
     * Saves multiple objects to storage in a batch operation
     * @param value Array of objects to save
     */
    saveAll(value: UnifiedStoredObject[]): Promise<void>;

    /**
     * Removes an object from storage
     * @param value Object to remove (must have an id property)
     */
    remove(value: UnifiedStoredObject): Promise<void>;

    /**
     * Removes multiple objects from storage in a batch operation
     * @param value Array of objects to remove
     */
    removeAll(value: UnifiedStoredObject[]): Promise<void>;

}
