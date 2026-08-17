"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBitcoinWallet = void 0;
const IBitcoinWallet_js_1 = require("../bitcoin/wallet/IBitcoinWallet.js");
const SingleAddressBitcoinWallet_js_1 = require("../bitcoin/wallet/SingleAddressBitcoinWallet.js");
function toBitcoinWallet(_bitcoinWallet, btcRpc, bitcoinNetwork) {
    if ((0, IBitcoinWallet_js_1.isIBitcoinWallet)(_bitcoinWallet)) {
        return _bitcoinWallet;
    }
    else {
        return new SingleAddressBitcoinWallet_js_1.SingleAddressBitcoinWallet(btcRpc, bitcoinNetwork, _bitcoinWallet);
    }
}
exports.toBitcoinWallet = toBitcoinWallet;
