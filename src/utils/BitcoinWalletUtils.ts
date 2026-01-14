import {IBitcoinWallet, isIBitcoinWallet} from "../bitcoin/wallet/IBitcoinWallet";
import {BitcoinRpcWithAddressIndex} from "../bitcoin/BitcoinRpcWithAddressIndex";
import {BTC_NETWORK} from "@scure/btc-signer/utils";
import {SingleAddressBitcoinWallet} from "../bitcoin/wallet/SingleAddressBitcoinWallet";

export function toBitcoinWallet(
    _bitcoinWallet: IBitcoinWallet | { address: string, publicKey: string },
    btcRpc: BitcoinRpcWithAddressIndex<any>,
    bitcoinNetwork: BTC_NETWORK
): IBitcoinWallet {
    if (isIBitcoinWallet(_bitcoinWallet)) {
        return _bitcoinWallet;
    } else {
        return new SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}