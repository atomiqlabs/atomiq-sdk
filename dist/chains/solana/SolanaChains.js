"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaChains = void 0;
const sdk_lib_1 = require("@atomiqlabs/sdk-lib");
exports.SolanaChains = {
    [sdk_lib_1.BitcoinNetwork.TESTNET]: {
        addresses: {
            swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
            btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
        }
    },
    [sdk_lib_1.BitcoinNetwork.MAINNET]: {
        addresses: {
            swapContract: "4hfUykhqmD7ZRvNh1HuzVKEY7ToENixtdUKZspNDCrEM",
            btcRelayContract: "3KHSHFpEK6bsjg3bqcxQ9qssJYtRCMi2S9TYVe4q6CQc"
        }
    }
};
