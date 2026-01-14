import { IBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet";
import { BitcoinRpcWithAddressIndex } from "../bitcoin/BitcoinRpcWithAddressIndex";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
export declare function toBitcoinWallet(_bitcoinWallet: IBitcoinWallet | {
    address: string;
    publicKey: string;
}, btcRpc: BitcoinRpcWithAddressIndex<any>, bitcoinNetwork: BTC_NETWORK): IBitcoinWallet;
