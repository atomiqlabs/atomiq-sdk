/// <reference types="node" />
/// <reference types="node" />
import { Buffer } from "buffer";
/**
 * Returns a promise that rejects if the passed promise resolves to `undefined` or `null`
 *
 * @param promise Promise to check resolve value of
 * @param msg Optional message to pass to the thrown `Error`
 */
export declare function throwIfUndefined<T>(promise: Promise<T | undefined>, msg?: string): Promise<T>;
/**
 * Returns a promise that resolves when any of the passed promises resolves, and rejects if all the underlying
 *  promises fail with an array of errors returned by the respective promises
 *
 * @param promises A list of promises
 */
export declare function promiseAny<T>(promises: Promise<T>[]): Promise<T>;
/**
 * Maps a JS object to another JS object based on the translation function, the translation function is called for every
 *  property (value/key) of the old object and returns the new value of for this property
 *
 * @param obj
 * @param translator
 */
export declare function objectMap<InputObject extends {
    [key in string]: any;
}, OutputObject extends {
    [key in keyof InputObject]: any;
}>(obj: InputObject, translator: <InputKey extends Extract<keyof InputObject, string>>(value: InputObject[InputKey], key: InputKey) => OutputObject[InputKey]): {
    [key in keyof InputObject]: OutputObject[key];
};
/**
 * Maps the entries from the map to the array using the translator function
 *
 * @param map
 * @param translator
 */
export declare function mapToArray<K, V, Output>(map: Map<K, V>, translator: (key: K, value: V) => Output): Output[];
/**
 * Creates a new abort controller that will abort if the passed abort signal aborts
 *
 * @param abortSignal
 */
export declare function extendAbortController(abortSignal?: AbortSignal): AbortController;
export declare function bigIntMin(a: bigint, b: bigint): bigint;
export declare function bigIntMin(a?: bigint, b?: bigint): bigint | undefined;
export declare function bigIntMax(a: bigint, b: bigint): bigint;
export declare function bigIntMax(a?: bigint, b?: bigint): bigint | undefined;
export declare function bigIntCompare(a: bigint, b: bigint): -1 | 0 | 1;
export declare function toBigInt(value: string): bigint;
export declare function toBigInt(value: undefined): undefined;
export declare function randomBytes(bytesLength: number): Buffer;
export declare function getTxoHash(outputScriptHex: string, value: number): Buffer;
export declare function fromDecimal(amount: string, decimalCount: number): bigint;
export declare function toDecimal(amount: bigint, decimalCount: number, cut?: boolean, displayDecimals?: number): string;
