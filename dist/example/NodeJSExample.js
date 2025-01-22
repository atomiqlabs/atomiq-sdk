"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("../");
const web3_js_1 = require("@solana/web3.js");
const BN = require("bn.js");
const fs_storage_1 = require("@atomiqlabs/sdk-lib/dist/fs-storage");
const solanaRpc = "https://api.mainnet-beta.solana.com";
let solanaSwapper;
function setupSwapper() {
    return __awaiter(this, void 0, void 0, function* () {
        //Setup the multichain swapper
        const swapper = new __1.MultichainSwapper({
            chains: {
                SOLANA: {
                    rpcUrl: solanaRpc
                }
            },
            //The following line is important for running on backend node.js,
            // because the SDK by default uses browser's Indexed DB
            storageCtor: (name) => new fs_storage_1.FileSystemStorageManager(name)
        });
        yield swapper.init();
        //Create new random keypair wallet
        const wallet = new __1.SolanaKeypairWallet(web3_js_1.Keypair.generate()); //This is just a dummy, you should load the wallet from file, or etc.
        const signer = new __1.SolanaSigner(wallet);
        //Extract a Solana specific swapper (used for swapping between Solana and Bitcoin) with a defined signer
        solanaSwapper = swapper.withChain("SOLANA").withSigner(signer);
    });
}
function createToBtcSwap() {
    return __awaiter(this, void 0, void 0, function* () {
        const exactIn = false; //exactIn = false, so we specify the output amount
        const amount = new BN(10000); //Amount in BTC base units - sats
        const recipientBtcAddress = "bc1qtw67hj77rt8zrkkg3jgngutu0yfgt9czjwusxt"; //BTC address of the recipient
        const swap = yield solanaSwapper.create(__1.Tokens.SOLANA.SOL, __1.Tokens.BITCOIN.BTC, amount, exactIn, recipientBtcAddress);
        //Input amounts
        const inputTokenAmount = swap.getInput().amount;
        const inputValueInUsd = yield swap.getInput().usdValue();
        //Output amounts
        const outputTokenAmount = swap.getOutput().amount;
        const outputValueInUsd = yield swap.getOutput().usdValue();
        //Initiate the swap by locking up the SOL
        yield swap.commit();
        //Wait for bitcoin payout to happen
        const paymentSuccess = yield swap.waitForPayment();
        if (paymentSuccess) {
            //Payment was successful, we can get the transaction id
            const bitcoinTxId = swap.getBitcoinTxId();
        }
        else {
            //If payment is unsuccessful we can refund and get our funds back
            yield swap.refund();
        }
    });
}
function createFromBtcSwap() {
    return __awaiter(this, void 0, void 0, function* () {
        const fromToken = __1.Tokens.BITCOIN.BTC;
        const toToken = __1.Tokens.SOLANA.SOL;
        const exactIn = true; //exactIn = true, so we specify the input amount
        const amount = new BN(10000); //Amount in BTC base units - sats
        const swap = yield solanaSwapper.create(fromToken, toToken, amount, exactIn);
        //Input amounts
        const inputTokenAmount = swap.getInput().amount; //Human readable input token amount with decimals
        const inputValueInUsd = yield swap.getInput().usdValue(); //Fetches the USD value of the input
        //Output amounts
        const outputTokenAmount = swap.getOutput().amount; //Human readable output token amount with decimals
        const outputValueInUsd = yield swap.getOutput().usdValue(); //Fetches the USD value of the output
        //Initiate the swap, this will prompt a Solana transaction, as we need to open the BTC swap address
        yield swap.commit();
        const qrCodeData = swap.getQrData(); //Data that can be displayed as QR code - URL with the address and amount
        const bitcoinAddress = swap.getBitcoinAddress(); //Bitcoin address to send the BTC to - exact amount needs to be sent!
        const timeout = swap.getTimeoutTime(); //The BTC should be sent before the timeout
        console.log("Please send exactly " + inputTokenAmount + " BTC to " + bitcoinAddress);
        //Waits for bitcoin transaction to be received
        yield swap.waitForBitcoinTransaction(null, null, (txId, //Transaction ID received
        confirmations, //Current confirmation count of the transaction
        targetConfirmations, //Required confirmations for the transaction to be accepted
        transactionETAms //Estimated time in milliseconds till the transaction is accepted
        ) => {
            //This callback receives periodic updates about the incoming transaction
            console.log("Tx received: " + txId + " confirmations: " + confirmations + "/" + targetConfirmations + " ETA: " + transactionETAms + " ms");
        }); //This returns as soon as the transaction is accepted
        //Swap will get automatically claimed by the watchtowers
        yield swap.waitTillClaimed();
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield setupSwapper();
        // await createToBtcSwap();
        // await createFromBtcSwap();
    });
}
main();
