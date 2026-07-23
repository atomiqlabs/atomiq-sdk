"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUtxoSet = exports.toUtxoMap = exports.getUtxoKey = exports.getSenderAddress = exports.getVoutIndex = exports.parsePsbtTransaction = exports.getDummyAddress = exports.getDummyOutputScript = exports.getWalletAddressUtxos = exports.toCoinselectAddressType = exports.toOutputScript = exports.fromOutputScript = void 0;
const utils_1 = require("@scure/btc-signer/utils");
const buffer_1 = require("buffer");
const btc_signer_1 = require("@scure/btc-signer");
const Utils_js_1 = require("./Utils.js");
function fromOutputScript(network, outputScriptHex) {
    return (0, btc_signer_1.Address)(network).encode(btc_signer_1.OutScript.decode(buffer_1.Buffer.from(outputScriptHex, "hex")));
}
exports.fromOutputScript = fromOutputScript;
function toOutputScript(network, address) {
    const outputScript = (0, btc_signer_1.Address)(network).decode(address);
    switch (outputScript.type) {
        case "pkh":
        case "sh":
        case "wpkh":
        case "wsh":
            return buffer_1.Buffer.from(btc_signer_1.OutScript.encode({
                type: outputScript.type,
                hash: outputScript.hash
            }));
        case "tr":
            try {
                return buffer_1.Buffer.from(btc_signer_1.OutScript.encode({
                    type: "tr",
                    pubkey: outputScript.pubkey
                }));
            }
            catch (e) {
                let msg = "";
                if (e.name != null)
                    msg += ": " + e.name;
                if (e.message != null)
                    msg += ": " + e.message;
                if (typeof (e) === "string")
                    msg += ": " + e;
                msg += ", isBytes: " + (0, utils_1.isBytes)(outputScript.pubkey);
                try {
                    (0, utils_1.validatePubkey)(outputScript.pubkey, utils_1.PubT.schnorr);
                    msg += ", validatePubkey: success";
                }
                catch (e) {
                    msg += ", validatePubkeyError: ";
                    if (e.name != null)
                        msg += ": " + e.name;
                    if (e.message != null)
                        msg += ": " + e.message;
                    if (typeof (e) === "string")
                        msg += ": " + e;
                }
                throw new Error(msg);
            }
    }
    throw new Error(`Unrecognized output script type: ${outputScript.type}`);
}
exports.toOutputScript = toOutputScript;
function toCoinselectAddressType(outputScriptOrNetwork, address) {
    const data = address == null
        ? btc_signer_1.OutScript.decode(outputScriptOrNetwork)
        : (0, btc_signer_1.Address)(outputScriptOrNetwork).decode(address);
    switch (data.type) {
        case "pkh":
            return "p2pkh";
        case "sh":
            return "p2sh-p2wpkh";
        case "wpkh":
            return "p2wpkh";
        case "wsh":
            return "p2wsh";
        case "tr":
            return "p2tr";
    }
    throw new Error("Unrecognized address type!");
}
exports.toCoinselectAddressType = toCoinselectAddressType;
/**
 * Fetches and converts all UTXOs for a Bitcoin address into the SDK wallet UTXO shape.
 *
 * @param bitcoinRpc Bitcoin RPC/address-index backend used for UTXO and CPFP lookups
 * @param network Bitcoin network used to decode the address and output script
 * @param address Bitcoin address whose current UTXOs should be returned
 * @param publicKey
 * @param addressType Optional precomputed address type; inferred from `address` when omitted
 * @returns Full wallet UTXOs suitable for wallet funding and SPV external deposit execution
 */
