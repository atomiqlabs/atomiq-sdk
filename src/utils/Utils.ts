import {Buffer} from "buffer";
import {randomBytes as randomBytesNoble} from "@noble/hashes/utils";
import {sha256} from "@noble/hashes/sha2";
import {BigIntBufferUtils} from "@atomiqlabs/base";

/**
 * Returns a promise that rejects if the passed promise resolves to `undefined` or `null`
 *
 * @param promise Promise to check resolve value of
 * @param msg Optional message to pass to the thrown `Error`
 * @category Utilities
 */
export function throwIfUndefined<T>(promise: Promise<T | undefined>, msg?: string): Promise<T> {
    return promise.then(val => {
        if(val==undefined) throw new Error(msg ?? "Promise value is undefined!");
        return val;
    })
}

/**
 * Returns a promise that resolves when any of the passed promises resolves, and rejects if all the underlying
 *  promises fail with an array of errors returned by the respective promises
 *
 * @param promises A list of promises
 * @category Utilities
 */
export function promiseAny<T>(promises: Promise<T>[]): Promise<T> {
    return new Promise<T>((resolve: ((val: T) => void) | null, reject) => {
        let numRejected = 0;
        const rejectReasons = Array(promises.length);

        promises.forEach((promise, index) => {
            promise.then((val) => {
                if(resolve!=null) resolve(val);
                resolve = null;
            }).catch(err => {
                rejectReasons[index] = err;
                numRejected++;
                if(numRejected===promises.length) {
                    reject(rejectReasons);
                }
            })
        })
    });
}

/**
 * Maps a JS object to another JS object based on the translation function, the translation function is called for every
 *  property (value/key) of the old object and returns the new value of for this property
 *
 * @param obj
 * @param translator
 */
export function objectMap<
    InputObject extends {[key in string]: any},
    OutputObject extends {[key in keyof InputObject]: any}
>(
    obj: InputObject,
    translator: <InputKey extends Extract<keyof InputObject, string>>(
        value: InputObject[InputKey],
        key: InputKey
    ) => OutputObject[InputKey]
): {[key in keyof InputObject]: OutputObject[key]} {
    const resp: {[key in keyof InputObject]?: OutputObject[key]} = {};
    for(let key in obj) {
        resp[key] = translator(obj[key], key);
    }
    return resp as {[key in keyof InputObject]: OutputObject[key]};
}

/**
 * Maps the entries from the map to the array using the translator function
 *
 * @param map
 * @param translator
 */
export function mapToArray<K, V, Output>(map: Map<K, V>, translator: (key: K, value: V) => Output): Output[] {
    const arr: Output[] = Array(map.size);
    let pointer = 0;
    for(let entry of map.entries()) {
        arr[pointer++] = translator(entry[0], entry[1]);
    }
    return arr;
}

/**
 * Creates a new abort controller that will abort if the passed abort signal aborts
 *
 * @param abortSignal
 */
export function extendAbortController(abortSignal?: AbortSignal) {
    const _abortController = new AbortController();
    if(abortSignal!=null) {
        abortSignal.throwIfAborted();
        abortSignal.onabort = () => _abortController.abort(abortSignal.reason);
    }
    return _abortController;
}

export function bigIntMin(a: bigint, b: bigint): bigint;
export function bigIntMin(a?: bigint, b?: bigint): bigint | undefined;
export function bigIntMin(a?: bigint, b?: bigint): bigint | undefined {
    if(a==null) return b;
    if(b==null) return a;
    return a > b ? b : a;
}

export function bigIntMax(a: bigint, b: bigint): bigint;
export function bigIntMax(a?: bigint, b?: bigint): bigint | undefined;
export function bigIntMax(a?: bigint, b?: bigint): bigint | undefined {
    if(a==null) return b;
    if(b==null) return a;
    return b > a ? b : a;
}

export function bigIntCompare(a: bigint, b: bigint): -1 | 0 | 1 {
    return a > b ? 1 : a===b ? 0 : -1;
}

export function toBigInt(value: string): bigint;
export function toBigInt(value: undefined): undefined;
export function toBigInt(value: string | undefined): bigint | undefined {
    if(value==null) return undefined;
    return BigInt(value);
}

export function randomBytes(bytesLength: number): Buffer {
    return Buffer.from(randomBytesNoble(bytesLength));
}

export function getTxoHash(outputScriptHex: string, value: number) {
    return Buffer.from(sha256(Buffer.concat([
        BigIntBufferUtils.toBuffer(BigInt(value), "le", 8),
        Buffer.from(outputScriptHex, "hex")
    ])));
}

export function fromDecimal(amount: string, decimalCount: number) {
    if (amount.includes(".")) {
        const [before, after] = amount.split(".");
        if (decimalCount < 0) {
            return BigInt(before.substring(0, before.length + decimalCount));
        }
        if (after.length > decimalCount) {
            //Cut the last digits
            return BigInt((before === "0" ? "" : before) + after.substring(0, decimalCount));
        }
        return BigInt((before === "0" ? "" : before) + after.padEnd(decimalCount, "0"));
    } else {
        if (decimalCount < 0) {
            return BigInt(amount.substring(0, amount.length + decimalCount));
        } else {
            return BigInt(amount + "0".repeat(decimalCount));
        }
    }

}

export function toDecimal(amount: bigint, decimalCount: number, cut?: boolean, displayDecimals?: number) {
    if (decimalCount <= 0) {
        return amount.toString(10) + "0".repeat(-decimalCount);
    }

    const amountStr = amount.toString(10).padStart(decimalCount + 1, "0");

    const splitPoint = amountStr.length - decimalCount;

    const decimalPart = amountStr.substring(splitPoint, amountStr.length);
    let cutTo = decimalPart.length;
    if (cut && cutTo > 0) {
        for (let i = decimalPart.length - 1; i--; i >= 0) {
            if (decimalPart.charAt(i) === "0") {
                cutTo = i;
            } else break;
        }
        if (cutTo === 0) cutTo = 1;
    }

    if (displayDecimals === 0) return amountStr.substring(0, splitPoint);
    if (displayDecimals != null && cutTo > displayDecimals) cutTo = displayDecimals;
    return amountStr.substring(0, splitPoint) + "." + decimalPart.substring(0, cutTo);
}