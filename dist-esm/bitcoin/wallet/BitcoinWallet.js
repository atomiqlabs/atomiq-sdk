import { coinSelect, maxSendable } from "../coinselect2/index.js";
import { NETWORK, TEST_NETWORK } from "@scure/btc-signer/utils";
import { Transaction, Address } from "@scure/btc-signer";
import { Buffer } from "buffer";
import { getDummyOutputScript, getWalletAddressUtxos, toCoinselectAddressType, toOutputScript } from "../../utils/BitcoinUtils.js";
import { getLogger } from "../../utils/Logger.js";
import { BitcoinNetwork } from "@atomiqlabs/base";
import { isCoinselectAddressType, utils } from "../coinselect2/utils.js";
import { addPsbtInputs } from "../../utils/BitcoinWalletUtils.js";
/**
 * Identifies the address type of a Bitcoin address
 *
 * @category Bitcoin
 */
export function identifyAddressType(address, network) {
    switch (Address(network).decode(address).type) {
        case "pkh":
            return "p2pkh";
        case "wpkh":
            return "p2wpkh";
        case "tr":
            return "p2tr";
        case "sh":
            return "p2sh-p2wpkh";
        case "wsh":
            return "p2wsh";
        default:
            throw new Error("Unknown address type of " + address);
    }
}
const btcNetworkMapping = {
    [BitcoinNetwork.MAINNET]: NETWORK,
    [BitcoinNetwork.TESTNET]: TEST_NETWORK,
    [BitcoinNetwork.TESTNET4]: TEST_NETWORK,
    [BitcoinNetwork.REGTEST]: {
        ...TEST_NETWORK,
        bech32: "bcrt"
    }
};
const logger = getLogger("BitcoinWallet: ");
/**
 * Abstract base class for Bitcoin wallet implementations, using bitcoin rpc with address index
 *  as a backend for fetching balances, UTXOs, etc.
 *
 * @category Bitcoin
 */
