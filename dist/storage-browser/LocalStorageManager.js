"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageManager = void 0;
/**
 * {@link IStorageManager} implementation using browser's local storage API, this is used as general purpose
 *  key-value storage, not used for storing swaps! See {@link IUnifiedStorage} for swap storage interface.
 *
 * @category Storage
 */
class LocalStorageManager {
    /**
     * @param storageKey The key-value store is stored as JSON serialized parameter of the Local Storage under
     *  the specified `storageKey`
     */
    constructor(storageKey) {
        this.rawData = {};
        this.data = {};
        this.storageKey = storageKey;
    }
    /**
     * @inheritDoc
     */
    init() {
        const completedTxt = window.localStorage.getItem(this.storageKey);
        if (completedTxt != null) {
            this.rawData = JSON.parse(completedTxt);
            if (this.rawData == null)
                this.rawData = {};
        }
        else {
            this.rawData = {};
        }
        return Promise.resolve();
    }
    /**
     * @inheritDoc
     */
    saveData(hash, object) {
        this.data[hash] = object;
        this.rawData[hash] = object.serialize();
        return this.save();
    }
    /**
     * @inheritDoc
     */
    saveDataArr(arr) {
        arr.forEach(e => {
            this.data[e.id] = e.object;
            this.rawData[e.id] = e.object.serialize();
        });
        return this.save();
    }
    /**
     * @inheritDoc
     */
    removeData(hash) {
        if (this.rawData[hash] != null) {
            if (this.data[hash] != null)
                delete this.data[hash];
            delete this.rawData[hash];
            return this.save();
        }
        return Promise.resolve();
    }
    /**
     * @inheritDoc
     */
    removeDataArr(hashArr) {
        hashArr.forEach(hash => {
            if (this.rawData[hash] != null) {
                if (this.data[hash] != null)
                    delete this.data[hash];
                delete this.rawData[hash];
            }
        });
        return this.save();
    }
    /**
     * @inheritDoc
     */
    loadData(type) {
        return Promise.resolve(Object.keys(this.rawData).map(e => {
            const deserialized = new type(this.rawData[e]);
            this.data[e] = deserialized;
            return deserialized;
        }));
    }
    save() {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.rawData));
        return Promise.resolve();
    }
}
exports.LocalStorageManager = LocalStorageManager;
