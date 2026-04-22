"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiedSwapStorage = void 0;
const Logger_1 = require("../utils/Logger");
const logger = (0, Logger_1.getLogger)("UnifiedSwapStorage: ");
const indexes = [
    { key: "id", type: "string", unique: true, nullable: false },
    { key: "escrowHash", type: "string", unique: true, nullable: true },
    { key: "type", type: "number", unique: false, nullable: false },
    { key: "initiator", type: "string", unique: false, nullable: false },
    { key: "state", type: "number", unique: false, nullable: false },
    { key: "paymentHash", type: "string", unique: false, nullable: true },
];
const compositeIndexes = [
    { keys: ["initiator", "id"], unique: false },
    { keys: ["type", "state"], unique: false },
    { keys: ["type", "paymentHash"], unique: false },
    { keys: ["type", "initiator", "state"], unique: false }
];
/**
 * Unified swap persistence layer for the SDK utilizing an underlying {@link IUnifiedStorage} instance
 *  with optional in-memory caching via weak refs {@link WeakRef}
 *
 * @category Storage
 */
class UnifiedSwapStorage {
    /**
     * @param storage Underlying storage persistence layer
     * @param noWeakRefMap Whether to disable caching of the swap objects in the weak ref map, this
     *  should be set when you need multiple different clients accessing the same swap database (such
     *  as when running the SDK in a serverless environment like AWS or Azure)
     */
    constructor(storage, noWeakRefMap) {
        this.weakRefCache = new Map();
        this.storage = storage;
        this.noWeakRefMap = noWeakRefMap;
    }
    /**
     * Initializes the underlying storage
     */
    init() {
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
    async query(params, reviver) {
        const rawSwaps = await this.storage.query(params);
        const result = [];
        rawSwaps.forEach(rawObj => {
            if (!this.noWeakRefMap) {
                const savedRef = this.weakRefCache.get(rawObj.id)?.deref();
                if (savedRef != null) {
                    result.push(savedRef);
                    return;
                }
                logger.debug("query(): Reviving new swap instance: " + rawObj.id);
            }
            const value = reviver(rawObj);
            if (value == null)
                return;
            value._persisted = true;
            if (!this.noWeakRefMap)
                this.weakRefCache.set(rawObj.id, new WeakRef(value));
            result.push(value);
        });
        return result;
    }
    /**
     * Saves the swap to storage, updating indexes as needed
     *
     * @param value Swap to save
     */
    async save(value) {
        if (!this.noWeakRefMap)
            this.weakRefCache.set(value.getId(), new WeakRef(value));
        const serialized = value.serialize();
        await this.storage.save(serialized);
        value._meta = serialized._meta;
        value._persisted = true;
    }
    /**
     * Saves multiple swaps to storage in a batch operation
     * @param values Array of swaps to save
     * @param lenient In lenient mode the underlying persistent layer doesn't throw on individual swap failures due to
     *  optimistic concurrency, or other (implementation specific), this flag is to be used when the saving of the swap
     *  isn't mission-critical for executing next steps (e.g. in tick or sync loops)
     */
    async saveAll(values, lenient) {
        if (!this.noWeakRefMap)
            values.forEach(value => this.weakRefCache.set(value.getId(), new WeakRef(value)));
        const serialized = values.map(obj => obj.serialize());
        await this.storage.saveAll(serialized, lenient);
        values.forEach((value, index) => {
            value._meta = serialized[index]._meta;
            value._persisted = true;
        });
    }
    /**
     * Removes a swap from storage
     * @param value Swap to remove
     */
    async remove(value) {
        if (!this.noWeakRefMap)
            this.weakRefCache.delete(value.getId());
        const serialized = value.serialize();
        await this.storage.remove(serialized);
        value._meta = serialized._meta;
        value._persisted = false;
    }
    /**
     * Removes multiple swaps from storage in a batch operation
     * @param values Array of swaps to remove
     * @param lenient In lenient mode the underlying persistent layer doesn't throw on individual swap failures due to
     *  optimistic concurrency, or other (implementation specific), this flag is to be used when the saving of the swap
     *  isn't mission-critical for executing next steps (e.g. in tick or sync loops)
     */
    async removeAll(values, lenient) {
        if (!this.noWeakRefMap)
            values.forEach(value => this.weakRefCache.delete(value.getId()));
        const serialized = values.map(obj => obj.serialize());
        await this.storage.removeAll(serialized, lenient);
        values.forEach((value, index) => {
            value._meta = serialized[index]._meta;
            value._persisted = false;
        });
    }
}
exports.UnifiedSwapStorage = UnifiedSwapStorage;
