import { isIBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet.js";
import { SingleAddressBitcoinWallet } from "../bitcoin/wallet/SingleAddressBitcoinWallet.js";
export function toBitcoinWallet(_bitcoinWallet, btcRpc, bitcoinNetwork) {
    if (isIBitcoinWallet(_bitcoinWallet)) {
        return _bitcoinWallet;
    }
    else {
        return new SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}
