/**
 * An error returned by the intermediary in a http response
 *
 * @category Errors
 */
export declare class RequestError extends Error {
    httpCode: number;
    constructor(msg: string, httpCode: number);
    /**
     * Parses a message + a response code returned by the intermediary (LP) as an error
     *
     * @param msg Raw response
     * @param httpCode HTTP response status code
     */
    static parse(msg: string, httpCode: number): RequestError | OutOfBoundsError;
}
/**
 * An error indicating out of bounds (amount too high or too low) on swap initialization
 *
 * @category Errors
 */
export declare class OutOfBoundsError extends RequestError {
    /**
     * Swap minimum in base units of the token in which the quote was requested
     */
    min: bigint;
    /**
     * Swap maximum in base units of the token in which the quote was requested
     */
    max: bigint;
    constructor(msg: string, httpCode: number, min: bigint, max: bigint);
}
