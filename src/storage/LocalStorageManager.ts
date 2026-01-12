/**
 * @module Storage
 * Storage implementations for persisting swap data.
 */

import {IStorageManager, StorageObject} from "@atomiqlabs/base";

/**
 * Storage manager using browser's localStorage API.
 * Suitable for web applications running in the browser.
 *
 * @category Storage
 *
 * @example
 * ```typescript
 * // Used automatically by SwapperFactory in browser environments
 * const swapper = await factory.newSwapperInitialized({
 *   chains: { SOLANA: { rpcUrl: "..." } },
 *   // LocalStorageManager is the default
 * });
 *
 * // Or use explicitly
 * const storage = new LocalStorageManager<SwapData>("atomiq-swaps");
 * await storage.init();
 * ```
 *
 * @typeParam T - Type of objects to store (must extend StorageObject)
 */
export class LocalStorageManager<T extends StorageObject> implements IStorageManager<T> {

    /** @internal */
    storageKey: string;

    /** @internal */
    rawData: {
        [hash: string]: any
    } = {};

    /** @internal */
    data: {
        [hash: string]: T
    } = {};

    /**
     * Creates a new LocalStorageManager.
     *
     * @param storageKey - Key to use in localStorage
     */
    constructor(storageKey: string) {
        this.storageKey = storageKey;
    }

    /**
     * Initializes the storage manager by loading existing data from localStorage.
     */
    init(): Promise<void> {
        const completedTxt = window.localStorage.getItem(this.storageKey);
        if(completedTxt!=null) {
            this.rawData = JSON.parse(completedTxt);
            if(this.rawData==null) this.rawData = {};
        } else {
            this.rawData = {};
        }
        return Promise.resolve();
    }

    /**
     * Saves a single object to storage.
     *
     * @param hash - Unique identifier for the object
     * @param object - Object to save
     */
    saveData(hash: string, object: T): Promise<void> {
        this.data[hash] = object;
        this.rawData[hash] = object.serialize();

        return this.save();
    }

    /**
     * Saves multiple objects to storage in a single operation.
     *
     * @param arr - Array of objects with their IDs
     */
    saveDataArr(arr: {id: string, object: T}[]): Promise<void> {
        arr.forEach(e => {
            this.data[e.id] = e.object;
            this.rawData[e.id] = e.object.serialize();
        })

        return this.save();
    }

    /**
     * Removes a single object from storage.
     *
     * @param hash - Unique identifier of the object to remove
     */
    removeData(hash: string): Promise<void> {
        if(this.rawData[hash]!=null) {
            if(this.data[hash]!=null) delete this.data[hash];
            delete this.rawData[hash];
            return this.save();
        }
        return Promise.resolve();
    }

    /**
     * Removes multiple objects from storage.
     *
     * @param hashArr - Array of unique identifiers to remove
     */
    removeDataArr(hashArr: string[]): Promise<void> {
        hashArr.forEach(hash => {
            if(this.rawData[hash]!=null) {
                if(this.data[hash]!=null) delete this.data[hash];
                delete this.rawData[hash];
            }
        });
        return this.save();
    }

    /**
     * Loads all stored objects and deserializes them.
     *
     * @param type - Constructor for deserializing objects
     * @returns Array of deserialized objects
     */
    loadData(type: new (data: any) => T): Promise<T[]> {
        return Promise.resolve(
            Object.keys(this.rawData).map(e => {
                const deserialized = new type(this.rawData[e]);
                this.data[e] = deserialized;
                return deserialized;
            })
        );
    }

    /** @internal */
    private save(): Promise<void> {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.rawData));
        return Promise.resolve();
    }
}
