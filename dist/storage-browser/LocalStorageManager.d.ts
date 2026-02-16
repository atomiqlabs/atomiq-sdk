import { IStorageManager, StorageObject } from "@atomiqlabs/base";
/**
 * {@link IStorageManager} implementation using browser's local storage API, this is used as general purpose
 *  key-value storage, not used for storing swaps! See {@link IUnifiedStorage} for swap storage interface.
 *
 * @category Storage
 */
export declare class LocalStorageManager<T extends StorageObject> implements IStorageManager<T> {
    storageKey: string;
    rawData: {
        [hash: string]: any;
    };
    data: {
        [hash: string]: T;
    };
    /**
     * @param storageKey The key-value store is stored as JSON serialized parameter of the Local Storage under
     *  the specified `storageKey`
     */
    constructor(storageKey: string);
    /**
     * @inheritDoc
     */
    init(): Promise<void>;
    /**
     * @inheritDoc
     */
    saveData(hash: string, object: T): Promise<void>;
    /**
     * @inheritDoc
     */
    saveDataArr(arr: {
        id: string;
        object: T;
    }[]): Promise<void>;
    /**
     * @inheritDoc
     */
    removeData(hash: string): Promise<void>;
    /**
     * @inheritDoc
     */
    removeDataArr(hashArr: string[]): Promise<void>;
    /**
     * @inheritDoc
     */
    loadData(type: new (data: any) => T): Promise<T[]>;
    private save;
}
