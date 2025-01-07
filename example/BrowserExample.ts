import {SolanaSwapperWithSigner, MultichainSwapper, Tokens} from "..";
import {Keypair} from "@solana/web3.js";
import * as BN from "bn.js";
import {SolanaKeypairWallet, SolanaSigner} from "@atomiqlabs/chain-solana";

const solanaRpc = "https://api.mainnet-beta.solana.com";

let solanaSwapper: SolanaSwapperWithSigner;

async function setupSwapper() {
    const swapper: MultichainSwapper = new MultichainSwapper({
        chains: {
            SOLANA: {
                rpcUrl: solanaRpc
            }
        }
    });
    await swapper.init();

    //Create new random keypair wallet
    const wallet = new SolanaKeypairWallet(Keypair.generate());

    //Or in React, using solana wallet adapter
    //const wallet = useAnchorWallet();

    const signer: SolanaSigner = new SolanaSigner(wallet);
    solanaSwapper = swapper.withChain("SOLANA").withSigner(signer);
}

async function createToBtcSwap() {
    const fromToken = Tokens.SOLANA.SOL;
    const toToken = Tokens.BITCOIN.BTC;
    const exactIn = false; //exactIn = false, so we specify the output amount
    const amount = new BN(10000); //Amount in BTC base units - sats
    const recipientBtcAddress = "bc1qtw67hj77rt8zrkkg3jgngutu0yfgt9czjwusxt"; //BTC address of the recipient

    const swap = await solanaSwapper.create(
        fromToken,
        toToken,
        amount,
        exactIn,
        recipientBtcAddress //BTC address of the recipient
    );

    //Input amounts
    const inputTokenAmount = swap.getInput().amount;
    const inputValueInUsd = await swap.getInput().usdValue();

    //Output amounts
    const outputTokenAmount = swap.getOutput().amount;
    const outputValueInUsd = await swap.getOutput().usdValue();

    //Initiate the swap by locking up the SOL
    await swap.commit();
    //Wait for bitcoin payout to happen
    const paymentSuccess = await swap.waitForPayment();
    if(paymentSuccess) {
        //Payment was successful, we can get the transaction id
        const bitcoinTxId = swap.getBitcoinTxId();
    } else {
        //If payment is unsuccessful we can refund and get our funds back
        await swap.refund();
    }
}

async function createFromBtcSwap() {
    const fromToken = Tokens.BITCOIN.BTC;
    const toToken = Tokens.SOLANA.SOL;
    const exactIn = true; //exactIn = true, so we specify the input amount
    const amount = new BN(10000); //Amount in BTC base units - sats

    const swap = await solanaSwapper.create(
        fromToken,
        toToken,
        amount,
        exactIn
    );

    //Input amounts
    const inputTokenAmount = swap.getInput().amount; //Human readable input token amount with decimals
    const inputValueInUsd = await swap.getInput().usdValue(); //Fetches the USD value of the input

    //Output amounts
    const outputTokenAmount = swap.getOutput().amount; //Human readable output token amount with decimals
    const outputValueInUsd = await swap.getOutput().usdValue(); //Fetches the USD value of the output

    //Initiate the swap, this will prompt a Solana transaction, as we need to open the BTC swap address
    await swap.commit();

    const qrCodeData = swap.getQrData(); //Data that can be displayed as QR code - URL with the address and amount
    const bitcoinAddress = swap.getBitcoinAddress(); //Bitcoin address to send the BTC to - exact amount needs to be sent!
    const timeout = swap.getTimeoutTime(); //The BTC should be sent before the timeout

    console.log("Please send exactly "+inputTokenAmount+" BTC to "+bitcoinAddress);

    //Waits for bitcoin transaction to be received
    await swap.waitForBitcoinTransaction(
        null, null,
        (
            txId: string, //Transaction ID received
            confirmations: number, //Current confirmation count of the transaction
            targetConfirmations: number, //Required confirmations for the transaction to be accepted
            transactionETAms: number //Estimated time in milliseconds till the transaction is accepted
        ) => {
            //This callback receives periodic updates about the incoming transaction
            console.log("Tx received: "+txId+" confirmations: "+confirmations+"/"+targetConfirmations+" ETA: "+transactionETAms+" ms");
        }
    ); //This returns as soon as the transaction is accepted
}

async function main() {
    await setupSwapper();
    // await createToBtcSwap();
    // await createFromBtcSwap();
}

main();
