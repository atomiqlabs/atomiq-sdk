"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDecimal = exports.fromDecimal = exports.getTxoHash = exports.randomBytes = exports.toBigInt = exports.bigIntCompare = exports.bigIntMax = exports.bigIntMin = exports.extendAbortController = exports.mapToArray = exports.objectMap = exports.promiseAny = exports.throwIfUndefined = void 0;
const buffer_1 = require("buffer");
const utils_1 = require("@noble/hashes/utils");
const sha2_1 = require("@noble/hashes/sha2");
const base_1 = require("@atomiqlabs/base");
/**
 * Returns a promise that rejects if the passed promise resolves to `undefined` or `null`
 *
 * @param promise Promise to check resolve value of
 * @param msg Optional message to pass to the thrown `Error`
 */
function throwIfUndefined(promise, msg) {
    return promise.then(val => {
        if (val == undefined)
            throw new Error(msg ?? "Promise value is undefined!");
        return val;
    });
}
exports.throwIfUndefined = throwIfUndefined;
/**
 * Returns a promise that resolves when any of the passed promises resolves, and rejects if all the underlying
 *  promises fail with an array of errors returned by the respective promises
 *
 * @param promises A list of promises
 */
function promiseAny(promises) {
    return new Promise((resolve, reject) => {
        let numRejected = 0;
        const rejectReasons = Array(promises.length);
        promises.forEach((promise, index) => {
            promise.then((val) => {
                if (resolve != null)
                    resolve(val);
                resolve = null;
            }).catch(err => {
                rejectReasons[index] = err;
                numRejected++;
                if (numRejected === promises.length) {
                    reject(rejectReasons);
                }
            });
        });
    });
}
exports.promiseAny = promiseAny;
/**
 * Maps a JS object to another JS object based on the translation function, the translation function is called for every
 *  property (value/key) of the old object and returns the new value of for this property
 *
 * @param obj
 * @param translator
 */
function objectMap(obj, translator) {
    const resp = {};
    for (let key in obj) {
        resp[key] = translator(obj[key], key);
    }
    return resp;
}
exports.objectMap = objectMap;
/**
 * Maps the entries from the map to the array using the translator function
 *
 * @param map
 * @param translator
 */
function mapToArray(map, translator) {
    const arr = Array(map.size);
    let pointer = 0;
    for (let entry of map.entries()) {
        arr[pointer++] = translator(entry[0], entry[1]);
    }
    return arr;
}
exports.mapToArray = mapToArray;
/**
 * Creates a new abort controller that will abort if the passed abort signal aborts
 *
 * @param abortSignal
 */
function extendAbortController(abortSignal) {
    const _abortController = new AbortController();
    if (abortSignal != null) {
        abortSignal.throwIfAborted();
        abortSignal.onabort = () => _abortController.abort(abortSignal.reason);
    }
    return _abortController;
}
exports.extendAbortController = extendAbortController;
function bigIntMin(a, b) {
    if (a == null)
        return b;
    if (b == null)
        return a;
    return a > b ? b : a;
}
exports.bigIntMin = bigIntMin;
function bigIntMax(a, b) {
    if (a == null)
        return b;
    if (b == null)
        return a;
    return b > a ? b : a;
}
exports.bigIntMax = bigIntMax;
function bigIntCompare(a, b) {
    return a > b ? 1 : a === b ? 0 : -1;
}
exports.bigIntCompare = bigIntCompare;
function toBigInt(value) {
    if (value == null)
        return undefined;
    return BigInt(value);
}
exports.toBigInt = toBigInt;
function randomBytes(bytesLength) {
    return buffer_1.Buffer.from((0, utils_1.randomBytes)(bytesLength));
}
exports.randomBytes = randomBytes;
function getTxoHash(outputScriptHex, value) {
    return buffer_1.Buffer.from((0, sha2_1.sha256)(buffer_1.Buffer.concat([
        base_1.BigIntBufferUtils.toBuffer(BigInt(value), "le", 8),
        buffer_1.Buffer.from(outputScriptHex, "hex")
    ])));
}
exports.getTxoHash = getTxoHash;
function fromDecimal(amount, decimalCount) {
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
    }
    else {
        if (decimalCount < 0) {
            return BigInt(amount.substring(0, amount.length + decimalCount));
        }
        else {
            return BigInt(amount + "0".repeat(decimalCount));
        }
    }
}
exports.fromDecimal = fromDecimal;
function toDecimal(amount, decimalCount, cut, displayDecimals) {
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
            }
            else
                break;
        }
        if (cutTo === 0)
            cutTo = 1;
    }
    if (displayDecimals === 0)
        return amountStr.substring(0, splitPoint);
    if (displayDecimals != null && cutTo > displayDecimals)
        cutTo = displayDecimals;
    return amountStr.substring(0, splitPoint) + "." + decimalPart.substring(0, cutTo);
}
exports.toDecimal = toDecimal;
