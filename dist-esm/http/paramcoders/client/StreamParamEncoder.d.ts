/// <reference types="node" resolution-mode="require"/>
/// <reference types="node" resolution-mode="require"/>
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
