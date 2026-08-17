import { isBytes, PubT, validatePubkey } from "@scure/btc-signer/utils";
import { Buffer } from "buffer";
import { Address, OutScript, Transaction } from "@scure/btc-signer";
import { randomBytes } from "./Utils.js";
export function fromOutputScript(network, outputScriptHex) {
    return Address(network).encode(OutScript.decode(Buffer.from(outputScriptHex, "hex")));
}
export function toOutputScript(network, address) {
    const outputScript = Address(network).decode(address);
    switch (outputScript.type) {
        case "pkh":
        case "sh":
        case "wpkh":
        case "wsh":
            return Buffer.from(OutScript.encode({
                type: outputScript.type,
                hash: outputScript.hash
            }));
        case "tr":
            try {
                return Buffer.from(OutScript.encode({
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
                msg += ", isBytes: " + isBytes(outputScript.pubkey);
                try {
                    validatePubkey(outputScript.pubkey, PubT.schnorr);
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
export function toCoinselectAddressType(outputScript) {
    const data = OutScript.decode(outputScript);
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
function getDummySpec(type) {
    switch (type) {
        case "p2pkh":
            return {
                type: "pkh",
                hash: randomBytes(20)
            };
        case "p2sh-p2wpkh":
            return {
                type: "sh",
                hash: randomBytes(20)
            };
        case "p2wpkh":
            return {
                type: "wpkh",
                hash: randomBytes(20)
            };
        case "p2wsh":
            return {
                type: "wsh",
                hash: randomBytes(32)
            };
        case "p2tr":
            return {
                type: "tr",
                pubkey: Buffer.from("0101010101010101010101010101010101010101010101010101010101010101", "hex")
            };
    }
    throw new Error("Unrecognized address type!");
}
export function getDummyOutputScript(type) {
    return OutScript.encode(getDummySpec(type));
}
export function getDummyAddress(network, type) {
    return Address(network).encode(getDummySpec(type));
}
/**
 * General parsers for PSBTs, can parse hex or base64 encoded PSBTs
 * @param _psbt
 */
export function parsePsbtTransaction(_psbt) {
    if (typeof (_psbt) === "string") {
        let rawPsbt;
        if (/^(?:[0-9a-fA-F]{2})+$/.test(_psbt)) {
            //Hex
            rawPsbt = Buffer.from(_psbt, "hex");
        }
        else if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(_psbt)) {
            //Base64
            rawPsbt = Buffer.from(_psbt, "base64");
        }
        else {
            throw new Error("Provided psbt string not base64 nor hex encoded!");
        }
        return Transaction.fromPSBT(rawPsbt, {
            allowUnknownOutputs: true,
            allowUnknownInputs: true,
            allowLegacyWitnessUtxo: true,
        });
    }
    else {
        return _psbt;
    }
}
export function getVoutIndex(psbt, network, address, amount) {
    const script = toOutputScript(network, address);
    for (let i = 0; i < psbt.outputsLength; i++) {
        const output = psbt.getOutput(i);
        if (output.amount === amount &&
            output.script != null &&
            script.equals(Buffer.from(output.script))) {
            return i;
        }
    }
}
export function getSenderAddress(psbt, network, inputIndex = 0) {
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
        return Address(network).encode(OutScript.decode(script));
    }
    catch (e) {
        return Buffer.from(script).toString("hex");
    }
}
