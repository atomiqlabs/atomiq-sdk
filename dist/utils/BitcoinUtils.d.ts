/// <reference types="node" />
/// <reference types="node" />
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { Buffer } from "buffer";
import { Transaction } from "@scure/btc-signer";
import { CoinselectAddressTypes } from "../bitcoin/coinselect2";
export declare function fromOutputScript(network: BTC_NETWORK, outputScriptHex: string): string;
export declare function toOutputScript(network: BTC_NETWORK, address: string): Buffer;
export declare function toCoinselectAddressType(outputScript: Uint8Array): CoinselectAddressTypes;
/**
 * General parsers for PSBTs, can parse hex or base64 encoded PSBTs
 * @param _psbt
 */
export declare function parsePsbtTransaction(_psbt: Transaction | string): Transaction;
