import { IUnifiedStorage, QueryParams, UnifiedStorageCompositeIndexes, UnifiedStoredObject } from "../storage/IUnifiedStorage";
import { ISwap } from "../swaps/ISwap";
import { SwapType } from "../enums/SwapType";
import { UnifiedSwapStorageIndexes } from "../storage/UnifiedSwapStorage";
import { LoggerType } from "../utils/Logger";
export type QuerySetCondition = {
    key: string;
    values: Set<any>;
};
/**
 * Browser IndexedDB storage implementation
 *
 * @category Storage
 */
export declare class IndexedDBUnifiedStorage implements IUnifiedStorage<UnifiedSwapStorageIndexes, UnifiedStorageCompositeIndexes> {
    protected readonly logger: LoggerType;
    readonly storageKey: string;
    db?: IDBDatabase;
    constructor(storageKey: string);
    private tryMigrateLocalStorage;
    private tryMigrateOldIndexedDB;
    /**
     * Attempts to migrate the swap database from old implementations (either using prior version of IndexedDB or
     *  Local Storage)
     *
     * NOTE: Reviver also needs to update the swap to the latest version
     *
     * @param storageKeys An array of tuples of storage keys used for the corresponding swap types
     * @param reviver Swap data deserializer
     */
    tryMigrate(storageKeys: [string, SwapType][], reviver: (obj: any) => ISwap): Promise<boolean>;
    private executeTransaction;
    private executeTransactionArr;
    private executeTransactionWithCursor;
    /**
     * @inheritDoc
     */
    init(): Promise<void>;
    /**
     * @inheritDoc
     */
    query(params: Array<Array<QueryParams>>): Promise<Array<UnifiedStoredObject>>;
    /**
     * @internal
     */
    protected querySingle(params: Array<QueryParams>): Promise<Array<UnifiedStoredObject>>;
    /**
     * @inheritDoc
     */
    remove(object: UnifiedStoredObject): Promise<void>;
    /**
     * @inheritDoc
     */
    removeAll(arr: UnifiedStoredObject[]): Promise<void>;
    /**
     * @inheritDoc
     */
    save(object: UnifiedStoredObject): Promise<void>;
    /**
     * @inheritDoc
     */
    saveAll(arr: UnifiedStoredObject[]): Promise<void>;
}
