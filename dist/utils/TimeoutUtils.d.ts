/**
 * Returns a promise that resolves after given amount seconds
 *
 * @param timeout how many milliseconds to wait for
 * @param abortSignal
 */
export declare function timeoutPromise(timeout: number, abortSignal?: AbortSignal): Promise<void>;
/**
 * Returns an abort signal that aborts after a specified timeout in milliseconds
 *
 * @param timeout Milliseconds to wait
 * @param abortReason Abort with this abort reason
 * @param abortSignal Abort signal to extend
 */
export declare function timeoutSignal(timeout: number, abortReason?: any, abortSignal?: AbortSignal): AbortSignal;
