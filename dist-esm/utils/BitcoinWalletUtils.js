import { isIBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet.js";
import { SingleAddressBitcoinWallet } from "../bitcoin/wallet/SingleAddressBitcoinWallet.js";
import { p2tr, p2wpkh } from "@scure/btc-signer";
import { Buffer } from "buffer";
export function toBitcoinWallet(_bitcoinWallet, btcRpc, bitcoinNetwork) {
    if (isIBitcoinWallet(_bitcoinWallet)) {
        return _bitcoinWallet;
    }
    else {
        return new SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}
export async function addPsbtInputs(psbt, inputs, rpc, network) {
    const formattedInputs = await Promise.all(inputs.map(async (input) => {
        switch (input.type) {
            case "p2tr":
                const parsed = p2tr(Buffer.from(input.publicKey, "hex"));
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
                    redeemScript: p2wpkh(Buffer.from(input.publicKey, "hex"), network).script,
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
