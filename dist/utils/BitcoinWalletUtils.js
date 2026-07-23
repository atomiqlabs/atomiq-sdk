"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addPsbtInputs = exports.toBitcoinWallet = void 0;
const IBitcoinWallet_js_1 = require("../bitcoin/wallet/IBitcoinWallet.js");
const SingleAddressBitcoinWallet_js_1 = require("../bitcoin/wallet/SingleAddressBitcoinWallet.js");
const btc_signer_1 = require("@scure/btc-signer");
const buffer_1 = require("buffer");
function toBitcoinWallet(_bitcoinWallet, btcRpc, bitcoinNetwork) {
    if ((0, IBitcoinWallet_js_1.isIBitcoinWallet)(_bitcoinWallet)) {
        return _bitcoinWallet;
    }
    else {
        return new SingleAddressBitcoinWallet_js_1.SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}
exports.toBitcoinWallet = toBitcoinWallet;
async function addPsbtInputs(psbt, inputs, rpc, network) {
    const formattedInputs = await Promise.all(inputs.map(async (input) => {
        switch (input.type) {
            case "p2tr":
                const parsed = (0, btc_signer_1.p2tr)(buffer_1.Buffer.from(input.publicKey, "hex"));
                return {
                    txid: input.txId,
                    index: input.vout,
                    witnessUtxo: {
                        script: input.outputScript,
                        amount: BigInt(input.value)
                    },
                    tapInternalKey: parsed.tapInternalKey,
                    tapMerkleRoot: parsed.tapMerkleRoot,
                    tapLeafScript: parsed.tapLeafScript
                };
            case "p2wpkh":
                return {
                    txid: input.txId,
                    index: input.vout,
                    witnessUtxo: {
                        script: input.outputScript,
                        amount: BigInt(input.value)
                    },
                    sighashType: 0x01
                };
            case "p2sh-p2wpkh":
                return {
                    txid: input.txId,
                    index: input.vout,
                    witnessUtxo: {
                        script: input.outputScript,
                        amount: BigInt(input.value)
                    },
                    redeemScript: (0, btc_signer_1.p2wpkh)(buffer_1.Buffer.from(input.publicKey, "hex"), network).script,
                    sighashType: 0x01
                };
            case "p2pkh":
                const tx = await rpc.getTransaction(input.txId);
                if (tx == null)
                    throw new Error("Cannot fetch existing tx " + input.txId);
                return {
                    txid: input.txId,
                    index: input.vout,
                    nonWitnessUtxo: tx.raw,
                    sighashType: 0x01
                };
            default:
                throw new Error("Invalid input type: " + input.type);
        }
    }));
    formattedInputs.forEach(input => psbt.addInput(input));
}
exports.addPsbtInputs = addPsbtInputs;
