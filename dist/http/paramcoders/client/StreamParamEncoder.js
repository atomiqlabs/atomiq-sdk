"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamParamEncoder = void 0;
const ParamEncoder_js_1 = require("../ParamEncoder.js");
class StreamParamEncoder extends ParamEncoder_js_1.ParamEncoder {
    constructor() {
        let stream = new TransformStream();
        let writeStream = stream.writable.getWriter();
        writeStream.closed.then(() => this.closed = true);
        super(writeStream.write.bind(writeStream), () => {
            if (this.closed)
                return Promise.resolve();
            this.closed = true;
            return writeStream.close();
        });
        this.closed = false;
        this.stream = stream;
    }
    /**
     * Returns the readable stream to be passed to the fetch API
     */
    getReadableStream() {
        return this.stream.readable;
    }
}
exports.StreamParamEncoder = StreamParamEncoder;
