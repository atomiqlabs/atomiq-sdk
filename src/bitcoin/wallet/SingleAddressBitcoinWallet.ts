import {CoinselectAddressTypes} from "../coinselect2";
import {BTC_NETWORK, pubECDSA, randomPrivateKeyBytes} from "@scure/btc-signer/utils"
import {getAddress, Transaction, WIF} from "@scure/btc-signer";
import {Buffer} from "buffer";
import {identifyAddressType, BitcoinWallet} from "./BitcoinWallet";
import {BitcoinRpcWithAddressIndex} from "../BitcoinRpcWithAddressIndex";

export class SingleAddressBitcoinWallet extends BitcoinWallet {

    readonly privKey?: Uint8Array;
    readonly pubkey: Uint8Array;
    readonly address: string;
    readonly addressType: CoinselectAddressTypes;

    constructor(
        mempoolApi: BitcoinRpcWithAddressIndex<any>,
        network: BTC_NETWORK,
        addressDataOrWIF: string | {address: string, publicKey: string},
        feeMultiplier: number = 1.25,
        feeOverride?: number
    ) {
        super(mempoolApi, network, feeMultiplier, feeOverride);
        if(typeof(addressDataOrWIF)==="string") {
            try {
                this.privKey = WIF(network).decode(addressDataOrWIF);
            } catch(e) {
                this.privKey = WIF().decode(addressDataOrWIF);
            }
            this.pubkey = pubECDSA(this.privKey);
            const address = getAddress("wpkh", this.privKey, network);
            if(address==null) throw new Error("Failed to generate p2wpkh address from the provided private key!");
            this.address = address;
        } else {
            this.address = addressDataOrWIF.address;
            this.pubkey = Buffer.from(addressDataOrWIF.publicKey, "hex");
        }
        this.addressType = identifyAddressType(this.address, network);
    }

    protected toBitcoinWalletAccounts(): {pubkey: string, address: string, addressType: CoinselectAddressTypes}[] {
        return [{
            pubkey: Buffer.from(this.pubkey).toString("hex"), address: this.address, addressType: this.addressType
        }];
    }

    async sendTransaction(address: string, amount: bigint, feeRate?: number): Promise<string> {
        if(!this.privKey) throw new Error("Not supported.");
        const {psbt, fee} = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate);
        if(psbt==null) throw new Error(`Not enough funds, required for fee: ${fee} sats!`);
        psbt.sign(this.privKey);
        psbt.finalize();
        const txHex = Buffer.from(psbt.extract()).toString("hex");
        return await super._sendTransaction(txHex);
    }

    async fundPsbt(inputPsbt: Transaction, feeRate?: number): Promise<Transaction> {
        const {psbt} = await super._fundPsbt(this.toBitcoinWalletAccounts(), inputPsbt, feeRate);
        if(psbt==null) {
            throw new Error("Not enough balance!");
        }
        return psbt;
    }

    async signPsbt(psbt: Transaction, signInputs: number[]): Promise<Transaction> {
        if(!this.privKey) throw new Error("Not supported.");
        for(let signInput of signInputs) {
            psbt.signIdx(this.privKey, signInput);
        }
        return psbt;
    }

    async getTransactionFee(address: string, amount: bigint, feeRate?: number): Promise<number> {
        const {fee} = await super._getPsbt(this.toBitcoinWalletAccounts(), address, Number(amount), feeRate);
        return fee;
    }

    async getFundedPsbtFee(basePsbt: Transaction, feeRate?: number): Promise<number> {
        const {fee} = await super._fundPsbt(this.toBitcoinWalletAccounts(), basePsbt, feeRate);
        return fee;
    }

    getReceiveAddress(): string {
        return this.address;
    }
    getBalance(): Promise<{
        confirmedBalance: bigint,
        unconfirmedBalance: bigint
    }> {
        return this._getBalance(this.address);
    }

    getSpendableBalance(psbt?: Transaction, feeRate?: number): Promise<{
        balance: bigint,
        feeRate: number,
        totalFee: number
    }> {
        return this._getSpendableBalance([{address: this.address, addressType: this.addressType}], psbt, feeRate);
    }

    static generateRandomPrivateKey(network?: BTC_NETWORK): string {
         return WIF(network).encode(randomPrivateKeyBytes());
    }

}