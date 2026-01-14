import { PaymentRequestObject, TagsObject } from "@atomiqlabs/bolt11";
import { LNURLWithdraw, LNURLWithdrawParamsWithUrl } from "../types/lnurl/LNURLWithdraw";
import { LNURLDecodedSuccessAction, LNURLPay, LNURLPayParamsWithUrl } from "../types/lnurl/LNURLPay";
export type LNURLPaySuccessAction = {
    tag: string;
    description: string | null;
    url: string | null;
    message: string | null;
    ciphertext: string | null;
    iv: string | null;
};
export declare function isLNURLPaySuccessAction(obj: any, domain?: string): obj is LNURLPaySuccessAction;
export declare class LNURL {
    private static findBech32LNURL;
    private static isBech32LNURL;
    /**
     * Checks whether a provided string is bare (non bech32 encoded) lnurl
     * @param str
     * @private
     */
    private static isBareLNURL;
    /**
     * Checks if the provided string is a lightning network address (e.g. satoshi@nakamoto.com)
     * @param str
     * @private
     */
    private static isLightningAddress;
    /**
     * Checks whether a given string is a LNURL or lightning address
     * @param str
     */
    static isLNURL(str: string): boolean;
    /**
     * Extracts the URL that needs to be request from LNURL or lightning address
     * @param str
     * @private
     * @returns An URL to send the request to, or null if it cannot be parsed
     */
    private static extractCallUrl;
    /**
     * Sends a request to obtain data about a specific LNURL or lightning address
     *
     * @param str A lnurl or lightning address
     * @param shouldRetry Whether we should retry in case of network failure
     * @param timeout Request timeout in milliseconds
     * @param abortSignal
     */
    static getLNURL(str: string, shouldRetry?: boolean, timeout?: number, abortSignal?: AbortSignal): Promise<LNURLPayParamsWithUrl | LNURLWithdrawParamsWithUrl | null>;
    /**
     * Sends a request to obtain data about a specific LNURL or lightning address
     *
     * @param str A lnurl or lightning address
     * @param shouldRetry Whether we should retry in case of network failure
     * @param timeout Request timeout in milliseconds
     * @param abortSignal
     */
    static getLNURLType(str: string, shouldRetry?: boolean, timeout?: number, abortSignal?: AbortSignal): Promise<LNURLPay | LNURLWithdraw | null>;
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
    static useLNURLPay(payRequest: LNURLPayParamsWithUrl, amount: bigint, comment?: string, timeout?: number, abortSignal?: AbortSignal): Promise<{
        invoice: string;
        parsedInvoice: PaymentRequestObject & {
            tagsObject: TagsObject;
        };
        successAction?: LNURLPaySuccessAction;
    }>;
    /**
     * Submits the bolt11 lightning invoice to the lnurl withdraw url
     *
     * @param withdrawRequest Withdraw request to use
     * @param withdrawRequest.k1 K1 parameter
     * @param withdrawRequest.callback A URL to call
     * @param lnpr bolt11 lightning network invoice to submit to the withdrawal endpoint
     * @throws {RequestError} If the response is non-200 or status: ERROR
     */
    static postInvoiceToLNURLWithdraw(withdrawRequest: {
        k1: string;
        callback: string;
    }, lnpr: string): Promise<void>;
    /**
     * Uses a LNURL-withdraw request by submitting a lightning network invoice to it
     *
     * @param withdrawRequest Withdrawal request as returned from getLNURL call
     * @param lnpr bolt11 lightning network invoice to submit to the withdrawal endpoint
     * @throws {UserError} In case the provided bolt11 lightning invoice has an amount that is out of bounds for
     *  the specified LNURL-withdraw request
     */
    static useLNURLWithdraw(withdrawRequest: LNURLWithdrawParamsWithUrl, lnpr: string): Promise<void>;
    static decodeSuccessAction(successAction?: LNURLPaySuccessAction | null, secret?: string | null): LNURLDecodedSuccessAction | null;
}
