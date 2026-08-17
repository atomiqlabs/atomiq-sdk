/**
 * An error or inconsistency in the intermediary's returned data, this will blacklist the intermediary
 *
 * @category Errors
 */
export declare class IntermediaryError extends Error {
    /**
     * Whether the error is recoverable and intermediary (LP) shouldn't be blacklisted for it
     */
    recoverable: boolean;
    originalStack?: string;
    constructor(msg: string, originalError?: any, recoverable?: boolean);
}
