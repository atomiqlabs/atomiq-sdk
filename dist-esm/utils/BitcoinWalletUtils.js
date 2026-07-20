import { isIBitcoinWallet } from "../bitcoin/wallet/IBitcoinWallet";
import { SingleAddressBitcoinWallet } from "../bitcoin/wallet/SingleAddressBitcoinWallet";
export function toBitcoinWallet(_bitcoinWallet, btcRpc, bitcoinNetwork) {
    if (isIBitcoinWallet(_bitcoinWallet)) {
        return _bitcoinWallet;
    }
    else {
        return new SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}
