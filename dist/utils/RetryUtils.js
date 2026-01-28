"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryWithRetries = void 0;
const TimeoutUtils_1 = require("./TimeoutUtils");
const Logger_1 = require("./Logger");
const logger = (0, Logger_1.getLogger)("RetryUtils: ");
function isConstructor(fn) {
    return (typeof fn === 'function' &&
        fn.prototype != null &&
        fn.prototype.constructor === fn);
}
function isConstructorArray(fnArr) {
    return Array.isArray(fnArr) && fnArr.every(isConstructor);
}
/**
 * Checks whether the passed error is allowed to pass through
 *
 * @param e Error in question
 * @param errorAllowed Allowed errors as defined as a callback function, specific error type, or an array of error types
 */
function checkError(e, errorAllowed) {
    if (isConstructorArray(errorAllowed))
        return errorAllowed.find(error => e instanceof error) != null;
    if (isConstructor(errorAllowed))
        return e instanceof errorAllowed;
    return errorAllowed(e);
}
/**
 * Runs the passed function multiple times if it fails
 *
 * @param func A callback for executing the action
 * @param func.retryCount Count of the current retry, starting from 0 for original request and increasing
 * @param retryPolicy Retry policy
 * @param retryPolicy.maxRetries How many retries to attempt in total
 * @param retryPolicy.delay How long should the delay be
 * @param retryPolicy.exponential Whether to use exponentially increasing delays
 * @param errorAllowed A callback for determining whether a given error is allowed, and we should therefore not retry
 * @param abortSignal
 * @returns Result of the action executing callback
 * @category Utilities
 */
async function tryWithRetries(func, retryPolicy, errorAllowed, abortSignal) {
    retryPolicy = retryPolicy || {};
    retryPolicy.maxRetries = retryPolicy.maxRetries || 5;
    retryPolicy.delay = retryPolicy.delay || 500;
    retryPolicy.exponential = retryPolicy.exponential == null ? true : retryPolicy.exponential;
    let err = null;
    for (let i = 0; i < retryPolicy.maxRetries; i++) {
        try {
            return await func(i);
        }
        catch (e) {
            if (errorAllowed != null && checkError(e, errorAllowed))
                throw e;
            err = e;
            logger.warn("tryWithRetries(): Error on try number: " + i, e);
        }
        if (abortSignal != null && abortSignal.aborted)
            throw (abortSignal.reason || new Error("Aborted"));
        if (i !== retryPolicy.maxRetries - 1) {
            await (0, TimeoutUtils_1.timeoutPromise)(retryPolicy.exponential ? retryPolicy.delay * Math.pow(2, i) : retryPolicy.delay, abortSignal);
        }
    }
    throw err;
}
exports.tryWithRetries = tryWithRetries;
