import {RequestError} from "../errors/RequestError";
import {decode as bolt11Decode, PaymentRequestObject, TagsObject} from "@atomiqlabs/bolt11";
import {UserError} from "../errors/UserError";
import {bech32} from "@scure/base";
import {cbc} from "@noble/ciphers/aes";
import {Buffer} from "buffer";
import {sha256} from "@noble/hashes/sha2";
import {httpGet} from "../http/HttpUtils";
import {
    isLNURLWithdrawParams,
    LNURLWithdraw,
    LNURLWithdrawParams,
    LNURLWithdrawParamsWithUrl
} from "../types/lnurl/LNURLWithdraw";
import {
    isLNURLPayParams,
    LNURLDecodedSuccessAction,
    LNURLPay,
    LNURLPayParams,
    LNURLPayParamsWithUrl
} from "../types/lnurl/LNURLPay";
import {tryWithRetries} from "../utils/RetryUtils";

type LNURLOk = {
    status: "OK"
};

type LNURLError = {
    status: "ERROR",
    reason?: string
};

function isLNURLError(obj: any): obj is LNURLError {
    return obj.status==="ERROR" &&
        (obj.reason==null || typeof obj.reason==="string");
}

type LNURLPayResult = {
    pr: string;
    successAction: LNURLPaySuccessAction | null;
    disposable: boolean | null;
    routes: [];
}

function isLNURLPayResult(obj: any, domain?: string): obj is LNURLPayResult {
    return typeof obj.pr === "string" &&
        (obj.routes == null || Array.isArray(obj.routes)) &&
        (obj.disposable === null || obj.disposable === undefined || typeof obj.disposable === "boolean") &&
        (obj.successAction == null || isLNURLPaySuccessAction(obj.successAction, domain));
}

export type LNURLPaySuccessAction = {
    tag: string;
    description: string | null;
    url: string | null;
    message: string | null;
    ciphertext: string | null;
    iv: string | null;
};

export function isLNURLPaySuccessAction(obj: any, domain?: string): obj is LNURLPaySuccessAction {
    if(obj==null || typeof obj !== 'object' || typeof obj.tag !== 'string') return false;
    switch(obj.tag) {
        case "message":
            return obj.message!=null && obj.message.length<=144;
        case "url":
            return obj.description!=null && obj.description.length<=144 &&
                obj.url!=null &&
                (domain==null || new URL(obj.url).hostname===domain);
        case "aes":
            return obj.description!=null && obj.description.length<=144 &&
                obj.ciphertext!=null && obj.ciphertext.length<=4096 && BASE64_REGEX.test(obj.ciphertext) &&
                obj.iv!=null && obj.iv.length<=24 && BASE64_REGEX.test(obj.iv);
        default:
            //Unsupported action
            return false;
    }
}

