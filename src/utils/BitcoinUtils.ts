import {BTC_NETWORK, isBytes, PubT, validatePubkey} from "@scure/btc-signer/utils";
import {Buffer} from "buffer";
import {Address, OutScript, Transaction} from "@scure/btc-signer";
import {CoinselectAddressTypes} from "../bitcoin/coinselect2";
import { randomBytes } from "./Utils";


export function fromOutputScript(network: BTC_NETWORK, outputScriptHex: string): string {
    return Address(network).encode(OutScript.decode(Buffer.from(outputScriptHex, "hex")));
}

export function toOutputScript(network: BTC_NETWORK, address: string): Buffer {
    const outputScript = Address(network).decode(address);
    switch(outputScript.type) {
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
            } catch (e: any) {
                let msg = "";
                if(e.name!=null) msg += ": "+e.name;
                if(e.message!=null) msg += ": "+e.message;
                if(typeof(e)==="string") msg += ": "+e;
                msg += ", isBytes: "+isBytes(outputScript.pubkey);
                try {
                    validatePubkey(outputScript.pubkey, PubT.schnorr)
                    msg += ", validatePubkey: success";
                } catch (e: any) {
                    msg += ", validatePubkeyError: ";
                    if(e.name!=null) msg += ": "+e.name;
                    if(e.message!=null) msg += ": "+e.message;
                    if(typeof(e)==="string") msg += ": "+e;
                }
                throw new Error(msg);
            }
    }
    throw new Error(`Unrecognized output script type: ${outputScript.type}`);
}

export function toCoinselectAddressType(outputScript: Uint8Array): CoinselectAddressTypes {
    const data = OutScript.decode(outputScript);
    switch(data.type) {
        case "pkh":
            return "p2pkh";
        case "sh":
            return "p2sh-p2wpkh";
        case "wpkh":
            return "p2wpkh"
        case "wsh":
            return "p2wsh"
        case "tr":
            return "p2tr"
    }
    throw new Error("Unrecognized address type!");
}

function getDummySpec(type: CoinselectAddressTypes) {
    switch(type) {
        case "p2pkh":
            return {
                type: "pkh",
                hash: randomBytes(20)
            } as const;
        case "p2sh-p2wpkh":
            return {
                type: "sh",
                hash: randomBytes(20)
            } as const;
        case "p2wpkh":
            return {
                type: "wpkh",
                hash: randomBytes(20)
            } as const;
        case "p2wsh":
            return {
                type: "wsh",
                hash: randomBytes(32)
            } as const;
        case "p2tr":
            return {
                type: "tr",
                pubkey: Buffer.from("0101010101010101010101010101010101010101010101010101010101010101", "hex")
            } as const;
    }
    throw new Error("Unrecognized address type!");
}

export function getDummyOutputScript(type: CoinselectAddressTypes): Uint8Array {
    return OutScript.encode(getDummySpec(type));
}

export function getDummyAddress(network: BTC_NETWORK, type: CoinselectAddressTypes): string {
    return Address(network).encode(getDummySpec(type));
}

/**
 * General parsers for PSBTs, can parse hex or base64 encoded PSBTs
 * @param _psbt
 */
export function parsePsbtTransaction(_psbt: Transaction | string): Transaction {
    if (typeof (_psbt) === "string") {
        let rawPsbt: Buffer;
        if (/^(?:[0-9a-fA-F]{2})+$/.test(_psbt)) {
            //Hex
            rawPsbt = Buffer.from(_psbt, "hex");
        } else if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(_psbt)) {
            //Base64
            rawPsbt = Buffer.from(_psbt, "base64");
        } else {
            throw new Error("Provided psbt string not base64 nor hex encoded!");
        }
        return Transaction.fromPSBT(rawPsbt, {
            allowUnknownOutputs: true,
            allowUnknownInputs: true,
            allowLegacyWitnessUtxo: true,
        });
    } else {
        return _psbt;
    }
}

