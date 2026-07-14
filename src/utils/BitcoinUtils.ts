import {BTC_NETWORK, isBytes, PubT, validatePubkey} from "@scure/btc-signer/utils";
import {Buffer} from "buffer";
import {Address, OutScript, Transaction} from "@scure/btc-signer";
import {CoinselectAddressTypes} from "../bitcoin/coinselect2/index.js";
import { randomBytes } from "./Utils.js";
import type {BitcoinRpcWithAddressIndex} from "@atomiqlabs/base";
import type {BitcoinWalletUtxo} from "../bitcoin/wallet/IBitcoinWallet.js";


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

/**
 * Infers the coin selection address type from either an output script or a Bitcoin address on a specific network.
 *
 * @param outputScript Output script to decode when inferring from PSBT/transaction data
 * @returns Address type used by the wallet coin selection utilities
 */
export function toCoinselectAddressType(outputScript: Uint8Array): CoinselectAddressTypes;
/**
 * Infers the coin selection address type from a Bitcoin address on a specific network.
 *
 * @param network Bitcoin network used to decode the address
 * @param address Bitcoin address to classify
 * @returns Address type used by the wallet coin selection utilities
 */
export function toCoinselectAddressType(network: BTC_NETWORK, address: string): CoinselectAddressTypes;
export function toCoinselectAddressType(
    outputScriptOrNetwork: Uint8Array | BTC_NETWORK,
    address?: string
): CoinselectAddressTypes {
    const data = address == null
        ? OutScript.decode(outputScriptOrNetwork as Uint8Array)
        : Address(outputScriptOrNetwork as BTC_NETWORK).decode(address);
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
export async function getWalletAddressUtxos(
    bitcoinRpc: BitcoinRpcWithAddressIndex<any>,
    network: BTC_NETWORK,
    address: string,
    publicKey: string,
    addressType?: CoinselectAddressTypes
): Promise<BitcoinWalletUtxo[]> {
    const resolvedAddressType = addressType ?? toCoinselectAddressType(network, address);

    const utxos = await bitcoinRpc.getAddressUTXOs(address);
    const outputScript = toOutputScript(network, address);

    return await Promise.all(utxos.map(async utxo => ({
        vout: utxo.vout,
        txId: utxo.txid,
        value: Number(utxo.value),
        type: resolvedAddressType,
        outputScript,
        address,
        publicKey,
        cpfp: !utxo.confirmed ? await bitcoinRpc.getCPFPData(utxo.txid).then(result => {
            if(result == null) return undefined;
            return {
                txVsize: result.adjustedVsize,
                txEffectiveFeeRate: result.effectiveFeePerVsize
            };
        }) : undefined,
        confirmed: utxo.confirmed
    })));
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

export function getVoutIndex(psbt: Transaction, network: BTC_NETWORK, address: string, amount: bigint): number | undefined {
    const script = toOutputScript(network, address);
    for(let i=0;i<psbt.outputsLength;i++) {
        const output = psbt.getOutput(i);
        if(
            output.amount===amount &&
            output.script!=null &&
            script.equals(Buffer.from(output.script))
        ) {
            return i;
        }
    }
}

export function getSenderAddress(psbt: Transaction, network: BTC_NETWORK, inputIndex: number = 0): string | undefined {
    if(psbt.inputsLength<=inputIndex) return undefined;

    const input = psbt.getInput(inputIndex);
    let script: Uint8Array | undefined;
    if(input.witnessUtxo?.script!=null) {
        script = input.witnessUtxo.script as Uint8Array;
    } else if(input.nonWitnessUtxo!=null && input.index!=null) {
        script = input.nonWitnessUtxo.outputs[input.index]?.script;
    }
    if(script==null) return undefined;

    try {
        return Address(network).encode(OutScript.decode(script));
    } catch (e) {
        return Buffer.from(script).toString("hex");
    }
}

export function getUtxoKey(utxo: {txId: string, vout: number}): string {
    return `${utxo.txId}:${utxo.vout}`;
}

export function toUtxoMap<T extends {txId: string, vout: number}>(utxos: T[]): Map<string, T> {
    return new Map<string, T>(utxos.map(utxo => ([getUtxoKey(utxo), utxo])));
}

export function toUtxoSet(utxos: {txId: string, vout: number}[]): Set<string> {
    return new Set<string>(utxos.map(utxo => getUtxoKey(utxo)));
}
