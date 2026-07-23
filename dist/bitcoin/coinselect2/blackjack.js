"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blackjack = void 0;
const utils_js_1 = require("./utils.js");
// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
function blackjack(utxos, outputs, feeRate, type, requiredInputs) {
    if (!isFinite(utils_js_1.utils.numberOrNaN(feeRate)))
        throw new Error("Invalid feeRate passed!");
    const inputs = requiredInputs == null ? [] : [...requiredInputs];
    let bytesAccum = utils_js_1.utils.transactionBytes(inputs, outputs, type);
    let inAccum = utils_js_1.utils.sumOrNaN(inputs);
    let cpfpAddFee = 0;
    const outAccum = utils_js_1.utils.sumOrNaN(outputs);
    const threshold = utils_js_1.utils.dustThreshold({ type });
    for (let i = 0; i < utxos.length; ++i) {
        const input = utxos[i];
        const inputBytes = utils_js_1.utils.inputBytes(input);
        const cpfpFee = utils_js_1.utils.inputCpfpAdditionalFee(input, feeRate);
        const fee = utils_js_1.utils.calculateFee(bytesAccum + inputBytes, feeRate, cpfpAddFee + cpfpFee);
        const inputValue = utils_js_1.utils.uintOrNaN(input.value);
        // would it waste value?
        if ((inAccum + inputValue) > (outAccum + fee + threshold))
            continue;
        bytesAccum += inputBytes;
        inAccum += inputValue;
        cpfpAddFee += cpfpFee;
        inputs.push(input);
        // go again?
        if (inAccum < outAccum + fee)
            continue;
        return utils_js_1.utils.finalize(inputs, outputs, feeRate, type);
    }
    return { fee: utils_js_1.utils.calculateFee(bytesAccum, feeRate, cpfpAddFee) };
}
exports.blackjack = blackjack;
