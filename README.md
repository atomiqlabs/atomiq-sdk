# atomiqlabs SDK

A typescript multichain client for atomiqlabs trustlesss cross-chain swaps. Enables trustless swaps between smart chains (Solana, EVM, Starknet, etc.) and bitcoin (on-chain - L1 and lightning network - L2).

Example SDK integration in NodeJS available [here](https://github.com/atomiqlabs/atomiq-sdk-demo/blob/main/src/index.ts)

## Installation
```
npm install @atomiqlabs/sdk@dev
```

## Installing chain-specific connectors

You can install only the chain-specific connectors that your project requires

```
npm install @atomiqlabs/chain-solana@dev
npm install @atomiqlabs/chain-starknet@dev
npm install @atomiqlabs/chain-evm@dev
```

## How to use?

- [Preparations](#preparations)
- [Setting up signers](#signer)
- [Initialization](#initialization)
- Swaps:
  - [Smart Chain -> BTC L1](#swap-smart-chain---bitcoin-on-chain)
  - [BTC L1 -> Solana (Old swap protocol)](#swap-bitcoin-on-chain---solana)
  - [BTC L1 -> Starknet/EVM (New swap protocol)](#swap-bitcoin-on-chain---starknetevm)
  - [Smart Chain -> BTC Lightning network L2](#swap-smart-chain---bitcoin-lightning-network)
  - [Smart Chain -> BTC Lightning network L2 (LNURL-pay)](#swap-smart-chain---bitcoin-lightning-network-1)
  - [BTC Lightning network L2 -> Solana (Old swap protocol)](#swap-bitcoin-lightning-network---solana)
  - [BTC Lightning network L2 -> Starknet/EVM (New swap protocol)](#swap-bitcoin-lightning-network---starknetevm)
  - [BTC Lightning network L2 (LNURL-withdraw) -> Solana (Old swap protocol)](#swap-bitcoin-lightning-network---solana-1)
  - [BTC Lightning network L2 (LNURL-withdraw) -> Starknet/EVM (New swap protocol)](#swap-bitcoin-lightning-network---starknetevm-1)
- [Swap states](#getting-state-of-the-swap)
- [Swap size limits](#swap-size-limits)
- [Stored swaps](#stored-swaps)
  - [Get existing swaps](#get-swap-by-id)
  - [Refundable swaps](#get-refundable-swaps)
  - [Claimable swaps](#get-claimable-swaps)
- [Helpers](#helpers)
  - [Wallet spendable balance](#getting-wallet-balances)
  - [Unified address parsers](#unified-address-parser)
- [Customize swapper instance](#additional-swapper-options)

### Preparations

Set Solana & Starknet RPC URL to use

```typescript
const solanaRpc = "https://api.mainnet-beta.solana.com";
const starknetRpc = "https://starknet-mainnet.public.blastapi.io/rpc/v0_8";
const citreaRpc = "https://rpc.testnet.citrea.xyz";
```

Create swapper factory, here we can pick and choose which chains we want to have supported in the SDK, ensure the "as const" keyword is used such that the typescript compiler can properly infer the types.

```typescript
import {SolanaInitializer, SolanaInitializerType} from "@atomiqlabs/chain-solana";
import {StarknetInitializer, StarknetInitializerType} from "@atomiqlabs/chain-starknet";
import {CitreaInitializer, CitreaInitializerType} from "@atomiqlabs/chain-evm";
import {SwapperFactory} from "@atomiqlabs/sdk";

const Factory = new SwapperFactory<[SolanaInitializerType, StarknetInitializerType, CitreaInitializerType]>([SolanaInitializer, StarknetInitializer, CitreaInitializer] as const);
const Tokens = Factory.Tokens; //Get the supported tokens for all the specified chains.
```

#### Browser

This uses browser's Indexed DB by default

```typescript
import {BitcoinNetwork} from "@atomiqlabs/sdk";

const swapper = Factory.newSwapper({
    chains: {
        SOLANA: {
            rpcUrl: solanaRpc //You can also pass Connection object here
        },
        STARKNET: {
            rpcUrl: starknetRpc //You can also pass Provider object here           
        },
        CITREA: {
            rpcUrl: citreaRpc, //You can also pass JsonApiProvider object here
        }
    },
    bitcoinNetwork: BitcoinNetwork.TESTNET //or BitcoinNetwork.MAINNET, BitcoinNetwork.TESTNET4 - this also sets the network to use for Solana (solana devnet for bitcoin testnet) & Starknet (sepolia for bitcoin testnet)
});
```

if you want to use custom pricing api, mempool.space RPC url, or tune HTTP request timeouts check out [additional options](#additional-swapper-options)

#### NodeJS

For NodeJS we need to use sqlite storage, for that we first need to install the sqlite storage adaptor

```
npm install @atomiqlabs/storage-sqlite
```

Then use pass it in the newSwapper function

```typescript
import {SqliteStorageManager, SqliteUnifiedStorage} from "@atomiqlabs/storage-sqlite";
import {BitcoinNetwork} from "@atomiqlabs/sdk";

const swapper = Factory.newSwapper({
    chains: {
        SOLANA: {
            rpcUrl: solanaRpc //You can also pass Connection object here
        },
        STARKNET: {
            rpcUrl: starknetRpc //You can also pass Provider object here
        },
        CITREA: {
            rpcUrl: citreaRpc, //You can also pass JsonApiProvider object here
        }
    },
    bitcoinNetwork: BitcoinNetwork.TESTNET, //or BitcoinNetwork.MAINNET - this also sets the network to use for Solana (solana devnet for bitcoin testnet) & Starknet (sepolia for bitcoin testnet)
    //The following lines are important for running on backend node.js,
    // because the SDK by default uses browser's Indexed DB
    swapStorage: chainId => new SqliteUnifiedStorage("CHAIN_"+chainId+".sqlite3"),
    chainStorageCtor: name => new SqliteStorageManager("STORE_"+name+".sqlite3"),
});
```

if you want to use custom pricing api, mempool.space RPC url, or tune HTTP request timeouts check out [additional options](#additional-swapper-options)

### Signer

```typescript
import {SolanaSigner} from "@atomiqlabs/chain-solana";
//Browser - react, using solana wallet adapter
const anchorWallet = useAnchorWallet();
const wallet = new SolanaSigner(anchorWallet);
```

```typescript
import {WalletAccount} from "starknet";
import {StarknetSigner} from "@atomiqlabs/chain-starknet";
//Browser, using get-starknet
const swo = await connect();
const wallet = new StarknetSigner(new WalletAccount(starknetRpc, swo.wallet));
```

or

```typescript
import {Keypair} from "@solana/web3.js";
import {SolanaKeypairWallet, SolanaSigner} from "@atomiqlabs/chain-solana";
//Creating Solana signer from private key
const solanaSigner = new SolanaSigner(new SolanaKeypairWallet(Keypair.fromSecretKey(solanaKey)), Keypair.fromSecretKey(solanaKey));
```

```typescript
import {StarknetSigner, StarknetKeypairWallet} from "@atomiqlabs/chain-starknet";
//Creating Starknet signer from private key
const starknetSigner = new StarknetSigner(new StarknetKeypairWallet(starknetRpc, starknetKey));
```

```typescript
import {BaseWallet, SigningKey} from "ethers";
import {EVMSigner} from "@atomiqlabs/chain-evm";
//Creating EVM signer from private key
const wallet = new BaseWallet(new SigningKey(evmKey));
const evmWallet = new EVMSigner(wallet, wallet.address);
```

### Initialization

Initialize the swapper

```typescript
await swapper.init();
```

Now we have the multichain swapper initialized

### Extract chain-specific swapper with signer

To make it easier to do swaps between bitcoin and a specific chain we can extract a chain-specific swapper, and also set a signer. e.g.:

```typescript
const solanaSwapper = swapper.withChain<"SOLANA">("SOLANA");
```

or also with signer

```typescript
const starknetSwapperWithSigner = swapper.withChain<"STARKNET">("STARKNET").withSigner(signer);
```

### Bitcoin on-chain swaps

#### Swap Smart chain -> Bitcoin on-chain

Getting swap quote

```typescript
const _exactIn = false; //exactIn = false, so we specify the output amount
const _amount = 10000n; //Amount in BTC base units - sats (10000 sats = 0.0001 BTC)
const _address = "bc1qtw67hj77rt8zrkkg3jgngutu0yfgt9czjwusxt"; //BTC address of the recipient

//Create the swap: swapping SOL to Bitcoin on-chain, receiving _amount of satoshis (smallest unit of bitcoin) to _address
const swap = await swapper.swap(
    Tokens.SOLANA.SOL, //From specified source token
    Tokens.BITCOIN.BTC, //Swap to BTC
    _amount,
    _exactIn,
    solanaSigner.getAddress(), //Source address and smart chain signer
    _address //Destination of the swap
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Initiating the swap

```typescript
//Initiate and pay for the swap
await swap.commit(solanaSigner);
```

or [sign and send transaction manually](#manually-signing-smart-chain-transactions)

Wait for the swap to execute, refund in case of failure

```typescript
//Wait for the swap to conclude
const result: boolean = await swap.waitForPayment();
if(!result) {
    //Swap failed, money can be refunded
    await swap.refund();
} else {
    //Swap successful, we can get the bitcoin txId
    const bitcoinTxId = swap.getOutputTxId();
}
```

##### Swap states

- ToBTCSwapState.REFUNDED = -3
  - Swap failed and was successfully refunded
- ToBTCSwapState.QUOTE_EXPIRED = -2
  - Swap quote expired and cannot be executed anymore
- ToBTCSwapState.QUOTE_SOFT_EXPIRED = -1
  - Swap quote soft-expired (i.e. the quote probably expired, but if there is already an initialization transaction sent it might still succeed)
- ToBTCSwapState.CREATED = 0
  - Swap quote is created, waiting to be executed
- ToBTCSwapState.COMMITED = 1,
  - Swap was initiated (init transaction sent)
- ToBTCSwapState.SOFT_CLAIMED = 2,
  - Swap was processed by the counterparty but not yet claimed on-chain (bitcoin transaction was sent, but unconfirmed yet)
- ToBTCSwapState.CLAIMED = 3
  - Swap was finished and funds were successfully claimed by the counterparty
- ToBTCSwapState.REFUNDABLE = 4
  - Swap was initiated but counterparty failed to process it, the user can now refund his funds

#### Swap Bitcoin on-chain -> Solana

NOTE: Solana uses an old swap protocol for Bitcoin on-chain -> Solana swaps, the flow here is different from the one for Starknet and other chains.

Getting swap quote

```typescript
const _exactIn = true; //exactIn = true, so we specify the input amount
const _amount = fromHumanReadableString("0.0001", Tokens.BITCOIN.BTC); //Amount in BTC base units - sats, we can also use a utility function here

//Create the swap: swapping _amount of satoshis of Bitcoin on-chain to SOL
const swap = await swapper.swap(
    Tokens.BITCOIN.BTC, //Swap from BTC
    Tokens.SOLANA.SOL, //Into specified destination token
    _amount,
    _exactIn, //Whether we define an input or output amount
    undefined, //Source address for the swap, not used for swaps from BTC
    solanaSigner.getAddress() //Destination address
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get security deposit amount (Human readable amount of SOL that needs to be put down to rent the liquidity from swap intermediary), you will get this deposit back if the swap succeeds
const securityDeposit: string = swap.getSecurityDeposit().toString();
//Get claimer bounty (Human readable amount of SOL reserved as a reward for watchtowers to claim the swap on your behalf)
const claimerBounty: string = swap.getClaimerBounty().toString();

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Initiating the swap

```typescript
//Initiate the swap on the destination chain (Solana) by opening up the bitcoin swap address
await swap.commit(solanaSigner);
```

or [sign and send transaction manually](#manually-signing-smart-chain-transactions)

Sending bitcoin

```typescript
//Get the bitcoin address
const receivingAddressOnBitcoin = swap.getAddress();
//Get the QR code data (contains the address and amount)
const qrCodeData = swap.getHyperlink(); //Data that can be displayed in the form of QR code
//Send the exact amount of BTC to the provided address
```

or get a psbt and sign it

```typescript
//Or obtain the funded PSBT (input already added) - ready for signing
const {psbt, signInputs} = await swap.getFundedPsbt({address: "", publicKey: ""});
for(let signIdx of signInputs) {
    psbt.signIdx(..., signIdx); //Or pass it to external signer
}
const bitcoinTxId = await swap.submitPsbt(psbt);
```

Waiting for swap execution

```typescript
try {
    //Wait for the payment to arrive
    await swap.waitForBitcoinTransaction(
        null, null,
        (
            txId: string, //Transaction ID of the received bitcoin transaction
            confirmations: number, //Current confirmations of the transaction
            targetConfirmations: number, //Required confirmations
            transactionETAms: number //Estimated in time (in milliseconds) until when the transaction will receive required amount of confirmations
        ) => {
            //Callback for transaction updates
        }
    );
} catch(e) {
    //Error occurred while waiting for payment, this is most likely due to network errors
    return;
}

//Swap should get automatically claimed by the watchtowers, if not we can call swap.claim() ourselves
try {
  await swap.waitTillClaimed(timeoutSignal(30*1000));
} catch (e) {
  //Claim ourselves when automatic claim doesn't happen in 30 seconds
  await swap.claim(solanaSigner);
}
```

##### Swap states

- FromBTCSwapState.EXPIRED = -3
  - Bitcoin swap address expired
- FromBTCSwapState.QUOTE_EXPIRED = -2
  - Swap quote expired and cannot be executed anymore
- FromBTCSwapState.QUOTE_SOFT_EXPIRED = -1
  - Swap quote soft-expired (i.e. the quote probably expired, but if there is already an initialization transaction sent it might still succeed)
- FromBTCSwapState.PR_CREATED = 0
  - Swap quote is created, waiting for the user to open a bitcoin swap address
- FromBTCSwapState.CLAIM_COMMITED = 1
  - Bitcoin swap address is opened
- FromBTCSwapState.BTC_TX_CONFIRMED = 2
  - Bitcoin transaction sending funds to the swap address is confirmed
- FromBTCSwapState.CLAIM_CLAIMED = 3
  - Swap funds are claimed to the user's wallet


#### Swap Bitcoin on-chain -> Starknet/EVM

NOTE: Starknet & EVM uses a new swap protocol for Bitcoin on-chain -> Smart chain swaps, the flow here is different from the one for Solana!

Getting swap quote

```typescript
const _exactIn = true; //exactIn = true, so we specify the input amount
const _amount = fromHumanReadableString("0.0001", Tokens.BITCOIN.BTC); //Amount in BTC base units - sats, we can also use a utility function here

//Create the swap: swapping _amount of satoshis of Bitcoin on-chain to SOL
const swap = await swapper.swap(
    Tokens.BITCOIN.BTC, //Swap from BTC
    Tokens.STARKNET.STRK, //Into specified destination token
    _amount,
    _exactIn, //Whether we define an input or output amount
    undefined, //Source address for the swap, not used for swaps from BTC
    starknetSigner.getAddress(), //Destination address
    {
        gasAmount: 1_000_000_000_000_000_000n //We can also request a gas drop on the destination chain (here requesting 1 STRK)
    }
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

##### Initiating the swap

Using external wallet (e.g. browser-based like Xverse, Unisat, Phantom, etc.)

```typescript
//Obtain the funded PSBT (input already added) - ready for signing
const {psbt, signInputs} = await swap.getFundedPsbt({address: "", publicKey: ""});
const psbtBase64 = Buffer.from(psbt.toPSBT(0)).toString("base64"); //Base64 encoded PSBT
const psbtHex = Buffer.from(psbt.toPSBT(0)).toString("hex"); //hex encoded PSBT
//Pass `psbtBase64` or `psbtHex` (and also `signInputs`) to an external signer like Xverse, Unisat, etc.
const signedPsbtBase64 = await <signPsbt function of the external wallet>; //Call the signPsbt function of the external signer with psbtBase64 or psbtHex and signInputs
//NOTE: The signPsbt can also return hex-encoded PSBT
// const signedPsbtHex = await <signPsbt function of the external wallet>;
//Parse signed PSBT back to transaction object
const signedTransaction = Transaction.fromPSBT(Buffer.from(signedPsbtBase64, "base64")); //Import from @scure/btc-signer
//Or if the returned PSBT is hex-encoded
// const signedTransaction = Transaction.fromPSBT(Buffer.from(signedPsbtBase64, "hex")); //Import from @scure/btc-signer
const bitcoinTxId = await swap.submitPsbt(signedTransaction);
```

or sign inputs using a private key

```typescript
//Obtain the funded PSBT (input already added) - ready for signing
const {psbt, signInputs} = await swap.getFundedPsbt({address: "", publicKey: ""});
for(let signIdx of signInputs) {
    psbt.signIdx(..., signIdx); //Or pass it to external signer
}
const bitcoinTxId = await swap.submitPsbt(psbt);
```

or get raw PSBT and add inputs manually

```typescript
//Or obtain raw PSBT to which inputs still need to be added
const {psbt, in1sequence} = await swap.getPsbt();
psbt.addInput(...);
//Make sure the second input's sequence (index 1) is as specified in the in1sequence variable
psbt.updateInput(1, {sequence: in1sequence});
//Sign the PSBT, sign every input except the first one
for(let i=1;i<psbt.inputsLength; i++) psbt.signIdx(..., i); //Or pass it to external signer
//Submit the signed PSBT
const bitcoinTxId = await swap.submitPsbt(psbt);
```

Waiting for swap execution

```typescript
try {
    //Wait for the payment to arrive
    await swap.waitForBitcoinTransaction(
        null, null,
        (
            txId: string, //Transaction ID of the received bitcoin transaction
            confirmations: number, //Current confirmations of the transaction
            targetConfirmations: number, //Required confirmations
            transactionETAms: number //Estimated in time (in milliseconds) until when the transaction will receive required amount of confirmations
        ) => {
            //Callback for transaction updates
        }
    );
} catch(e) {
    //Error occurred while waiting for payment, this is most likely due to network errors
    return;
}

//Swap should get automatically claimed by the watchtowers, if not we can call swap.claim() ourselves
try {
  await swap.waitTillClaimedOrFronted(timeoutSignal(30*1000));
} catch (e) {
  //Claim ourselves when automatic claim doesn't happen in 30 seconds
  await swap.claim(starknetSigner);
}
```

##### Swap states

- SpvFromBTCSwapState.CLOSED = -5
  - Catastrophic failure during swap, shall never happen
- SpvFromBTCSwapState.FAILED = -4
  - Bitcoin transaction was sent, but was double-spent later, therefore the swap was failed (no BTC was sent)
- SpvFromBTCSwapState.DECLINED = -3
  - LP declined to process the swap transaction, no BTC was sent
- SpvFromBTCSwapState.QUOTE_EXPIRED = -2
  - Swap quote expired and cannot be executed anymore
- SpvFromBTCSwapState.QUOTE_SOFT_EXPIRED = -1
  - Swap quote soft-expired (i.e. the quote probably expired, but if there is a bitcoin transaction being submitted it might still succeed)
- SpvFromBTCSwapState.CREATED = 0
  - Swap quote is created, waiting on user to sign the bitcoin swap transaction
- SpvFromBTCSwapState.SIGNED = 1
  - Bitcoin swap transaction was signed by the client
- SpvFromBTCSwapState.POSTED = 2
  - Bitcoin swap transaction was posted to the LP
- SpvFromBTCSwapState.BROADCASTED = 3
  - LP broadcasted the bitcoin swap transaction
- SpvFromBTCSwapState.FRONTED = 4
  - Swap funds have been deposited to the user's wallet in front of the time
- SpvFromBTCSwapState.BTC_TX_CONFIRMED = 5
  - Bitcoin swap transaction is confirmed
- SpvFromBTCSwapState.CLAIM_CLAIMED = 6
  - Swap funds are claimed to the user's wallet

### Bitcoin lightning network swaps

#### Swap Smart chain -> Bitcoin lightning network

Getting swap quote

```typescript
//Destination lightning network invoice, amount needs to be part of the invoice!
const _lightningInvoice = "lnbc10u1pj2q0g9pp5ejs6m677m39cznpzum7muruvh50ys93ln82p4j9ks2luqm56xxlshp52r2anlhddfa9ex9vpw9gstxujff8a0p8s3pzvua930js0kwfea6scqzzsxqyz5vqsp5073zskc5qfgp7lre0t6s8uexxxey80ax564hsjklfwfjq2ew0ewq9qyyssqvzmgs6f8mvuwgfa9uqxhtza07qem4yfhn9wwlpskccmuwplsqmh8pdy6c42kqdu8p73kky9lsnl40qha5396d8lpgn90y27ltfc5rfqqq59cya";

//Create the swap: swapping SOL to Bitcoin lightning
const swap = await swapper.swap(
    Tokens.SOLANA.SOL, //From specified source token
    Tokens.BITCOIN.BTCLN, //Swap to BTC-LN
    undefined, //Amount is specified in the lightning network invoice!
    false, //Make sure we use exactIn=false for swaps to BTC-LN, if you want to use exactIn=true and set an amount, use LNURL-pay!
    solanaSigner.getAddress(), //Source address and smart chain signer
    _lightningInvoice //Destination of the swap
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Initiating the swap

```typescript
//Initiate and pay for the swap
await swap.commit(solanaSigner);
```

or [sign and send transaction manually](#manually-signing-smart-chain-transactions)

Wait for the swap to execute, refund in case of failure

```typescript
//Wait for the swap to conclude
const result: boolean = await swap.waitForPayment();
if(!result) {
  //Swap failed, money can be refunded
  await swap.refund(solanaSigner);
} else {
  //Swap successful, we can get the lightning payment secret pre-image, which acts as a proof of payment
  const lightningSecret = swap.getSecret();
}
```

##### Swap states

- ToBTCSwapState.REFUNDED = -3
    - Swap failed and was successfully refunded
- ToBTCSwapState.QUOTE_EXPIRED = -2
    - Swap quote expired and cannot be executed anymore
- ToBTCSwapState.QUOTE_SOFT_EXPIRED = -1
    - Swap quote soft-expired (i.e. the quote probably expired, but if there is already an initialization transaction sent it might still succeed)
- ToBTCSwapState.CREATED = 0
    - Swap quote is created, waiting to be executed
- ToBTCSwapState.COMMITED = 1,
    - Swap was initiated (init transaction sent)
- ToBTCSwapState.SOFT_CLAIMED = 2,
    - Swap was processed by the counterparty but not yet claimed on-chain (lightning network payment secret was revealed)
- ToBTCSwapState.CLAIMED = 3
    - Swap was finished and funds were successfully claimed by the counterparty
- ToBTCSwapState.REFUNDABLE = 4
    - Swap was initiated but counterparty failed to process it, the user can now refund his funds

#### Swap Bitcoin lightning network -> Solana

NOTE: Solana uses an old swap protocol for Bitcoin lightning network -> Solana swaps, the flow here is different from the one for Starknet and other chains.

Getting swap quote

```typescript
const _exactIn = true; //exactIn = true, so we specify the input amount
const _amount = 10000n; //Amount in BTC base units - sats

const swap = await swapper.swap(
    Tokens.BITCOIN.BTCLN, //Swap from BTC-LN
    Tokens.SOLANA.SOL, //Into specified destination token
    _amount,
    _exactIn, //Whether we define an input or output amount
    undefined, //Source address for the swap, not used for swaps from BTC-LN
    signer.getAddress() //Destination address
);

//Get the bitcoin lightning network invoice (the invoice contains pre-entered amount)
const receivingLightningInvoice: string = swap.getAddress();
//Get the URI hyperlink (contains the lightning network invoice) which can be displayed also as QR code
const qrCodeData: string = swap.getHyperlink();

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get security deposit amount (Human readable amount of STRK that needs to be put down to rent the liquidity from swap intermediary), you will get this deposit back if the swap succeeds
const securityDeposit: string = swap.getSecurityDeposit().toString();

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Pay the displayed lightning network invoice from an external wallet

Wait for the payment to be received

```typescript
//Start listening to incoming lightning network payment
const success = await swap.waitForPayment();
if(!success) {
    //Lightning network payment not received in time and quote expired!
    return;
}
```

Claim the funds on the destination smart chains, this settles the swap and lightning network payment

```typescript
try {
    //Claim the swap funds - this will initiate 2 transactions
    if(swap.canCommitAndClaimInOneShot()) {
      //Some chains (e.g. Solana) support signing multiple transactions in one flow
      await swap.commitAndClaim(solanaSigner);
    } else {
      //Other chains (e.g. Starknet) don't support signing multiple transaction in one flow, therefore you need to sign one-by-one
      await swap.commit(starknetSigner);
      await swap.claim(starknetSigner);
    }
} catch(e) {
    //Error occurred while waiting for payment
}
```

or [sign and send transactions manually](#manually-signing-smart-chain-transactions)

##### Swap states

- FromBTCLNSwapState.FAILED = -4
  - If the claiming of the funds was initiated, but never concluded, the user will get his lightning network payment refunded
- FromBTCLNSwapState.QUOTE_EXPIRED = -3
  - Swap quote expired and cannot be executed anymore
- FromBTCLNSwapState.QUOTE_SOFT_EXPIRED = -2
  - Swap quote soft-expired (i.e. the quote probably expired, but if there is already an initialization transaction sent it might still succeed)
- FromBTCLNSwapState.EXPIRED = -1
  - Lightning network invoice expired, meaning the swap is expired
- FromBTCLNSwapState.PR_CREATED = 0
  - Swap is created, the user should now pay the provided lightning network invoice
- FromBTCLNSwapState.PR_PAID = 1
  - Lightning network invoice payment was received (but cannot be settled by the counterparty yet)
- FromBTCLNSwapState.CLAIM_COMMITED = 2
  - Claiming of the funds was initiated
- FromBTCLNSwapState.CLAIM_CLAIMED = 3
  - Funds were successfully claimed & lightning network secret pre-image revealed, so the lightning network payment will settle now


#### Swap Bitcoin lightning network -> Starknet/EVM

Getting swap quote

```typescript
const _exactIn = true; //exactIn = true, so we specify the input amount
const _amount = 10000n; //Amount in BTC base units - sats

const swap = await swapper.swap(
    Tokens.BITCOIN.BTCLN, //Swap from BTC-LN
    Tokens.STARKNET.STRK, //Into specified destination token
    _amount,
    _exactIn, //Whether we define an input or output amount
    undefined, //Source address for the swap, not used for swaps from BTC-LN
    signer.getAddress(), //Destination address
    {
        gasAmount: 1_000_000_000_000_000_000n //We can also request a gas drop on the destination chain (here requesting 1 STRK)
    }
);

//Get the bitcoin lightning network invoice (the invoice contains pre-entered amount)
const receivingLightningInvoice: string = swap.getAddress();
//Get the URI hyperlink (contains the lightning network invoice) which can be displayed also as QR code
const qrCodeData: string = swap.getHyperlink();

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Pay the displayed lightning network invoice from an external lightning network wallet

Wait for the payment to be received and settle the swap.

```typescript
//Start listening to incoming lightning network payment
const success = await swap.waitForPayment();
if(!success) {
    //Lightning network payment not received in time and quote expired!
    return;
}

//Swap should get automatically claimed by the watchtowers, if not we can call swap.claim() to claim the swap ourselves
try {
  await swap.waitTillClaimed(timeoutSignal(30*1000));
} catch (e) {
  //Claim ourselves when automatic claim doesn't happen in 30 seconds
  await swap.claim(starknetSigner);
}
```

##### Swap states

- FromBTCLNAutoSwapState.FAILED = -4
  - If the claiming of the funds was initiated, but never concluded, the user will get his lightning network payment refunded
- FromBTCLNAutoSwapState.QUOTE_EXPIRED = -3
  - Swap quote expired and cannot be executed anymore
- FromBTCLNAutoSwapState.QUOTE_SOFT_EXPIRED = -2
  - Swap quote soft-expired (i.e. the quote probably expired, but if there is already an initialization transaction sent it might still succeed)
- FromBTCLNAutoSwapState.EXPIRED = -1
  - Lightning network invoice expired, meaning the swap is expired
- FromBTCLNAutoSwapState.PR_CREATED = 0
  - Swap is created, the user should now pay the provided lightning network invoice
- FromBTCLNAutoSwapState.PR_PAID = 1
  - Lightning network invoice payment was received (but cannot be settled by the counterparty yet)
- FromBTCLNAutoSwapState.CLAIM_COMMITED = 2
  - A swap HTLC was offered by the LP to the user
- FromBTCLNAutoSwapState.CLAIM_CLAIMED = 3
  - Funds were successfully claimed & lightning network secret pre-image revealed, so the lightning network payment will settle now

### LNURLs & readable lightning identifiers

LNURLs extend the lightning network functionality by creating static lightning addreses (LNURL-pay & static internet identifiers) and QR codes which allow you to pull funds from them (LNURL-withdraw)

This SDK supports:
* LNURL-pay ([LUD-6](https://github.com/lnurl/luds/blob/luds/06.md), [LUD-9](https://github.com/lnurl/luds/blob/luds/09.md), [LUD-10](https://github.com/lnurl/luds/blob/luds/10.md), [LUD-12](https://github.com/lnurl/luds/blob/luds/12.md))
* LNURL-withdraw ([LUD-3](https://github.com/lnurl/luds/blob/luds/03.md))
* Static internet identifiers ([LUD-16](https://github.com/lnurl/luds/blob/luds/16.md))

You can parse LNURLs and lightning invoices automatically using the [Unified address parser](#unified-address-parser)

#### Differences

Lightning invoices:
* One time use only
* Need to have a fixed amount, therefore recipient has to set the amount
* Static and bounded expiration
* You can only pay to a lightning invoice, not withdraw funds from it

LNURLs & lightning identifiers:
* Reusable
* Programmable expiry
* Allows payer to set an amount
* Supports both, paying (LNURL-pay) and withdrawing (LNURL-withdraw)
* Possibility to attach a message/comment to a payment
* Receive a message/url as a result of the payment

#### Swap Smart chain -> Bitcoin lightning network

Getting swap quote

```typescript
const _lnurlOrIdentifier: string = "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkx6rfvdjx2ctvxyesuk0a27"; //Destination LNURL-pay or readable identifier
const _exactIn = false; //exactIn = false, so we specify the output amount
const _amount: bigint = 10000n; //Amount of satoshis to send (1 BTC = 100 000 000 satoshis)

//Create the swap: swapping SOL to Bitcoin lightning
const swap = await swapper.swap(
    Tokens.SOLANA.SOL, //From specified source token
    Tokens.BITCOIN.BTCLN, //Swap to BTC-LN
    _amount, //Now we can specify an amount for a lightning network payment!
    _exactIn, //We can also use exactIn=true here and set an amount in input token
    solanaSigner.getAddress(), //Source address and smart chain signer
    _lnurlOrIdentifier, //Destination of the swap
    {
        comment: "Hello world" //For LNURL-pay we can also pass a comment to the recipient
    }
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Initiating the swap

```typescript
//Initiate and pay for the swap
await swap.commit(solanaSigner);
```

or [sign and send transaction manually](#manually-signing-smart-chain-transactions)

Wait for the swap to execute, refund in case of failure

```typescript
//Wait for the swap to conclude
const result: boolean = await swap.waitForPayment();
if(!result) {
  //Swap failed, money can be refunded
  await swap.refund(solanaSigner);
} else {
  //Swap successful, we can get the lightning payment secret pre-image, which acts as a proof of payment
  const lightningSecret = swap.getSecret();
  //In case the LNURL contained a success action, we can read it now and display it to user
  if(swap.hasSuccessAction()) {
    //Contains a success action that should displayed to the user
    const successMessage = swap.getSuccessAction();
    const description: string = successMessage.description; //Description of the message
    const text: (string | null) = successMessage.text; //Main text of the message
    const url: (string | null) = successMessage.url; //URL link which should be displayed
  }
}
```

#### Swap Bitcoin lightning network -> Solana

NOTE: Solana uses an old swap protocol for Bitcoin lightning network -> Solana swaps, the flow here is different from the one for Starknet and other chains.

Getting swap quote

```typescript
const _lnurl: string = "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkx6rfvdjx2ctvxyesuk0a27"; //Destination LNURL-pay or readable identifier
const _exactIn = true; //exactIn = true, so we specify the input amount
const _amount = 10000n; //Amount in BTC base units - sats

const swap = await swapper.swap(
    Tokens.BITCOIN.BTCLN, //Swap from BTC-LN
    Tokens.SOLANA.SOL, //Into specified destination token
    _amount,
    _exactIn, //Whether we define an input or output amount
    _lnurl, //Source LNURL for the swap
    signer.getAddress(), //Destination address
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get security deposit amount (Human readable amount of STRK that needs to be put down to rent the liquidity from swap intermediary), you will get this deposit back if the swap succeeds
const securityDeposit: string = swap.getSecurityDeposit().toString();

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Wait for the payment to be received

```typescript
//Start listening to incoming lightning network payment
const success = await swap.waitForPayment();
if(!success) {
    //Lightning network payment not received in time and quote expired!
    return;
}
```

Claim the funds on the destination smart chains, this settles the swap and lightning network payment

```typescript
try {
    //Claim the swap funds - this will initiate 2 transactions
    if(swap.canCommitAndClaimInOneShot()) {
      //Some chains (e.g. Solana) support signing multiple transactions in one flow
      await swap.commitAndClaim(solanaSigner);
    } else {
      //Other chains (e.g. Starknet) don't support signing multiple transaction in one flow, therefore you need to sign one-by-one
      await swap.commit(starknetSigner);
      await swap.claim(starknetSigner);
    }
} catch(e) {
    //Error occurred while waiting for payment
}
```

or [sign and send transactions manually](#manually-signing-smart-chain-transactions)

#### Swap Bitcoin lightning network -> Starknet/EVM

Getting swap quote

```typescript
const _lnurl: string = "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkx6rfvdjx2ctvxyesuk0a27"; //Destination LNURL-pay or readable identifier
const _exactIn = true; //exactIn = true, so we specify the input amount
const _amount = 10000n; //Amount in BTC base units - sats

const swap = await swapper.swap(
    Tokens.BITCOIN.BTCLN, //Swap from BTC-LN
    Tokens.STARKNET.STRK, //Into specified destination token
    _amount,
    _exactIn, //Whether we define an input or output amount
    _lnurl, //Source LNURL for the swap
    signer.getAddress(), //Destination address
    {
        gasAmount: 1_000_000_000_000_000_000n //We can also request a gas drop on the destination chain (here requesting 1 STRK)
    }
);

//Get the amount required to pay and fee
const input: string = swap.getInputWithoutFee().toString(); //Input amount excluding fees
const fee: string = swap.getFee().amountInSrcToken.toString(); //Fees paid on the output
const inputWithFees: string = swap.getInput().toString(); //Total amount paid including fees

const output: string = swap.getOutput().toString(); //Total output amount

//Get swap expiration time
const expiry: number = swap.getQuoteExpiry(); //Expiration time of the swap quote in UNIX milliseconds, swap needs to be initiated before this time

//Get pricing info
const swapPrice = swap.getPriceInfo().swapPrice; //Price of the current swap (excluding fees)
const marketPrice = swap.getPriceInfo().marketPrice; //Current market price
const difference = swap.getPriceInfo().difference; //Difference between the swap price & current market price
```

Wait for the payment to be received & settle the swap.

```typescript
//Start listening to incoming lightning network payment
const success = await swap.waitForPayment();
if(!success) {
  //Lightning network payment not received in time and quote expired!
  return;
}

//Swap should get automatically claimed by the watchtowers, if not we can call swap.claim() to claim the swap ourselves
try {
  await swap.waitTillClaimed(timeoutSignal(30*1000));
} catch (e) {
  //Claim ourselves when automatic claim doesn't happen in 30 seconds
  await swap.claim(starknetSigner);
}
```

### Getting state of the swap

You can get the current state of the swap with:

```typescript
const state = swap.getState();
```

You can also set a listener to listen for swap state changes:

```typescript
swap.events.on("swapState", swap => {
    const newState = swap.getState();
});
```

For the meaning of the states please refer to the "Swap state" section under each swap type.

### Swap size limits

Swap sizes are limited by the LPs you are connected to, they are advertised in BTC terms by LPs during handshake

```typescript
const swapLimits = swapper.getSwapLimits(srcToken, dstToken);
const inputMin = swapLimits.input.min;
const inputMax = swapLimits.input.max;
const outputMin = swapLimits.output.min;
const outputMax = swapLimits.output.max;
```

NOTE: swap limits denominated in BTC are retrieved from the LPs during initial handshake, however limits in other tokens are only returned when getting a quote fails due to amount being too low or too high. For example if you want to get swap limits for the BTC -> SOL swap, the input limits will be immediately available, while the output limits will only get populated once a quote request fails due to amount being too low or high.

```typescript
let swapLimits = swapper.getSwapLimits(Tokens.BITCOIN.BTC, Tokens.SOLANA.SOL);
let inputMin = swapLimits.input.min; //Immediately available
let inputMax = swapLimits.input.max; //Immediately available
let outputMin = swapLimits.output.min; //Not available from the get-go
let outputMax = swapLimits.output.max; //Not available from the get-go

//You can also listen to swap limit changes (optional)
swapper.on("swapLimitsChanged", () => {
    //New limits available with swapper.getSwapLimits(srcToken, dstToken)
    //Useful in e.g. a react application where you want to dynamically set min/max swappable amount
})

//Try to swap really small amount of SOL with exactOut swap
try {
    const swap = await swapper.swap(
        Tokens.BITCOIN.BTC, //Swap from BTC
        Tokens.SOLANA.SOL, //Into specified destination token
        1n, //1 lamport = 0.000000001 SOL
        false, //Whether we define an input or output amount
        undefined, //Source address for the swap, not used for swaps from BTC
        solanaSigner.getAddress() //Destination address
    );
} catch (e) {
    //Fails with OutOfBoundsError
}

swapLimits = swapper.getSwapLimits(Tokens.BITCOIN.BTC, Tokens.SOLANA.SOL);
inputMin = swapLimits.input.min; //Immediately available
inputMax = swapLimits.input.max; //Immediately available
outputMin = swapLimits.output.min; //Now available due to failed quote
outputMax = swapLimits.output.max; //Now available due to failed quote
```

### Stored swaps

#### Get swap by ID

You can retrieve a swap by it's id, you can get an ID of the swap with

```typescript
const swapId = swap.getId();
```

And then later retrieve it from the storage

```typescript
const swap = await swapper.getSwapById(id);
```

#### Get refundable swaps
You can refund the swaps in one of two cases:
* In case intermediary is non-cooperative and goes offline, you can claim the funds from the swap contract back after some time.
* In case intermediary tried to pay but was unsuccessful, so he sent you signed message with which you can refund now without waiting.

This call can be checked on every startup and periodically every few minutes.
```typescript
//Get refundable swaps and refund them
const refundableSolanaSwaps = await swapper.getRefundableSwaps("SOLANA", solanaSigner.getAddress());
for(let swap of refundableSolanaSwaps) await swap.refund(solanaSigner);
const refundableStarknetSwaps = await swapper.getRefundableSwaps("STARKNET", starknetSigner.getAddress());
for(let swap of refundableStarknetSwaps) await swap.refund(starknetSigner);
```

#### Get claimable swaps
Returns swaps that are ready to be claimed by the client, this can happen if client closes the application when a swap is in-progress and the swap is concluded while the client is offline.

```typescript
//Get the swaps
const claimableSolanaSwaps = await solanaSwapper.getClaimableSwaps("SOLANA", solanaSigner.getAddress());
//Claim all the claimable swaps
for(let swap of claimableSolanaSwaps) {
    if(swap.canCommit()) await swap.commit(solanaSigner); //This is for Bitcoin (lightning) -> Smart chain swaps, where commit & claim procedure might be needed
    await swap.claim(solanaSigner);
}
//Get the swaps
const claimableStarknetSwaps = await solanaSwapper.getClaimableSwaps("STARKNET", starknetSigner.getAddress());
//Claim all the claimable swaps
for(let swap of claimableStarknetSwaps) {
  if(swap.canCommit()) await swap.commit(starknetSigner); //This is for Bitcoin (lightning) -> Smart chain swaps, where commit & claim procedure might be needed
  await swap.claim(starknetSigner);
}
```

### Helpers

#### Getting wallet balances

The SDK also contains helper functions for getting the maximum spendable balance of wallets

```typescript
//Spendable balance of the starknet wallet address (discounting transaction fees)
const strkBalance = await swapper.Utils.getSpendableBalance(starknetSigner, Tokens.STARKNET.STRK);
//Spendable balance of the solana wallet address (discounting transaction fees)
const solBalance = await swapper.Utils.getSpendableBalance(solanaSigner, Tokens.SOLANA.SOL);
//Spendable balance of the bitcoin wallet - here we also need to specify the destination chain (as there are different swap protocols available with different on-chain footprints)
const {balance: btcBalance, feeRate: btcFeeRate} = await swapper.Utils.getBitcoinSpendableBalance(bitcoinWalletAddress, "SOLANA");
```

#### Unified address parser

A common way for parsing all address formats supported by the SDK, automatically recognizes:
- Bitcoin on-chain L1 address formats (p2pkh, p2wpkh, p2wsh, p2wsh, p2tr)
- [BIP-21](https://en.bitcoin.it/wiki/BIP_0021) bitcoin payment URI
- BOLT11 lightning network invoices
- [LUD-6](https://github.com/lnurl/luds/blob/luds/06.md) LNURL-pay links
- [LUD-3](https://github.com/lnurl/luds/blob/luds/03.md) LNURL-withdraw links
- [LUD-16](https://github.com/lnurl/luds/blob/luds/16.md) Lightning static internet identifiers 
- Smart chain addresses (Solana, Starknet, etc.)

```typescript
const res = await swapper.Utils.parseAddress(address);
switch(res.type) {
  case "BITCOIN":
    //Bitcoin on-chain L1 address or BIP-21 URI scheme with amount
    const btcAmount = res.amount;
    break;
  case "LIGHTNING":
    //BOLT11 lightning network invoice with pre-set amount
    const lnAmount = res.amount;
    break;
  case "LNURL":
    //LNURL payment or withdrawal link
    if(isLNURLWithdraw(res.lnurl)) {
      //LNURL-withdraw allowing withdrawals over the lightning network
      const lnurlWithdrawData: LNURLWithdraw = res.lnurl;
      const minWithdrawable = res.min; //Minimum payment amount
      const maxWithdrawable = res.max; //Maximum payment amount
      const fixedAmount = res.amount; //If res.min===res.max, an fixed amount is returned instead
      //Should show a UI allowing the user to choose an amount he wishes to withdraw
    }
    if(isLNURLPay(res.lnurl)) {
      //LNURL-pay or static lightning internet identifier allowing repeated payments over the lightning network
      const lnurlPayData: LNURLPay = res.lnurl;
      const minPayable = res.min; //Minimum payment amount
      const maxPayable = res.max; //Maximum payment amount
      const fixedAmount = res.amount; //If res.min===res.max, an fixed amount is returned instead
      const icon: (string | null) = res.lnurl.icon; //URL encoded icon that should be displayed on the UI
      const shortDescription: (string | null) = res.lnurl.shortDescription; //Short description of the payment
      const longDescription: (string | null) = res.lnurl.longDescription; //Long description of the payment
      const maxCommentLength: (number | 0) = res.lnurl.commentMaxLength; //Maximum allowed length of the payment message/comment (0 means no comment allowed)
      //Should show a UI displaying the icon, short description, long description, allowing the user to choose an amount he wishes to pay and possibly also a comment
    }
    break;
  default:
    //Addresses for smart chains
    break;
}
```

### Manually signing smart chain transactions

You can also sign the transactions on smart chain side (Solana, Starknet, etc.) of the SDK externally by a separate wallet. Each function which executes any transaction has its txs(action) counterpart, e.g.:
- commit() -> txsCommit()
- claim() -> txsClaim()
- commitAndClaim -> txsCommitAndClaim()
- refund() -> txsRefund()

After sending the transactions, you also need to make sure the SDK has enough time to receive an event notification of the transaction being executed, for this you have the waitTill(action) functions, e.g.:

- commit() -> waitTillCommited()
- claim() -> waitTillClaimed()
- commitAndClaim -> waitTillClaimed()
- refund() -> waitTillRefunded()

```typescript
//Example for Solana
const txns = await swap.txsCommit(); //Also works with txsClaim, txsRefund, txCommitAndClaim
txns.forEach(val => val.tx.sign(...val.signers));
const signedTransactions = await solanaSigner.wallet.signAllTransactions(txns.map(val => val.tx));
for(let tx of signedTransactions) {
    const res = await solanaRpc.sendRawTransaction(tx.serialize());
    await solanaRpc.confirmTransaction(res);
}
await swap.waitTillCommited(); //Or other relevant waitTillClaimed, waitTillRefunded

//Example for Starknet
const txns = await swap.txsCommit(); //Also works with txsClaim, txsRefund, txCommitAndClaim
for(let tx of txns) {
    if(tx.type==="INVOKE") await starknetSigner.account.execute(tx.tx, tx.details);
    if(tx.type==="DEPLOY_ACCOUNT") await starknetSigner.account.deployAccount(tx.tx, tx.details);
}
await swap.waitTillCommited(); //Or other relevant waitTillClaimed, waitTillRefunded

//Example for EVM
const txns = await swap.txsCommit(); //Also works with txsClaim, txsRefund, txCommitAndClaim
for(let tx of txns) {
  await evmSigner.account.sendTransaction(tx);
}
await swap.waitTillCommited(); //Or other relevant waitTillClaimed, waitTillRefunded
```

### Additional swapper options

You can further customize the swapper instance with these options, you can:
- adjust the maximum accepted pricing difference from the LPs
- use custom mempool.space instance
- use custom pricing API
- use own LP node for swaps
- adjust HTTP request timeouts
- add parameters to be sent with each LP request

```typescript
const swapper = Factory.newSwapper({
    ...
    //Additional optional options
    pricingFeeDifferencePPM: 20000n, //Maximum allowed pricing difference for quote (between swap & market price) in ppm (parts per million) (20000 == 2%)
    mempoolApi: new MempoolApi("<url to custom mempool.space instance>"), //Set the SDK to use a custom mempool.space instance instead of the public one
    getPriceFn: (tickers: string[], abortSignal?: AbortSignal) => customPricingApi.getUsdPriceForTickers(tickers) //Overrides the default pricing API engine with a custom price getter

    intermediaryUrl: "<url to custom LP node>",
    registryUrl: "<url to custom LP node registry>",

    getRequestTimeout: 10000, //Timeout in milliseconds for GET requests
    postRequestTimeout: 10000, //Timeout in milliseconds for POST requests
    defaultAdditionalParameters: {lpData: "Pls give gud price"}, //Additional request data sent to LPs

    defaultTrustedIntermediaryUrl: "<url to custom LP node>" //LP node/intermediary to use for trusted gas swaps
});
```
