/**
 * @module Storage
 * Storage implementations for persisting swap data.
 */

import {StorageObject, IStorageManager} from "@atomiqlabs/base";
import * as fs from "fs/promises";

/**
 * Storage manager using the local filesystem.
 * Suitable for Node.js applications and server-side usage.
 * Creates a separate JSON file for each stored object.
 *
 * @category Storage
 *
 * @example
 * ```typescript
 * import { FileSystemStorageManager } from "@atomiqlabs/sdk/fs-storage";
 *
 * const swapper = await factory.newSwapperInitialized({
 *   chains: { SOLANA: { rpcUrl: "..." } },
 *   chainStorageCtor: (name) => new FileSystemStorageManager(`./data/${name}`)
 * });
 * ```
 *
 * @typeParam T - Type of objects to store (must extend StorageObject)
 */
export class FileSystemStorageManager<T extends StorageObject> implements IStorageManager<T> {

    /** @internal */
    private readonly directory: string;

    /** @internal */
    data: {
        [key: string]: T
    } = {};

    /**
     * Creates a new FileSystemStorageManager.
     *
     * @param directory - Directory path where files will be stored
     */
    constructor(directory: string) {
        this.directory = directory;
    }

    /**
     * Initializes the storage manager by creating the directory if needed.
     */
    async init(): Promise<void> {
        try {
            await fs.mkdir(this.directory);
        } catch (e) {}
    }

    /**
     * Saves an object to a JSON file.
     *
     * @param hash - Unique identifier (used as filename)
     * @param object - Object to save
     */
    async saveData(hash: string, object: T): Promise<void> {

        try {
            await fs.mkdir(this.directory)
        } catch (e) {}

        this.data[hash] = object;

        const cpy = object.serialize();

        await fs.writeFile(this.directory+"/"+hash+".json", JSON.stringify(cpy));

    }

    /**
     * Removes an object's JSON file from storage.
     *
     * @param hash - Unique identifier of the object to remove
     */
    async removeData(hash: string): Promise<void> {
        const paymentHash = hash;
        try {
            if(this.data[paymentHash]!=null) delete this.data[paymentHash];
            await fs.rm(this.directory+"/"+paymentHash+".json");
        } catch (e) {
            console.error("FileSystemStorageManager: removeData(): Error: ", e);
        }
    }

    /**
     * Loads all stored objects from the directory.
     *
     * @param type - Constructor for deserializing objects
     * @returns Array of deserialized objects
     */
    async loadData(type: new(data: any) => T): Promise<T[]> {
        let files;
        try {
            files = await fs.readdir(this.directory);
        } catch (e) {
            console.error("FileSystemStorageManager: loadData(): Error: ", e);
            return [];
        }

        const arr = [];

        for(let file of files) {
            const paymentHash = file.split(".")[0];
            const result = await fs.readFile(this.directory+"/"+file);
            const obj = JSON.parse(result.toString());
            const parsed = new type(obj);
            arr.push(parsed);
            this.data[paymentHash] = parsed;
        }

        return arr;
    }

}
