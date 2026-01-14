import {RequestError} from "../errors/RequestError";

import {timeoutSignal} from "../utils/TimeoutUtils";

/**
 * Mimics fetch API byt adds a timeout to the request
 *
 * @param input
 * @param init
 */
export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & {
    timeout?: number
}): Promise<Response> {
    if (init == null) init = {};
    if (init.timeout != null) init.signal = timeoutSignal(init.timeout, new Error("Network request timed out"), init.signal ?? undefined);

    return fetch(input, init).catch(e => {
        if (e.name === "AbortError" && init.signal != null) {
            throw init.signal.reason;
        } else {
            throw e;
        }
    });
}

/**
 * Sends an HTTP GET request through a fetch API, handles non 200 response codes as errors
 * @param url Send request to this URL
 * @param timeout Timeout (in milliseconds) for the request to conclude
 * @param abortSignal
 * @param allowNon200 Whether to allow non-200 status code HTTP responses
 * @throws {RequestError} if non 200 response code was returned or body cannot be parsed
 */
export async function httpGet<T>(url: string, timeout?: number, abortSignal?: AbortSignal, allowNon200: boolean = false): Promise<T> {
    const init = {
        method: "GET",
        timeout,
        signal: abortSignal
    };

    const response: Response = await fetchWithTimeout(url, init);

    if (response.status !== 200) {
        let resp: string;
        try {
            resp = await response.text();
        } catch (e) {
            throw new RequestError(response.statusText, response.status);
        }
        if (allowNon200) {
            try {
                return JSON.parse(resp);
            } catch (e) {
            }
        }
        throw RequestError.parse(resp, response.status);
    }

    return await response.json();
}

/**
 * Sends an HTTP POST request through a fetch API, handles non 200 response codes as errors
 * @param url Send request to this URL
 * @param body A HTTP request body to send to the server
 * @param timeout Timeout (in milliseconds) for the request to conclude
 * @param abortSignal
 * @throws {RequestError} if non 200 response code was returned
 */
export async function httpPost<T>(url: string, body: any, timeout?: number, abortSignal?: AbortSignal): Promise<T> {
    const init = {
        method: "POST",
        timeout,
        body: JSON.stringify(body),
        headers: {'Content-Type': 'application/json'},
        signal: abortSignal
    };

    const response: Response = timeout == null ? await fetch(url, init) : await fetchWithTimeout(url, init);

    if (response.status !== 200) {
        let resp: string;
        try {
            resp = await response.text();
        } catch (e) {
            throw new RequestError(response.statusText, response.status);
        }
        throw RequestError.parse(resp, response.status);
    }

    return await response.json();
}