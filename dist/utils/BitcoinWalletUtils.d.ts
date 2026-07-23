import { IBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet.js";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { BitcoinNetwork, BitcoinRpc, BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
import { Transaction } from "@scure/btc-signer";
import { CoinselectAddressTypes } from "../bitcoin/coinselect2";
export declare function toBitcoinWallet(_bitcoinWallet: IBitcoinWallet | {
    address: string;
    publicKey: string;
}, btcRpc: BitcoinRpcWithAddressIndex<any>, bitcoinNetwork: BTC_NETWORK | BitcoinNetwork): IBitcoinWallet;
export declare function addPsbtInputs(psbt: Transaction, inputs: {
    txId: string;
    vout: number;
    type: CoinselectAddressTypes;
    outputScript: Uint8Array;
    publicKey: string;
    value: number;
}[], rpc: BitcoinRpc<any>, network: BTC_NETWORK): Promise<void>;
