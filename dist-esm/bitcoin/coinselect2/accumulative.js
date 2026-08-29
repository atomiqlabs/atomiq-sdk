import { utils } from "./utils.js";
import { getLogger } from "../../utils/Logger.js";
const logger = getLogger("CoinSelect: ");
// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
export function accumulative(utxos, outputs, feeRate, type, requiredInputs) {
    if (!isFinite(utils.numberOrNaN(feeRate)))
        throw new Error("Invalid feeRate passed!");
    const inputs = requiredInputs == null ? [] : [...requiredInputs];
    let bytesAccum = utils.transactionBytes(inputs, outputs, type);
    let fee = utils.calculateFee(bytesAccum, feeRate);
    let cpfpAddFee = 0;
    let inAccum = utils.sumOrNaN(inputs);
    const outAccum = utils.sumOrNaN(outputs);
    logger.debug("accumulative(): total output: ", outAccum);
    for (let i = 0; i < utxos.length; ++i) {
        const utxo = utxos[i];
        const utxoBytes = utils.inputBytes(utxo);
        const utxoFee = feeRate * utxoBytes;
        const utxoValue = utils.uintOrNaN(utxo.value);
        const cpfpFee = utils.inputCpfpAdditionalFee(utxo, feeRate);
        // skip detrimental input
        if (utxoFee + cpfpFee > utxo.value) {
            logger.debug("accumulative(" + i + "): Skipping detrimental output, cpfpFee: " + cpfpFee + " utxoFee: " + utxoFee + " value: " + utxo.value);
            if (i === utxos.length - 1)
                return {
                    fee: utils.calculateFee(bytesAccum + utxoBytes, feeRate, cpfpAddFee + cpfpFee)
                };
            continue;
        }
        bytesAccum += utxoBytes;
        inAccum += utxoValue;
        cpfpAddFee += cpfpFee;
        inputs.push(utxo);
        fee = utils.calculateFee(bytesAccum, feeRate, cpfpAddFee);
        logger.debug("accumulative(" + i + "): total fee: ", fee);
        logger.debug("accumulative(" + i + "): input value: ", inAccum);
        logger.debug("accumulative(" + i + "): cpfpAddFee: ", cpfpAddFee);
        // go again?
        if (inAccum < outAccum + fee)
            continue;
        logger.debug("accumulative(" + i + "): Finalizing transaction, inputs: ", inputs);
        logger.debug("accumulative(" + i + "): Finalizing transaction, outputs: ", outputs);
        logger.debug("accumulative(" + i + "): Finalizing transaction, feeRate: ", feeRate);
        return utils.finalize(inputs, outputs, feeRate, type);
    }
    return { fee };
}