async function getWalletAddressUtxos(bitcoinRpc, network, address, publicKey, addressType) {
    const resolvedAddressType = addressType ?? toCoinselectAddressType(network, address);
    const utxos = await bitcoinRpc.getAddressUTXOs(address);
    const outputScript = toOutputScript(network, address);
    return await Promise.all(utxos.map(async (utxo) => ({
        vout: utxo.vout,
        txId: utxo.txid,
        value: Number(utxo.value),
        type: resolvedAddressType,
        outputScript,
        address,
        publicKey,
        cpfp: !utxo.confirmed ? await bitcoinRpc.getCPFPData(utxo.txid).then(result => {
            if (result == null)
                return undefined;
            return {
                txVsize: result.adjustedVsize,
                txEffectiveFeeRate: result.effectiveFeePerVsize
            };
        }) : undefined,
        confirmed: utxo.confirmed
    })));
}
exports.getWalletAddressUtxos = getWalletAddressUtxos;
function getDummySpec(type) {
    switch (type) {
        case "p2pkh":
            return {
                type: "pkh",
                hash: (0, Utils_js_1.randomBytes)(20)
            };
        case "p2sh-p2wpkh":
            return {
                type: "sh",
                hash: (0, Utils_js_1.randomBytes)(20)
            };
        case "p2wpkh":
            return {
                type: "wpkh",
                hash: (0, Utils_js_1.randomBytes)(20)
            };
        case "p2wsh":
            return {
                type: "wsh",
                hash: (0, Utils_js_1.randomBytes)(32)
            };
        case "p2tr":
            return {
                type: "tr",
                pubkey: buffer_1.Buffer.from("0101010101010101010101010101010101010101010101010101010101010101", "hex")
            };
    }
    throw new Error("Unrecognized address type!");
}
function getDummyOutputScript(type) {
    return btc_signer_1.OutScript.encode(getDummySpec(type));
}
exports.getDummyOutputScript = getDummyOutputScript;
function getDummyAddress(network, type) {
    return (0, btc_signer_1.Address)(network).encode(getDummySpec(type));
}
exports.getDummyAddress = getDummyAddress;
/**
 * General parsers for PSBTs, can parse hex or base64 encoded PSBTs
 * @param _psbt
 */
function parsePsbtTransaction(_psbt) {
    if (typeof (_psbt) === "string") {
        let rawPsbt;
        if (/^(?:[0-9a-fA-F]{2})+$/.test(_psbt)) {
            //Hex
            rawPsbt = buffer_1.Buffer.from(_psbt, "hex");
        }
        else if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(_psbt)) {
            //Base64
            rawPsbt = buffer_1.Buffer.from(_psbt, "base64");
        }
        else {
            throw new Error("Provided psbt string not base64 nor hex encoded!");
        }
        return btc_signer_1.Transaction.fromPSBT(rawPsbt, {
            allowUnknownOutputs: true,
            allowUnknownInputs: true,
            allowLegacyWitnessUtxo: true,
        });
    }
    else {
        return _psbt;
    }
}
exports.parsePsbtTransaction = parsePsbtTransaction;
function getVoutIndex(psbt, network, address, amount) {
    const script = toOutputScript(network, address);
    for (let i = 0; i < psbt.outputsLength; i++) {
        const output = psbt.getOutput(i);
        if (output.amount === amount &&
            output.script != null &&
            script.equals(buffer_1.Buffer.from(output.script))) {
            return i;
        }
    }
}
exports.getVoutIndex = getVoutIndex;
function getSenderAddress(psbt, network, inputIndex = 0) {
    if (psbt.inputsLength <= inputIndex)
        return undefined;
    const input = psbt.getInput(inputIndex);
    let script;
    if (input.witnessUtxo?.script != null) {
        script = input.witnessUtxo.script;
    }
    else if (input.nonWitnessUtxo != null && input.index != null) {
        script = input.nonWitnessUtxo.outputs[input.index]?.script;
    }
    if (script == null)
        return undefined;
    try {
        return (0, btc_signer_1.Address)(network).encode(btc_signer_1.OutScript.decode(script));
    }
    catch (e) {
        return buffer_1.Buffer.from(script).toString("hex");
    }
}
exports.getSenderAddress = getSenderAddress;
function getUtxoKey(utxo) {
    return `${utxo.txId}:${utxo.vout}`;
}
exports.getUtxoKey = getUtxoKey;
function toUtxoMap(utxos) {
    return new Map(utxos.map(utxo => ([getUtxoKey(utxo), utxo])));
}
exports.toUtxoMap = toUtxoMap;
function toUtxoSet(utxos) {
    return new Set(utxos.map(utxo => getUtxoKey(utxo)));
}
exports.toUtxoSet = toUtxoSet;