export class BitcoinWallet {
    constructor(mempoolApi, network, feeMultiplier = 1.25, feeOverride) {
        this.rpc = mempoolApi;
        this.network = typeof (network) === "object" ? network : BitcoinWallet.bitcoinNetworkToObject(network);
        this.feeMultiplier = feeMultiplier;
        this.feeOverride = feeOverride;
    }
    /**
     * @inheritDoc
     */
    async getFeeRate() {
        if (this.feeOverride != null) {
            return this.feeOverride;
        }
        return Math.floor((await this.rpc.getFeeRate()) * this.feeMultiplier);
    }
    /**
     * Internal helper function for sending a raw transaction through the underlying RPC
     *
     * @param rawHex Serialized bitcoin transaction in hexadecimal format
     * @returns txId Transaction ID of the submitted bitcoin transaction
     *
     * @protected
     */
    _sendTransaction(rawHex) {
        return this.rpc.sendRawTransaction(rawHex);
    }
    /**
     * Internal helper function for fetching the balance of the wallet given a specific bitcoin wallet address
     *
     * @param address
     * @protected
     */
    _getBalance(address) {
        return this.rpc.getAddressBalances(address);
    }
    /**
     * Internal helper function for fetching the UTXO set of a given wallet address
     *
     * @param sendingAddress
     * @param sendingPublicKey
     * @param sendingAddressType
     * @protected
     */
    async _getUtxoPool(sendingAddress, sendingPublicKey, sendingAddressType) {
        const utxoPool = await getWalletAddressUtxos(this.rpc, this.network, sendingAddress, sendingPublicKey, sendingAddressType);
        const totalSpendable = utxoPool.reduce((total, utxo) => total + utxo.value, 0);
        logger.debug("_getUtxoPool(): Total spendable value: " + totalSpendable + " num utxos: " + utxoPool.length);
        return utxoPool;
    }
    /**
     *
     * @param sendingAccounts
     * @param recipient
     * @param amount
     * @param feeRate
     * @protected
     */
    async _getPsbt(sendingAccounts, recipient, amount, feeRate) {
        const psbt = new Transaction({ PSBTVersion: 0 });
        psbt.addOutput({
            amount: BigInt(amount),
            script: toOutputScript(this.network, recipient)
        });
        return this._fundPsbt(sendingAccounts, psbt, feeRate);
    }
    async _fundPsbt(sendingAccounts, psbt, _feeRate, utxos, spendFully) {
        const feeRate = _feeRate ?? await this.getFeeRate();
        const utxoPool = utxos ?? (await Promise.all(sendingAccounts.map(acc => this._getUtxoPool(acc.address, acc.pubkey, acc.addressType)))).flat();
        if (spendFully && utxoPool == null)
            throw new Error("Cannot fully spend when no utxos are passed!");
        logger.debug("_fundPsbt(): fee rate: " + feeRate + " utxo pool: ", utxoPool);
        const requiredInputs = [];
        for (let i = 0; i < psbt.inputsLength; i++) {
            const input = psbt.getInput(i);
            if (input.index == null || input.txid == null)
                throw new Error("Inputs need txid & index!");
            let amount;
            let script;
            if (input.witnessUtxo != null) {
                amount = input.witnessUtxo.amount;
                script = input.witnessUtxo.script;
            }
            else if (input.nonWitnessUtxo != null) {
                amount = input.nonWitnessUtxo.outputs[input.index].amount;
                script = input.nonWitnessUtxo.outputs[input.index].script;
            }
            else
                throw new Error("Either witnessUtxo or nonWitnessUtxo has to be defined!");
            requiredInputs.push({
                txId: Buffer.from(input.txid).toString('hex'),
                vout: input.index,
                value: Number(amount),
                type: toCoinselectAddressType(script)
            });
        }
        const targets = [];
        for (let i = 0; i < psbt.outputsLength; i++) {
            const output = psbt.getOutput(i);
            if (output.amount == null || output.script == null)
                throw new Error("Outputs need amount & script defined!");
            targets.push({
                value: Number(output.amount),
                script: Buffer.from(output.script)
            });
        }
        logger.debug("_fundPsbt(): Coinselect targets: ", targets);
        let coinselectResult = spendFully
            ? utils.finalize(requiredInputs.concat(utxoPool.filter(utxo => !utils.isDetrimentalInput(feeRate, utxo))), targets, feeRate, null)
            : coinSelect(utxoPool, targets, feeRate, sendingAccounts[0].addressType, requiredInputs);
        logger.debug("_fundPsbt(): Coinselect result: ", coinselectResult);
        if (coinselectResult.inputs == null || coinselectResult.outputs == null || coinselectResult.effectiveFeeRate == null) {
            return {
                fee: coinselectResult.fee
            };
        }
        if (spendFully && feeRate != null) {
            const maximumAllowedFeeRate = (1.5 * feeRate) + 10;
            if (coinselectResult.effectiveFeeRate > maximumAllowedFeeRate)
                throw new Error(`Effective fee rate too high, feeRate: ${coinselectResult.effectiveFeeRate} sats/vB, maximum: ${maximumAllowedFeeRate} sats/vB!`);
            const minimumAllowedFeeRate = 0.9 * feeRate;
            if (coinselectResult.effectiveFeeRate < minimumAllowedFeeRate)
                throw new Error(`Effective fee rate too low, feeRate: ${coinselectResult.effectiveFeeRate} sats/vB, minimum: ${minimumAllowedFeeRate} sats/vB!`);
        }
        // Remove in/outs that are already in the PSBT
        coinselectResult.inputs.splice(0, psbt.inputsLength);
        coinselectResult.outputs.splice(0, psbt.outputsLength);
        const inputAddressIndexes = {};
        coinselectResult.inputs.forEach((input, index) => {
            inputAddressIndexes[input.address] ??= [];
            inputAddressIndexes[input.address].push(index);
        });
        await addPsbtInputs(psbt, coinselectResult.inputs.map(input => ({ ...input, type: input.type, outputScript: input.outputScript, publicKey: input.publicKey })), this.rpc, this.network);
        coinselectResult.outputs.forEach(output => {
            if (output.script == null && output.address == null) {
                //Change output
                psbt.addOutput({
                    script: toOutputScript(this.network, sendingAccounts[0].address),
                    amount: BigInt(Math.floor(output.value))
                });
            }
            else {
                psbt.addOutput({
                    script: output.script ?? toOutputScript(this.network, output.address),
                    amount: BigInt(output.value)
                });
            }
        });
        return {
            psbt,
            fee: coinselectResult.fee,
            inputAddressIndexes
        };
    }
    async _getSpendableBalance(sendingAccounts, psbt, feeRate, outputAddressType, utxoPool) {
        feeRate ??= await this.getFeeRate();
        utxoPool ??= (await Promise.all(sendingAccounts.map(acc => this._getUtxoPool(acc.address, acc.pubkey, acc.addressType)))).flat();
        return {
            ...BitcoinWallet.getSpendableBalance(utxoPool ?? (await Promise.all(sendingAccounts.map(acc => this._getUtxoPool(acc.address, acc.pubkey, acc.addressType)))).flat(), feeRate ?? await this.getFeeRate(), psbt, outputAddressType),
            feeRate
        };
    }
    getChangeAddress() {
        return this.getReceiveAddress();
    }
    _toCoinselectAddressType(outputAddressTypeOrAddress) {
        if (isCoinselectAddressType(outputAddressTypeOrAddress)) {
            return outputAddressTypeOrAddress;
        }
        else {
            return identifyAddressType(outputAddressTypeOrAddress, this.network);
        }
    }
    static bitcoinNetworkToObject(network) {
        return btcNetworkMapping[network];
    }
    static getSpendableBalance(utxoPool, feeRate, psbt, outputAddressType, skipDetrimental = true) {
        skipDetrimental ??= true;
        const requiredInputs = [];
        if (psbt != null)
            for (let i = 0; i < psbt.inputsLength; i++) {
                const input = psbt.getInput(i);
                if (input.index == null || input.txid == null)
                    throw new Error("Inputs need txid & index!");
                let amount;
                let script;
                if (input.witnessUtxo != null) {
                    amount = input.witnessUtxo.amount;
                    script = input.witnessUtxo.script;
                }
                else if (input.nonWitnessUtxo != null) {
                    amount = input.nonWitnessUtxo.outputs[input.index].amount;
                    script = input.nonWitnessUtxo.outputs[input.index].script;
                }
                else
                    throw new Error("Either witnessUtxo or nonWitnessUtxo has to be defined!");
                requiredInputs.push({
                    txId: Buffer.from(input.txid).toString('hex'),
                    vout: input.index,
                    value: Number(amount),
                    type: toCoinselectAddressType(script)
                });
            }
        const additionalOutputs = [];
        if (psbt != null)
            for (let i = 0; i < psbt.outputsLength; i++) {
                const output = psbt.getOutput(i);
                if (output.amount == null || output.script == null)
                    throw new Error("Outputs need amount & script!");
                additionalOutputs.push({
                    value: Number(output.amount),
                    script: Buffer.from(output.script)
                });
            }
        const target = getDummyOutputScript(outputAddressType ?? "p2wsh");
        let coinselectResult = maxSendable(utxoPool, { script: Buffer.from(target), type: outputAddressType ?? "p2wsh" }, feeRate, requiredInputs, additionalOutputs, skipDetrimental);
        logger.debug("_getSpendableBalance(): Max spendable result: ", coinselectResult);
        return {
            selectedUtxos: utxoPool.filter(utxo => coinselectResult.selectedUtxos.includes(utxo)),
            balance: BigInt(Math.floor(coinselectResult.value)),
            totalFee: coinselectResult.fee
        };
    }
}
