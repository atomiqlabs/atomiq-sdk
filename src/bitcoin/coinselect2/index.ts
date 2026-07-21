import {accumulative} from "./accumulative.js"
import {blackjack} from "./blackjack.js"
import {CoinselectAddressTypes, CoinselectTxInput, CoinselectTxOutput, DUST_THRESHOLDS, utils} from "./utils.js"

// order by descending value, minus the inputs approximate fee
function utxoScore (x: CoinselectTxInput, feeRate: number) {
    let valueAfterFee = x.value - (feeRate * utils.inputBytes(x))
    if(x.cpfp!=null && x.cpfp.txEffectiveFeeRate<feeRate) valueAfterFee -= x.cpfp.txVsize*(feeRate - x.cpfp.txEffectiveFeeRate);
    return valueAfterFee;
}

export {CoinselectAddressTypes, CoinselectTxInput, CoinselectTxOutput, DUST_THRESHOLDS};

export function coinSelect (
    utxos: CoinselectTxInput[],
    outputs: CoinselectTxOutput[],
    feeRate: number,
    type: CoinselectAddressTypes,
    requiredInputs?: CoinselectTxInput[]
): {
    inputs?: CoinselectTxInput[],
    outputs?: CoinselectTxOutput[],
    effectiveFeeRate?: number,
    fee: number
} {
    // order by descending value, minus the inputs approximate fee
    utxos = utxos.sort((a, b) => {
        // if(a.cpfp!=null && b.cpfp==null) return 1;
        // if(a.cpfp==null && b.cpfp!=null) return -1;
        return utxoScore(b, feeRate) - utxoScore(a, feeRate);
    });

    // attempt to use the blackjack strategy first (no change output)
    const base = blackjack(utxos, outputs, feeRate, type, requiredInputs);
    if (base.inputs) return base;

    // else, try the accumulative strategy
    return accumulative(utxos, outputs, feeRate, type, requiredInputs);
}

export function maxSendable (
    utxos: Omit<CoinselectTxInput, "txId" | "address" | "vout" | "outputScript">[],
    output: {script: Buffer, type: CoinselectAddressTypes},
    feeRate: number,
    requiredInputs?: Omit<CoinselectTxInput, "txId" | "address" | "vout" | "outputScript">[],
    additionalOutputs?: {script: Buffer, value: number}[],
    skipDetrimental?: boolean
): {
    selectedUtxos: Omit<CoinselectTxInput, "txId" | "address" | "vout" | "outputScript">[],
    value: number,
    fee: number
} {
    skipDetrimental ??= true;
    if (!isFinite(utils.numberOrNaN(feeRate))) throw new Error("Invalid feeRate passed!");

    const outputs = additionalOutputs ?? [];
    const inputs = requiredInputs ?? [];
    let bytesAccum = utils.transactionBytes(inputs, (outputs as {script: Buffer}[]).concat([output]));
    let cpfpAddFee = 0;
    let inAccum = utils.sumOrNaN(inputs);
    let outAccum = utils.sumOrNaN(outputs);

    for (let i = 0; i < utxos.length; ++i) {
        const utxo = utxos[i];
        const utxoBytes = utils.inputBytes(utxo);
        const utxoFee = feeRate * utxoBytes;
        let cpfpFee = 0;
        if(utxo.cpfp!=null && utxo.cpfp.txEffectiveFeeRate<feeRate) cpfpFee = Math.ceil(utxo.cpfp.txVsize*(feeRate - utxo.cpfp.txEffectiveFeeRate));
        const utxoValue = utils.uintOrNaN(utxo.value);

        // skip detrimental input
        if (skipDetrimental && utxoFee + cpfpFee > utxo.value) {
            continue;
        }

        bytesAccum += utxoBytes;
        inAccum += utxoValue;
        cpfpAddFee += cpfpFee;
        inputs.push(utxo);
    }

    const fee = utils.calculateFee(bytesAccum, feeRate, cpfpAddFee);
    const outputValue = inAccum - fee - outAccum;

    const dustThreshold = DUST_THRESHOLDS[output.type];

    if(outputValue<dustThreshold) return {
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
