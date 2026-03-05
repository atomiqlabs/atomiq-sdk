"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutOfBoundsError = exports.RequestError = void 0;
/**
 * An error returned by the intermediary in a http response
 *
 * @category Errors
 */
class RequestError extends Error {
    constructor(msg, httpCode, lpResponseCode) {
        try {
            const parsed = JSON.parse(msg);
            if (parsed.msg != null)
                msg = parsed.msg;
        }
        catch (e) { }
        super(msg);
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, RequestError.prototype);
        this.httpCode = httpCode;
        this.lpResponseCode = lpResponseCode;
    }
    /**
     * Parses a message + a response code returned by the intermediary (LP) as an error
     *
     * @param msg Raw response
     * @param httpCode HTTP response status code
     */
    static parse(msg, httpCode) {
        let lpResponseCode;
        try {
            const parsed = JSON.parse(msg);
            msg = parsed.msg;
            lpResponseCode = parsed.code;
            if (parsed.code === 20003 || parsed.code === 20004) {
                return new OutOfBoundsError(parsed.msg, httpCode, BigInt(parsed.data.min), BigInt(parsed.data.max), parsed.code);
            }
        }
        catch (e) { }
        return new RequestError(msg, httpCode, lpResponseCode);
    }
}
exports.RequestError = RequestError;
/**
 * An error indicating out of bounds (amount too high or too low) on swap initialization
 *
 * @category Errors
 */
class OutOfBoundsError extends RequestError {
    constructor(msg, httpCode, min, max, lpResponseCode) {
        super(msg, httpCode, lpResponseCode);
        this.max = max;
        this.min = min;
        Object.setPrototypeOf(this, OutOfBoundsError.prototype);
    }
}
exports.OutOfBoundsError = OutOfBoundsError;
