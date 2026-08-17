/// <reference types="node" />
/// <reference types="node" />
import { ParamEncoder } from "../ParamEncoder.js";
import { Buffer } from "buffer";
export declare class StreamParamEncoder extends ParamEncoder {
    private readonly stream;
    private closed;
    constructor();
    /**
     * Returns the readable stream to be passed to the fetch API
     */
    getReadableStream(): ReadableStream<Buffer>;
}
