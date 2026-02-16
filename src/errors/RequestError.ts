
/**
 * An error returned by the intermediary in a http response
 *
 * @category Errors
 */
export class RequestError extends Error {

    httpCode: number;

    constructor(msg: string, httpCode: number) {
        try {
            const parsed = JSON.parse(msg);
            if(parsed.msg!=null) msg = parsed.msg;
        } catch (e) {}
        super(msg);
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, RequestError.prototype);
        this.httpCode = httpCode;
    }

    /**
     * Parses a message + a response code returned by the intermediary (LP) as an error
     *
     * @param msg Raw response
     * @param httpCode HTTP response status code
     */
    static parse(msg: string, httpCode: number): RequestError | OutOfBoundsError {
        try {
            const parsed = JSON.parse(msg);
            msg = parsed.msg;
            if(parsed.code===20003 || parsed.code===20004) {
                return new OutOfBoundsError(parsed.msg, httpCode, BigInt(parsed.data.min), BigInt(parsed.data.max));
            }
        } catch (e) {}
        return new RequestError(msg, httpCode);
    }

}


/**
 * An error indicating out of bounds (amount too high or too low) on swap initialization
 *
 * @category Errors
 */
export class OutOfBoundsError extends RequestError {

    /**
     * Swap minimum in base units of the token in which the quote was requested
     */
    min: bigint;
    /**
     * Swap maximum in base units of the token in which the quote was requested
     */
    max: bigint;

    constructor(msg: string, httpCode: number, min: bigint, max: bigint) {
        super(msg, httpCode);
        this.max = max;
        this.min = min;
        Object.setPrototypeOf(this, OutOfBoundsError.prototype);
    }

}