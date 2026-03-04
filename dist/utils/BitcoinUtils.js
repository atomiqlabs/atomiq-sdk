"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePsbtTransaction = exports.getDummyAddress = exports.getDummyOutputScript = exports.toCoinselectAddressType = exports.toOutputScript = exports.fromOutputScript = void 0;
const utils_1 = require("@scure/btc-signer/utils");
const buffer_1 = require("buffer");
const btc_signer_1 = require("@scure/btc-signer");
const Utils_1 = require("./Utils");
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
function toCoinselectAddressType(outputScript) {
    const data = btc_signer_1.OutScript.decode(outputScript);
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
function getDummySpec(type) {
    switch (type) {
        case "p2pkh":
            return {
                type: "pkh",
                hash: (0, Utils_1.randomBytes)(20)
            };
        case "p2sh-p2wpkh":
            return {
                type: "sh",
                hash: (0, Utils_1.randomBytes)(20)
            };
        case "p2wpkh":
            return {
                type: "wpkh",
                hash: (0, Utils_1.randomBytes)(20)
            };
        case "p2wsh":
            return {
                type: "wsh",
                hash: (0, Utils_1.randomBytes)(32)
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
