/**
 * Mimics fetch API byt adds a timeout to the request
 *
 * @param input
 * @param init
 */
export declare function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & {
    timeout?: number;
}): Promise<Response>;
/**
 * Sends an HTTP GET request through a fetch API, handles non 200 response codes as errors
 * @param url Send request to this URL
 * @param timeout Timeout (in milliseconds) for the request to conclude
 * @param abortSignal
 * @param allowNon200 Whether to allow non-200 status code HTTP responses
 * @throws {RequestError} if non 200 response code was returned or body cannot be parsed
 */
export declare function httpGet<T>(url: string, timeout?: number, abortSignal?: AbortSignal, allowNon200?: boolean): Promise<T>;
/**
 * Sends an HTTP POST request through a fetch API, handles non 200 response codes as errors
 * @param url Send request to this URL
 * @param body A HTTP request body to send to the server
 * @param timeout Timeout (in milliseconds) for the request to conclude
 * @param abortSignal
 * @throws {RequestError} if non 200 response code was returned
 */
export declare function httpPost<T>(url: string, body: any, timeout?: number, abortSignal?: AbortSignal): Promise<T>;
