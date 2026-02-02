type Constructor<T = any> = new (...args: any[]) => T;
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
export declare function tryWithRetries<T>(func: (retryCount: number) => Promise<T>, retryPolicy?: {
    maxRetries?: number;
    delay?: number;
    exponential?: boolean;
}, errorAllowed?: ((e: any) => boolean) | Constructor<Error> | Constructor<Error>[], abortSignal?: AbortSignal): Promise<T>;
export {};
