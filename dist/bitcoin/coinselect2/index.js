"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maxSendable = exports.coinSelect = exports.DUST_THRESHOLDS = void 0;
const accumulative_js_1 = require("./accumulative.js");
const blackjack_js_1 = require("./blackjack.js");
const utils_js_1 = require("./utils.js");
Object.defineProperty(exports, "DUST_THRESHOLDS", { enumerable: true, get: function () { return utils_js_1.DUST_THRESHOLDS; } });
// order by descending value, minus the inputs approximate fee
function utxoScore(x, feeRate) {
    let valueAfterFee = x.value - (feeRate * utils_js_1.utils.inputBytes(x));
    if (x.cpfp != null && x.cpfp.txEffectiveFeeRate < feeRate)
        valueAfterFee -= x.cpfp.txVsize * (feeRate - x.cpfp.txEffectiveFeeRate);
    return valueAfterFee;
}
function coinSelect(utxos, outputs, feeRate, type, requiredInputs) {
    // order by descending value, minus the inputs approximate fee
    utxos = utxos.sort((a, b) => {
        // if(a.cpfp!=null && b.cpfp==null) return 1;
        // if(a.cpfp==null && b.cpfp!=null) return -1;
        return utxoScore(b, feeRate) - utxoScore(a, feeRate);
    });
    // attempt to use the blackjack strategy first (no change output)
    const base = (0, blackjack_js_1.blackjack)(utxos, outputs, feeRate, type, requiredInputs);
    if (base.inputs)
        return base;
    // else, try the accumulative strategy
    return (0, accumulative_js_1.accumulative)(utxos, outputs, feeRate, type, requiredInputs);
}
exports.coinSelect = coinSelect;
function maxSendable(utxos, output, feeRate, requiredInputs, additionalOutputs, skipDetrimental) {
    skipDetrimental ??= true;
    if (!isFinite(utils_js_1.utils.numberOrNaN(feeRate)))
        throw new Error("Invalid feeRate passed!");
    const outputs = additionalOutputs ?? [];
    const inputs = requiredInputs ?? [];
    let cpfpAddFee = 0;
    let inAccum = utils_js_1.utils.sumOrNaN(inputs);
    let outAccum = utils_js_1.utils.sumOrNaN(outputs);
    for (let i = 0; i < utxos.length; ++i) {
        const utxo = utxos[i];
        const utxoBytes = utils_js_1.utils.inputBytes(utxo);
        const utxoFee = feeRate * utxoBytes;
        let cpfpFee = 0;
        if (utxo.cpfp != null && utxo.cpfp.txEffectiveFeeRate < feeRate)
            cpfpFee = Math.ceil(utxo.cpfp.txVsize * (feeRate - utxo.cpfp.txEffectiveFeeRate));
        const utxoValue = utils_js_1.utils.uintOrNaN(utxo.value);
        // skip detrimental input
        if (skipDetrimental && utxoFee + cpfpFee > utxo.value) {
            continue;
        }
        inAccum += utxoValue;
        cpfpAddFee += cpfpFee;
        inputs.push(utxo);
    }
    // Calculate the complete transaction size after selecting the inputs so transactionBytes()
    // can include the SegWit marker and flag when the first selected input is a SegWit input.
    const transactionSize = utils_js_1.utils.transactionBytes(inputs, [...outputs, output]);
    const fee = utils_js_1.utils.calculateFee(transactionSize, feeRate, cpfpAddFee);
    const outputValue = inAccum - fee - outAccum;
    const dustThreshold = utils_js_1.DUST_THRESHOLDS[output.type];
    if (outputValue < dustThreshold)
        return {
            selectedUtxos: inputs,
            fee,
            value: 0
        };
    return {
        selectedUtxos: inputs,
        fee,
        value: outputValue
    };
}
exports.maxSendable = maxSendable;
