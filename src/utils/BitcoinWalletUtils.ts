import {BitcoinWalletUtxo, IBitcoinWallet, isIBitcoinWallet} from "../bitcoin/wallet/IBitcoinWallet.js";
import {BTC_NETWORK} from "@scure/btc-signer/utils";
import {SingleAddressBitcoinWallet} from "../bitcoin/wallet/SingleAddressBitcoinWallet.js";
import {BitcoinNetwork, BitcoinRpc, BitcoinRpcWithAddressIndex} from "@atomiqlabs/base";
import {TransactionInputUpdate} from "@scure/btc-signer/psbt";
import {p2tr, p2wpkh, Transaction} from "@scure/btc-signer";
import {Buffer} from "buffer";
import {CoinselectAddressTypes, CoinselectTxInput} from "../bitcoin/coinselect2";

export function toBitcoinWallet(
    _bitcoinWallet: IBitcoinWallet | { address: string, publicKey: string },
    btcRpc: BitcoinRpcWithAddressIndex<any>,
    bitcoinNetwork: BTC_NETWORK | BitcoinNetwork
): IBitcoinWallet {
    if (isIBitcoinWallet(_bitcoinWallet)) {
        return _bitcoinWallet;
    } else {
        return new SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}

export async function addPsbtInputs(
    psbt: Transaction,
    inputs: {
        txId: string,
        vout: number,
        type: CoinselectAddressTypes,
        outputScript: Uint8Array,
        publicKey: string,
        value: number
    }[],
    rpc: BitcoinRpc<any>,
    network: BTC_NETWORK
): Promise<void> {
    const formattedInputs: TransactionInputUpdate[] = await Promise.all<TransactionInputUpdate>(inputs.map(async (input) => {
        switch(input.type) {
            case "p2tr":
                const parsed = p2tr(Buffer.from(input.publicKey!, "hex"));
                return {
                    txid: input.txId,
                    index: input.vout,
                    witnessUtxo: {
                        script: input.outputScript!,
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
                        script: input.outputScript!,
                        amount: BigInt(input.value)
                    },
                    sighashType: 0x01
                };
            case "p2sh-p2wpkh":
                return {
                    txid: input.txId,
                    index: input.vout,
                    witnessUtxo: {
                        script: input.outputScript!,
                        amount: BigInt(input.value)
                    },
                    redeemScript: p2wpkh(Buffer.from(input.publicKey!, "hex"), network).script,
                    sighashType: 0x01
                };
            case "p2pkh":
                const tx = await rpc.getTransaction(input.txId);
                if(tx==null) throw new Error("Cannot fetch existing tx "+input.txId);
                return {
                    txid: input.txId,
                    index: input.vout,
                    nonWitnessUtxo: tx.raw,
                    sighashType: 0x01
                };
            default:
                throw new Error("Invalid input type: "+input.type);
        }
    }));

    formattedInputs.forEach(input => psbt.addInput(input));
}