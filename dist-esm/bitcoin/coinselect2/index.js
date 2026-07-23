import { accumulative } from "./accumulative.js";
import { blackjack } from "./blackjack.js";
import { DUST_THRESHOLDS, utils } from "./utils.js";
// order by descending value, minus the inputs approximate fee
function utxoScore(x, feeRate) {
    let valueAfterFee = x.value - (feeRate * utils.inputBytes(x));
    if (x.cpfp != null && x.cpfp.txEffectiveFeeRate < feeRate)
        valueAfterFee -= x.cpfp.txVsize * (feeRate - x.cpfp.txEffectiveFeeRate);
    return valueAfterFee;
}
export { DUST_THRESHOLDS };
export function coinSelect(utxos, outputs, feeRate, type, requiredInputs) {
    // order by descending value, minus the inputs approximate fee
    utxos = utxos.sort((a, b) => {
        // if(a.cpfp!=null && b.cpfp==null) return 1;
        // if(a.cpfp==null && b.cpfp!=null) return -1;
        return utxoScore(b, feeRate) - utxoScore(a, feeRate);
    });
    // attempt to use the blackjack strategy first (no change output)
    const base = blackjack(utxos, outputs, feeRate, type, requiredInputs);
    if (base.inputs)
        return base;
    // else, try the accumulative strategy
    return accumulative(utxos, outputs, feeRate, type, requiredInputs);
}
export function maxSendable(utxos, output, feeRate, requiredInputs, additionalOutputs, skipDetrimental) {
    skipDetrimental ??= true;
    if (!isFinite(utils.numberOrNaN(feeRate)))
        throw new Error("Invalid feeRate passed!");
    const outputs = additionalOutputs ?? [];
    const inputs = requiredInputs ?? [];
    let cpfpAddFee = 0;
    let inAccum = utils.sumOrNaN(inputs);
    let outAccum = utils.sumOrNaN(outputs);
    for (let i = 0; i < utxos.length; ++i) {
        const utxo = utxos[i];
        const utxoBytes = utils.inputBytes(utxo);
        const utxoFee = feeRate * utxoBytes;
        let cpfpFee = 0;
        if (utxo.cpfp != null && utxo.cpfp.txEffectiveFeeRate < feeRate)
            cpfpFee = Math.ceil(utxo.cpfp.txVsize * (feeRate - utxo.cpfp.txEffectiveFeeRate));
        const utxoValue = utils.uintOrNaN(utxo.value);
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
    const transactionSize = utils.transactionBytes(inputs, [...outputs, output]);
    const fee = utils.calculateFee(transactionSize, feeRate, cpfpAddFee);
    const outputValue = inAccum - fee - outAccum;
    const dustThreshold = DUST_THRESHOLDS[output.type];
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
