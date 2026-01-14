"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpPost = exports.httpGet = exports.fetchWithTimeout = void 0;
const RequestError_1 = require("../errors/RequestError");
const TimeoutUtils_1 = require("../utils/TimeoutUtils");
/**
 * Mimics fetch API byt adds a timeout to the request
 *
 * @param input
 * @param init
 */
function fetchWithTimeout(input, init) {
    if (init == null)
        init = {};
    if (init.timeout != null)
        init.signal = (0, TimeoutUtils_1.timeoutSignal)(init.timeout, new Error("Network request timed out"), init.signal ?? undefined);
    return fetch(input, init).catch(e => {
        if (e.name === "AbortError" && init.signal != null) {
            throw init.signal.reason;
        }
        else {
            throw e;
        }
    });
}
exports.fetchWithTimeout = fetchWithTimeout;
/**
 * Sends an HTTP GET request through a fetch API, handles non 200 response codes as errors
 * @param url Send request to this URL
 * @param timeout Timeout (in milliseconds) for the request to conclude
 * @param abortSignal
 * @param allowNon200 Whether to allow non-200 status code HTTP responses
 * @throws {RequestError} if non 200 response code was returned or body cannot be parsed
 */
async function httpGet(url, timeout, abortSignal, allowNon200 = false) {
    const init = {
        method: "GET",
        timeout,
        signal: abortSignal
    };
    const response = await fetchWithTimeout(url, init);
    if (response.status !== 200) {
        let resp;
        try {
            resp = await response.text();
        }
        catch (e) {
            throw new RequestError_1.RequestError(response.statusText, response.status);
        }
        if (allowNon200) {
            try {
                return JSON.parse(resp);
            }
            catch (e) {
            }
        }
        throw RequestError_1.RequestError.parse(resp, response.status);
    }
    return await response.json();
}
exports.httpGet = httpGet;
/**
 * Sends an HTTP POST request through a fetch API, handles non 200 response codes as errors
 * @param url Send request to this URL
 * @param body A HTTP request body to send to the server
 * @param timeout Timeout (in milliseconds) for the request to conclude
 * @param abortSignal
 * @throws {RequestError} if non 200 response code was returned
 */
async function httpPost(url, body, timeout, abortSignal) {
    const init = {
        method: "POST",
        timeout,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        signal: abortSignal
    };
    const response = timeout == null ? await fetch(url, init) : await fetchWithTimeout(url, init);
    if (response.status !== 200) {
        let resp;
        try {
            resp = await response.text();
        }
        catch (e) {
            throw new RequestError_1.RequestError(response.statusText, response.status);
        }
        throw RequestError_1.RequestError.parse(resp, response.status);
    }
    return await response.json();
}
exports.httpPost = httpPost;
