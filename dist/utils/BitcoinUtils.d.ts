/// <reference types="node" />
/// <reference types="node" />
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { Buffer } from "buffer";
import { Transaction } from "@scure/btc-signer";
import { CoinselectAddressTypes } from "../bitcoin/coinselect2/index.js";
import { BitcoinRpc, BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
import type { BitcoinWalletUtxo } from "../bitcoin/wallet/IBitcoinWallet.js";
export declare function fromOutputScript(network: BTC_NETWORK, outputScriptHex: string): string;
export declare function toOutputScript(network: BTC_NETWORK, address: string): Buffer;
/**
 * Infers the coin selection address type from either an output script or a Bitcoin address on a specific network.
 *
 * @param outputScript Output script to decode when inferring from PSBT/transaction data
 * @returns Address type used by the wallet coin selection utilities
 */
export declare function toCoinselectAddressType(outputScript: Uint8Array): CoinselectAddressTypes;
/**
 * Infers the coin selection address type from a Bitcoin address on a specific network.
 *
 * @param network Bitcoin network used to decode the address
 * @param address Bitcoin address to classify
 * @returns Address type used by the wallet coin selection utilities
 */
export declare function toCoinselectAddressType(network: BTC_NETWORK, address: string): CoinselectAddressTypes;
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
export declare function getWalletAddressUtxos(bitcoinRpc: BitcoinRpcWithAddressIndex<any>, network: BTC_NETWORK, address: string, publicKey: string, addressType?: CoinselectAddressTypes): Promise<BitcoinWalletUtxo[]>;
export declare function getDummyOutputScript(type: CoinselectAddressTypes): Uint8Array;
export declare function getDummyAddress(network: BTC_NETWORK, type: CoinselectAddressTypes): string;
/**
 * General parsers for PSBTs, can parse hex or base64 encoded PSBTs
 * @param _psbt
 */
export declare function parsePsbtTransaction(_psbt: Transaction | string): Transaction;
export declare function getVoutIndex(psbt: Transaction, network: BTC_NETWORK, address: string, amount: bigint): number | undefined;
export declare function getSenderAddress(psbt: Transaction, network: BTC_NETWORK, inputIndex?: number): string | undefined;
export declare function addPsbtInputs(psbt: Transaction, inputs: {
    txId: string;
    vout: number;
    type: CoinselectAddressTypes;
    outputScript: Uint8Array;
    publicKey: string;
    value: number;
}[], rpc: BitcoinRpc<any>, network: BTC_NETWORK): Promise<void>;
export declare function getUtxoKey(utxo: {
    txId: string;
    vout: number;
}): string;
export declare function toUtxoMap<T extends {
    txId: string;
    vout: number;
}>(utxos: T[]): Map<string, T>;
export declare function toUtxoSet(utxos: {
    txId: string;
    vout: number;
}[]): Set<string>;
