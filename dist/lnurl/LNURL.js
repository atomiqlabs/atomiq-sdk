"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LNURL = exports.isLNURLPaySuccessAction = void 0;
const RequestError_1 = require("../errors/RequestError");
const bolt11_1 = require("@atomiqlabs/bolt11");
const UserError_1 = require("../errors/UserError");
const base_1 = require("@scure/base");
const aes_1 = require("@noble/ciphers/aes");
const buffer_1 = require("buffer");
const sha2_1 = require("@noble/hashes/sha2");
const HttpUtils_1 = require("../http/HttpUtils");
const LNURLWithdraw_1 = require("../types/lnurl/LNURLWithdraw");
const LNURLPay_1 = require("../types/lnurl/LNURLPay");
const RetryUtils_1 = require("../utils/RetryUtils");
function isLNURLError(obj) {
    return obj.status === "ERROR" &&
        (obj.reason == null || typeof obj.reason === "string");
}
function isLNURLPayResult(obj, domain) {
    return typeof obj.pr === "string" &&
        (obj.routes == null || Array.isArray(obj.routes)) &&
        (obj.disposable === null || obj.disposable === undefined || typeof obj.disposable === "boolean") &&
        (obj.successAction == null || isLNURLPaySuccessAction(obj.successAction, domain));
}
function isLNURLPaySuccessAction(obj, domain) {
    if (obj == null || typeof obj !== 'object' || typeof obj.tag !== 'string')
        return false;
    switch (obj.tag) {
        case "message":
            return obj.message != null && obj.message.length <= 144;
        case "url":
            return obj.description != null && obj.description.length <= 144 &&
                obj.url != null &&
                (domain == null || new URL(obj.url).hostname === domain);
        case "aes":
            return obj.description != null && obj.description.length <= 144 &&
                obj.ciphertext != null && obj.ciphertext.length <= 4096 && BASE64_REGEX.test(obj.ciphertext) &&
                obj.iv != null && obj.iv.length <= 24 && BASE64_REGEX.test(obj.iv);
        default:
            //Unsupported action
            return false;
    }
}
exports.isLNURLPaySuccessAction = isLNURLPaySuccessAction;
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAIL_REGEX = /(?:[A-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-z0-9](?:[A-z0-9-]*[A-z0-9])?\.)+[A-z0-9](?:[A-z0-9-]*[A-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[A-z0-9-]*[A-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;
/**
 * LNURL encoding/decoding and callback handling
 * @category Bitcoin
 */
class LNURL {
    static findBech32LNURL(str) {
        const arr = /,*?((lnurl)([0-9]{1,}[a-z0-9]+){1})/.exec(str.toLowerCase());
        if (arr == null)
            return null;
        return arr[1];
    }
    static isBech32LNURL(str) {
        return this.findBech32LNURL(str) != null;
    }
    /**
     * Checks whether a provided string is bare (non bech32 encoded) lnurl
     * @param str
     * @private
     */
    static isBareLNURL(str) {
        try {
            return str.startsWith("lnurlw://") || str.startsWith("lnurlp://");
        }
        catch (e) { }
        return false;
    }
    /**
     * Checks if the provided string is a lightning network address (e.g. satoshi@nakamoto.com)
     * @param str
     * @private
     */
    static isLightningAddress(str) {
        return MAIL_REGEX.test(str);
    }
    /**
     * Checks whether a given string is a LNURL or lightning address
     * @param str
     */
    static isLNURL(str) {
        return LNURL.isBech32LNURL(str) || LNURL.isLightningAddress(str) || LNURL.isBareLNURL(str);
    }
    /**
     * Extracts the URL that needs to be request from LNURL or lightning address
     * @param str
     * @private
     * @returns An URL to send the request to, or null if it cannot be parsed
     */
    static extractCallUrl(str) {
        if (MAIL_REGEX.test(str)) {
            //lightning e-mail like address
            const arr = str.split("@");
            const username = arr[0];
            const domain = arr[1];
            let scheme = "https";
            if (domain.endsWith(".onion")) {
                scheme = "http";
            }
            return scheme + "://" + domain + "/.well-known/lnurlp/" + username;
        }
        else if (LNURL.isBareLNURL(str)) {
            //non-bech32m encoded lnurl
            const data = str.substring("lnurlw://".length);
            const httpUrl = new URL("http://" + data);
            let scheme = "https";
            if (httpUrl.hostname.endsWith(".onion")) {
                scheme = "http";
            }
            return scheme + "://" + data;
        }
        else {
            const lnurl = LNURL.findBech32LNURL(str);
            if (lnurl != null) {
                let { prefix: hrp, words: dataPart } = base_1.bech32.decode(lnurl, 2000);
                let requestByteArray = base_1.bech32.fromWords(dataPart);
                return buffer_1.Buffer.from(requestByteArray).toString();
            }
        }
        return null;
    }
    /**
     * Sends a request to obtain data about a specific LNURL or lightning address
     *
     * @param str A lnurl or lightning address
     * @param shouldRetry Whether we should retry in case of network failure
     * @param timeout Request timeout in milliseconds
     * @param abortSignal
     */
    static async getLNURL(str, shouldRetry = true, timeout, abortSignal) {
        if (shouldRetry == null)
            shouldRetry = true;
        const url = LNURL.extractCallUrl(str);
        if (url == null)
            return null;
        const sendRequest = () => (0, HttpUtils_1.httpGet)(url, timeout, abortSignal, true);
        let response = shouldRetry ?
            await (0, RetryUtils_1.tryWithRetries)(sendRequest, undefined, RequestError_1.RequestError, abortSignal) :
            await sendRequest();
        if (isLNURLError(response))
            return null;
        if (response.tag === "payRequest")
            try {
                response.decodedMetadata = JSON.parse(response.metadata);
            }
            catch (err) {
                response.decodedMetadata = [];
            }
        if (!(0, LNURLPay_1.isLNURLPayParams)(response) && !(0, LNURLWithdraw_1.isLNURLWithdrawParams)(response))
            return null;
        return {
            ...response,
            url: str
        };
    }
    /**
     * Sends a request to obtain data about a specific LNURL or lightning address
     *
     * @param str A lnurl or lightning address
     * @param shouldRetry Whether we should retry in case of network failure
     * @param timeout Request timeout in milliseconds
     * @param abortSignal
     */
    static async getLNURLType(str, shouldRetry, timeout, abortSignal) {
        let res = await LNURL.getLNURL(str, shouldRetry, timeout, abortSignal);
        if (res.tag === "payRequest") {
            const payRequest = res;
            let shortDescription = undefined;
            let longDescription = undefined;
            let icon = undefined;
            payRequest.decodedMetadata.forEach(data => {
                switch (data[0]) {
                    case "text/plain":
                        shortDescription = data[1];
                        break;
                    case "text/long-desc":
                        longDescription = data[1];
                        break;
                    case "image/png;base64":
                        icon = "data:" + data[0] + "," + data[1];
                        break;
                    case "image/jpeg;base64":
                        icon = "data:" + data[0] + "," + data[1];
                        break;
                }
            });
            return {
                type: "pay",
                min: BigInt(payRequest.minSendable) / 1000n,
                max: BigInt(payRequest.maxSendable) / 1000n,
                commentMaxLength: payRequest.commentAllowed || 0,
                shortDescription,
                longDescription,
                icon,
                params: payRequest
            };
        }
        if (res.tag === "withdrawRequest") {
            const payRequest = res;
            return {
                type: "withdraw",
                min: BigInt(payRequest.minWithdrawable) / 1000n,
                max: BigInt(payRequest.maxWithdrawable) / 1000n,
                params: payRequest
            };
        }
        return null;
    }
    /**
     * Uses a LNURL-pay request by obtaining a lightning network invoice from it
     *
     * @param payRequest LNURL params as returned from the getLNURL call
     * @param amount Amount of sats (BTC) to pay
     * @param comment Optional comment for the payment request
     * @param timeout Request timeout in milliseconds
     * @param abortSignal
     * @throws {RequestError} If the response is non-200, status: ERROR, or invalid format
     */
    static async useLNURLPay(payRequest, amount, comment, timeout, abortSignal) {
        const params = ["amount=" + (amount * 1000n).toString(10)];
        if (comment != null) {
            params.push("comment=" + encodeURIComponent(comment));
        }
        const queryParams = (payRequest.callback.includes("?") ? "&" : "?") + params.join("&");
        const response = await (0, RetryUtils_1.tryWithRetries)(() => (0, HttpUtils_1.httpGet)(payRequest.callback + queryParams, timeout, abortSignal, true), undefined, RequestError_1.RequestError, abortSignal);
        if (isLNURLError(response))
            throw new RequestError_1.RequestError("LNURL callback error: " + response.reason, 200);
        if (!isLNURLPayResult(response))
            throw new RequestError_1.RequestError("Invalid LNURL response!", 200);
        const parsedPR = (0, bolt11_1.decode)(response.pr);
        const descHash = buffer_1.Buffer.from((0, sha2_1.sha256)(payRequest.metadata)).toString("hex");
        if (parsedPR.tagsObject.purpose_commit_hash !== descHash)
            throw new RequestError_1.RequestError("Invalid invoice received (description hash)!", 200);
        const msats = parsedPR.millisatoshis;
        if (msats == null)
            throw new RequestError_1.RequestError("Invalid invoice received (amount msats not defined)", 200);
        const invoiceMSats = BigInt(msats);
        if (invoiceMSats !== (amount * 1000n))
            throw new RequestError_1.RequestError("Invalid invoice received (amount)!", 200);
        return {
            invoice: response.pr,
            parsedInvoice: parsedPR,
            successAction: response.successAction ?? undefined
        };
    }
    /**
     * Submits the bolt11 lightning invoice to the lnurl withdraw url
     *
     * @param withdrawRequest Withdraw request to use
     * @param withdrawRequest.k1 K1 parameter
     * @param withdrawRequest.callback A URL to call
     * @param lnpr bolt11 lightning network invoice to submit to the withdrawal endpoint
     * @throws {RequestError} If the response is non-200 or status: ERROR
     */
    static async postInvoiceToLNURLWithdraw(withdrawRequest, lnpr) {
        const params = [
            "pr=" + lnpr,
            "k1=" + withdrawRequest.k1
        ];
        const queryParams = (withdrawRequest.callback.includes("?") ? "&" : "?") + params.join("&");
        const response = await (0, RetryUtils_1.tryWithRetries)(() => (0, HttpUtils_1.httpGet)(withdrawRequest.callback + queryParams, undefined, undefined, true), undefined, RequestError_1.RequestError);
        if (isLNURLError(response))
            throw new RequestError_1.RequestError("LNURL callback error: " + response.reason, 200);
    }
    /**
     * Uses a LNURL-withdraw request by submitting a lightning network invoice to it
     *
     * @param withdrawRequest Withdrawal request as returned from getLNURL call
     * @param lnpr bolt11 lightning network invoice to submit to the withdrawal endpoint
     * @throws {UserError} In case the provided bolt11 lightning invoice has an amount that is out of bounds for
     *  the specified LNURL-withdraw request
     */
    static async useLNURLWithdraw(withdrawRequest, lnpr) {
        const min = BigInt(withdrawRequest.minWithdrawable) / 1000n;
        const max = BigInt(withdrawRequest.maxWithdrawable) / 1000n;
        const parsedPR = (0, bolt11_1.decode)(lnpr);
        const msats = parsedPR.millisatoshis;
        if (msats == null)
            throw new UserError_1.UserError("Invoice without msats value field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        if (amount < min)
            throw new UserError_1.UserError("Invoice amount less than minimum LNURL-withdraw limit");
        if (amount > max)
            throw new UserError_1.UserError("Invoice amount more than maximum LNURL-withdraw limit");
        return await LNURL.postInvoiceToLNURLWithdraw(withdrawRequest, lnpr);
    }
    static decodeSuccessAction(successAction, secret) {
        if (secret == null)
            return null;
        if (successAction == null)
            return null;
        if (successAction.tag === "message" && successAction.message != null) {
            return {
                description: successAction.message
            };
        }
        if (successAction.tag === "url" && successAction.description != null && successAction.url != null) {
            return {
                description: successAction.description,
                url: successAction.url
            };
        }
        if (successAction.tag === "aes" && successAction.iv != null && successAction.ciphertext != null && successAction.description != null) {
            const CBC = (0, aes_1.cbc)(buffer_1.Buffer.from(secret, "hex"), buffer_1.Buffer.from(successAction.iv, "hex"));
            let plaintext = CBC.decrypt(buffer_1.Buffer.from(successAction.ciphertext, "base64"));
            // remove padding
            const size = plaintext.length;
            const pad = plaintext[size - 1];
            return {
                description: successAction.description,
                text: buffer_1.Buffer.from(plaintext).toString("utf8", 0, size - pad)
            };
        }
        return null;
    }
}
exports.LNURL = LNURL;
