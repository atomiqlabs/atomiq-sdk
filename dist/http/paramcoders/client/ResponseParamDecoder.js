"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseParamDecoder = void 0;
const ParamDecoder_1 = require("../ParamDecoder");
const buffer_1 = require("buffer");
const Logger_1 = require("../../../utils/Logger");
const logger = (0, Logger_1.getLogger)("ResponseParamDecoder: ");
class ResponseParamDecoder extends ParamDecoder_1.ParamDecoder {
    constructor(resp, abortSignal) {
        super();
        this.abortSignal = abortSignal;
        try {
            //Read from stream
            if (resp.body == null)
                throw new Error("Response has no body field!");
            this.reader = resp.body.getReader();
            this.readResponse();
        }
        catch (e) {
            //Read in one piece
            resp.arrayBuffer().then(respBuffer => {
                super.onData(buffer_1.Buffer.from(respBuffer));
                super.onEnd();
            }).catch(e => {
                super.onError(e);
            });
        }
        if (abortSignal != null)
            abortSignal.addEventListener("abort", () => {
                super.onError(abortSignal.reason);
                if (this.reader != null && !this.reader.closed)
                    this.reader.cancel(abortSignal.reason);
            });
    }
    /**
     * Keeps reading the response until the reader closes
     * @private
     */
    async readResponse() {
        if (this.reader == null)
            return;
        while (true) {
            const readResp = await this.reader.read().catch(e => {
                logger.error("readResponse(): Error reading response: ", e);
                return null;
            });
            if (this.abortSignal != null && this.abortSignal.aborted)
                return;
            if (readResp == null || readResp.done) {
                super.onEnd();
                return;
            }
            super.onData(buffer_1.Buffer.from(readResp.value));
        }
    }
}
exports.ResponseParamDecoder = ResponseParamDecoder;
