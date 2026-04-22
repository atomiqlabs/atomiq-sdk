/**
 * Params for querying the storage
 *
 * @category Storage
 */
export type QueryParams = {
    /**
     * Key that should be matched
     */
    key: string;
    /**
     * A value that the key needs to have, if an array is passed, the conditions are `OR`-ed
     */
    value: any | any[];
};
/**
 * Base type for stored objects, every storage object MUST have an `id` field. The object might also specify a `_meta`
 *  field which gets carried to the delete/save operations (and can be used to implement optimistic concurrency)
 *
 * @category Storage
 */
export type UnifiedStoredObject = {
    id: string;
    _meta?: any;
} & any;
/**
 * Defines simple indexes (for queries that use a single key)
 *
 * @category Storage
 */
export type UnifiedStorageIndexes = readonly {
    key: string;
    type: "number" | "string" | "boolean";
    unique: boolean;
    nullable: boolean;
}[];
/**
 * Defines composite indexes (for queries that use multiple keys)
 *
 * @category Storage
 */
export type UnifiedStorageCompositeIndexes = readonly {
    keys: readonly string[];
    unique: boolean;
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
     *
     * You can also add an optional `_meta` field in the returned unified storage object which gets attached to that
     *  returned object and will be present for subsequent saves and removal of this object, if you specify the `_meta`
     *  field here, you need to explicitly handle it in the all the saving and remove functions and not simply serialize
     *  it into the storage
     *
     * @param params
     */
    query(params: Array<Array<QueryParams>>): Promise<Array<UnifiedStoredObject>>;
    /**
     * Saves an object to storage, updating indexes as needed
     *
     * If the object contains a `_meta` field, this will be also present in the to-be-saved value, to mutate the `_meta`
     *  field of the object that is saved, you can mutate the `_meta` field directly on the passed value, which then
     *  gets reflected automatically in the existing object.
     *
     * @param value Object to save (must have an id property)
     */
    save(value: UnifiedStoredObject): Promise<void>;
    /**
     * Saves multiple objects to storage in a batch operation
     *
     * If the objects contain a `_meta` field, this will be also present in the to-be-saved values, to mutate the `_meta`
     *  field of the objects that are saved, you can mutate the `_meta` field directly on the passed values, which then
     *  gets reflected automatically in the existing objects.
     *
     * @param value Array of objects to save
     * @param lenient In lenient mode the persistency layer doesn't throw on individual swap failures due to
     *  optimistic concurrency, or other (implementation specific), this flag is to be used when the saving of the swap
     *  isn't mission-critical for executing next steps (e.g. in tick or sync loops)
     */
    saveAll(value: UnifiedStoredObject[], lenient?: boolean): Promise<void>;
    /**
     * Removes an object from storage
     *
     * If the object contains a `_meta` field, this will be also present in the to-be-removed value, to mutate the `_meta`
     *  field of the object that is saved, you can mutate the `_meta` field directly on the passed value, which then
     *  gets reflected automatically in the existing object.
     *
     * @param value Object to remove (must have an id property)
     */
    remove(value: UnifiedStoredObject): Promise<void>;
    /**
     * Removes multiple objects from storage in a batch operation
     *
     * If the objects contain a `_meta` field, this will be also present in the to-be-removed values, to mutate the `_meta`
     *  field of the objects that are saved, you can mutate the `_meta` field directly on the passed values, which then
     *  gets reflected automatically in the existing objects.
     *
     * @param value Array of objects to remove
     * @param lenient In lenient mode the persistency layer doesn't throw on individual swap failures due to
     *  optimistic concurrency, or other (implementation specific), this flag is to be used when the saving of the swap
     *  isn't mission-critical for executing next steps (e.g. in tick or sync loops)
     */
    removeAll(value: UnifiedStoredObject[], lenient?: boolean): Promise<void>;
}
