import { IBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet";
import { BTC_NETWORK } from "@scure/btc-signer/utils";
import { BitcoinRpcWithAddressIndex } from "@atomiqlabs/base";
export declare function toBitcoinWallet(_bitcoinWallet: IBitcoinWallet | {
    address: string;
    publicKey: string;
}, btcRpc: BitcoinRpcWithAddressIndex<any>, bitcoinNetwork: BTC_NETWORK): IBitcoinWallet;