const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAIL_REGEX = /(?:[A-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-z0-9](?:[A-z0-9-]*[A-z0-9])?\.)+[A-z0-9](?:[A-z0-9-]*[A-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[A-z0-9-]*[A-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

export class LNURL {

    private static findBech32LNURL(str: string) {
        const arr = /,*?((lnurl)([0-9]{1,}[a-z0-9]+){1})/.exec(str.toLowerCase());
        if(arr==null) return null;
        return arr[1];
    }

    private static isBech32LNURL(str: string): boolean {
        return this.findBech32LNURL(str)!=null;
    }

    /**
     * Checks whether a provided string is bare (non bech32 encoded) lnurl
     * @param str
     * @private
     */
    private static isBareLNURL(str: string): boolean {
        try {
            return str.startsWith("lnurlw://") || str.startsWith("lnurlp://");
        } catch(e) {}
        return false;
    }

    /**
     * Checks if the provided string is a lightning network address (e.g. satoshi@nakamoto.com)
     * @param str
     * @private
     */
    private static isLightningAddress(str: string): boolean {
        return MAIL_REGEX.test(str);
    }

    /**
     * Checks whether a given string is a LNURL or lightning address
     * @param str
     */
    static isLNURL(str: string): boolean {
        return LNURL.isBech32LNURL(str) || LNURL.isLightningAddress(str) || LNURL.isBareLNURL(str);
    }

    /**
     * Extracts the URL that needs to be request from LNURL or lightning address
     * @param str
     * @private
     * @returns An URL to send the request to, or null if it cannot be parsed
     */
    private static extractCallUrl(str: string): string | null {
        if(MAIL_REGEX.test(str)) {
            //lightning e-mail like address
            const arr = str.split("@");
            const username = arr[0];
            const domain = arr[1];
            let scheme = "https";
            if(domain.endsWith(".onion")) {
                scheme = "http";
            }

            return scheme+"://"+domain+"/.well-known/lnurlp/"+username;
        } else if(LNURL.isBareLNURL(str)) {
            //non-bech32m encoded lnurl
            const data = str.substring("lnurlw://".length);
            const httpUrl = new URL("http://"+data);

            let scheme = "https";
            if(httpUrl.hostname.endsWith(".onion")) {
                scheme = "http";
            }

            return scheme+"://"+data;
        } else {
            const lnurl = LNURL.findBech32LNURL(str);

            if(lnurl!=null) {
                let { prefix: hrp, words: dataPart } = bech32.decode(lnurl as any, 2000);
                let requestByteArray = bech32.fromWords(dataPart);

                return Buffer.from(requestByteArray).toString();
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
    static async getLNURL(
        str: string,
        shouldRetry: boolean = true,
        timeout?: number,
        abortSignal?: AbortSignal
    ) : Promise<LNURLPayParamsWithUrl | LNURLWithdrawParamsWithUrl | null> {
        if(shouldRetry==null) shouldRetry = true;

        const url = LNURL.extractCallUrl(str);
        if(url==null) return null;

        const sendRequest =
            () => httpGet<LNURLPayParams | LNURLWithdrawParams | LNURLError>(url, timeout, abortSignal, true);

        let response = shouldRetry ?
            await tryWithRetries(sendRequest, undefined, RequestError, abortSignal) :
            await sendRequest();

        if(isLNURLError(response)) return null;

        if(response.tag==="payRequest") try {
            response.decodedMetadata = JSON.parse(response.metadata)
        } catch (err) {
            response.decodedMetadata = []
        }

        if(!isLNURLPayParams(response) && !isLNURLWithdrawParams(response)) return null;

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
    static async getLNURLType(str: string, shouldRetry?: boolean, timeout?: number, abortSignal?: AbortSignal): Promise<LNURLPay | LNURLWithdraw | null> {
        let res: any = await LNURL.getLNURL(str, shouldRetry, timeout, abortSignal);

        if(res.tag==="payRequest") {
            const payRequest: LNURLPayParamsWithUrl = res;
            let shortDescription: string | undefined = undefined;
            let longDescription: string | undefined = undefined;
            let icon: string | undefined = undefined;
            payRequest.decodedMetadata.forEach(data => {
                switch(data[0]) {
                    case "text/plain":
                        shortDescription = data[1];
                        break;
                    case "text/long-desc":
                        longDescription = data[1];
                        break;
                    case "image/png;base64":
                        icon = "data:"+data[0]+","+data[1];
                        break;
                    case "image/jpeg;base64":
                        icon = "data:"+data[0]+","+data[1];
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
            }
        }
        if(res.tag==="withdrawRequest") {
            const payRequest: LNURLWithdrawParamsWithUrl = res;
            return {
                type: "withdraw",
                min: BigInt(payRequest.minWithdrawable) / 1000n,
                max: BigInt(payRequest.maxWithdrawable) / 1000n,
                params: payRequest
            }
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
    static async useLNURLPay(
        payRequest: LNURLPayParamsWithUrl,
        amount: bigint,
        comment?: string,
        timeout?: number,
        abortSignal?: AbortSignal
    ): Promise<{
        invoice: string,
        parsedInvoice: PaymentRequestObject & { tagsObject: TagsObject; },
        successAction?: LNURLPaySuccessAction
    }> {
        const params = ["amount="+(amount * 1000n).toString(10)];
        if(comment!=null) {
            params.push("comment="+encodeURIComponent(comment));
        }

        const queryParams = (payRequest.callback.includes("?") ? "&" : "?")+params.join("&");

        const response = await tryWithRetries(
            () => httpGet<LNURLPayResult | LNURLError>(payRequest.callback+queryParams, timeout, abortSignal, true),
            undefined, RequestError, abortSignal
        );

        if(isLNURLError(response)) throw new RequestError("LNURL callback error: "+response.reason, 200);
        if(!isLNURLPayResult(response)) throw new RequestError("Invalid LNURL response!", 200);

        const parsedPR = bolt11Decode(response.pr);

        const descHash = Buffer.from(sha256(payRequest.metadata)).toString("hex");
        if(parsedPR.tagsObject.purpose_commit_hash!==descHash)
            throw new RequestError("Invalid invoice received (description hash)!", 200);

        const msats = parsedPR.millisatoshis;
        if(msats==null)
            throw new RequestError("Invalid invoice received (amount msats not defined)", 200);
        const invoiceMSats = BigInt(msats);
        if(invoiceMSats !== (amount * 1000n))
            throw new RequestError("Invalid invoice received (amount)!", 200);

        return {
            invoice: response.pr,
            parsedInvoice: parsedPR,
            successAction: response.successAction ?? undefined
        }
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
    static async postInvoiceToLNURLWithdraw(
        withdrawRequest: {k1: string, callback: string},
        lnpr: string
    ): Promise<void> {
        const params = [
            "pr="+lnpr,
            "k1="+withdrawRequest.k1
        ];
        const queryParams = (withdrawRequest.callback.includes("?") ? "&" : "?")+params.join("&");

        const response = await tryWithRetries(
            () => httpGet<LNURLOk | LNURLError>(withdrawRequest.callback+queryParams, undefined, undefined, true),
            undefined, RequestError
        );

        if(isLNURLError(response)) throw new RequestError("LNURL callback error: " + response.reason, 200);
    }

    /**
     * Uses a LNURL-withdraw request by submitting a lightning network invoice to it
     *
     * @param withdrawRequest Withdrawal request as returned from getLNURL call
     * @param lnpr bolt11 lightning network invoice to submit to the withdrawal endpoint
     * @throws {UserError} In case the provided bolt11 lightning invoice has an amount that is out of bounds for
     *  the specified LNURL-withdraw request
     */
    static async useLNURLWithdraw(
        withdrawRequest: LNURLWithdrawParamsWithUrl,
        lnpr: string
    ): Promise<void> {
        const min = BigInt(withdrawRequest.minWithdrawable) / 1000n;
        const max = BigInt(withdrawRequest.maxWithdrawable) / 1000n;

        const parsedPR = bolt11Decode(lnpr);
        const msats = parsedPR.millisatoshis;
        if(msats==null) throw new UserError("Invoice without msats value field!");
        const amount = (BigInt(msats) + 999n) / 1000n;
        if(amount < min) throw new UserError("Invoice amount less than minimum LNURL-withdraw limit");
        if(amount > max) throw new UserError("Invoice amount more than maximum LNURL-withdraw limit");

        return await LNURL.postInvoiceToLNURLWithdraw(withdrawRequest, lnpr);
    }

    static decodeSuccessAction(successAction?: LNURLPaySuccessAction | null, secret?: string | null): LNURLDecodedSuccessAction | null {
        if(secret==null) return null;
        if(successAction==null) return null;
        if(successAction.tag==="message" && successAction.message!=null) {
            return {
                description: successAction.message
            };
        }
        if(successAction.tag==="url" && successAction.description!=null && successAction.url!=null) {
            return {
                description: successAction.description,
                url: successAction.url
            };
        }
        if(successAction.tag==="aes" && successAction.iv!=null && successAction.ciphertext!=null && successAction.description!=null) {
            const CBC = cbc(Buffer.from(secret, "hex"), Buffer.from(successAction.iv, "hex"));
            let plaintext = CBC.decrypt(Buffer.from(successAction.ciphertext, "base64"));
            // remove padding
            const size = plaintext.length;
            const pad = plaintext[size - 1];
            return {
                description: successAction.description,
                text: Buffer.from(plaintext).toString("utf8", 0, size - pad)
            };
        }
        return null;
    }

}