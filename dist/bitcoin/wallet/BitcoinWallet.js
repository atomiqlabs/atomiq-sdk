"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitcoinWallet = exports.identifyAddressType = void 0;
const coinselect2_1 = require("../coinselect2");
const utils_1 = require("@scure/btc-signer/utils");
const btc_signer_1 = require("@scure/btc-signer");
const buffer_1 = require("buffer");
const Utils_1 = require("../../utils/Utils");
const BitcoinUtils_1 = require("../../utils/BitcoinUtils");
const Logger_1 = require("../../utils/Logger");
const base_1 = require("@atomiqlabs/base");
const utils_2 = require("../coinselect2/utils");
/**
 * Identifies the address type of a Bitcoin address
 *
 * @category Bitcoin
 */
function identifyAddressType(address, network) {
    switch ((0, btc_signer_1.Address)(network).decode(address).type) {
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
exports.identifyAddressType = identifyAddressType;
const btcNetworkMapping = {
    [base_1.BitcoinNetwork.MAINNET]: utils_1.NETWORK,
    [base_1.BitcoinNetwork.TESTNET]: utils_1.TEST_NETWORK,
    [base_1.BitcoinNetwork.TESTNET4]: utils_1.TEST_NETWORK,
    [base_1.BitcoinNetwork.REGTEST]: {
        ...utils_1.TEST_NETWORK,
        bech32: "bcrt"
    }
};
const logger = (0, Logger_1.getLogger)("BitcoinWallet: ");
/**
 * Abstract base class for Bitcoin wallet implementations, using bitcoin rpc with address index
 *  as a backend for fetching balances, UTXOs, etc.
 *
 * @category Bitcoin
 */
class BitcoinWallet {
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
     * @param sendingAddressType
     * @protected
     */
    async _getUtxoPool(sendingAddress, sendingAddressType) {
        const utxos = await this.rpc.getAddressUTXOs(sendingAddress);
        let totalSpendable = 0;
        const outputScript = (0, BitcoinUtils_1.toOutputScript)(this.network, sendingAddress);
        const utxoPool = [];
        for (let utxo of utxos) {
            const value = Number(utxo.value);
            totalSpendable += value;
            utxoPool.push({
                vout: utxo.vout,
                txId: utxo.txid,
                value: value,
                type: sendingAddressType,
                outputScript: outputScript,
                address: sendingAddress,
                cpfp: !utxo.confirmed ? await this.rpc.getCPFPData(utxo.txid).then((result) => {
                    if (result == null)
                        return;
                    return {
                        txVsize: result.adjustedVsize,
                        txEffectiveFeeRate: result.effectiveFeePerVsize
                    };
                }) : undefined,
                confirmed: utxo.confirmed
            });
        }
        logger.debug("_getUtxoPool(): Total spendable value: " + totalSpendable + " num utxos: " + utxoPool.length);
        return utxoPool;
    }
    /**
     * @protected
     */
    async _getPsbt(sendingAccounts, recipient, amount, feeRate, utxoPool) {
        const psbt = new btc_signer_1.Transaction({ PSBTVersion: 0 });
        psbt.addOutput({
            amount: BigInt(amount),
            script: (0, BitcoinUtils_1.toOutputScript)(this.network, recipient)
        });
        return this._fundPsbt(sendingAccounts, psbt, feeRate, utxoPool);
    }
    async _fundPsbt(sendingAccounts, psbt, feeRate, utxoPool) {
        if (feeRate == null)
            feeRate = await this.getFeeRate();
        utxoPool ??= (await Promise.all(sendingAccounts.map(acc => this._getUtxoPool(acc.address, acc.addressType)))).flat();
        logger.debug("_fundPsbt(): fee rate: " + feeRate + " utxo pool: ", utxoPool);
        const accountPubkeys = {};
        sendingAccounts.forEach(acc => accountPubkeys[acc.address] = acc.pubkey);
        const requiredInputs = [];
        for (let i = 0; i < psbt.inputsLength; i++) {
            requiredInputs.push(BitcoinWallet.psbtInputToCoinselectInput(psbt, i));
        }
        const targets = [];
        for (let i = 0; i < psbt.outputsLength; i++) {
            targets.push(BitcoinWallet.psbtOutputToCoinselectOutput(psbt, i));
        }
        logger.debug("_fundPsbt(): Coinselect targets: ", targets);
        let coinselectResult = (0, coinselect2_1.coinSelect)(utxoPool, targets, feeRate, sendingAccounts[0].addressType, requiredInputs);
        logger.debug("_fundPsbt(): Coinselect result: ", coinselectResult);
        if (coinselectResult.inputs == null || coinselectResult.outputs == null) {
            return {
                fee: coinselectResult.fee
            };
        }
        // Remove in/outs that are already in the PSBT
        coinselectResult.inputs.splice(0, psbt.inputsLength);
        coinselectResult.outputs.splice(0, psbt.outputsLength);
        const inputAddressIndexes = {};
        coinselectResult.inputs.forEach((input, index) => {
            inputAddressIndexes[input.address] ??= [];
            inputAddressIndexes[input.address].push(index);
        });
        const formattedInputs = await Promise.all(coinselectResult.inputs.map(async (input) => {
            switch (input.type) {
                case "p2tr":
                    const parsed = (0, btc_signer_1.p2tr)(buffer_1.Buffer.from(accountPubkeys[input.address], "hex"));
                    return {
                        txid: input.txId,
                        index: input.vout,
                        witnessUtxo: {
                            script: input.outputScript,
                            amount: BigInt(input.value)
                        },
                        tapInternalKey: parsed.tapInternalKey,
                        tapMerkleRoot: parsed.tapMerkleRoot,
                        tapLeafScript: parsed.tapLeafScript
                    };
                case "p2wpkh":
                    return {
                        txid: input.txId,
                        index: input.vout,
                        witnessUtxo: {
                            script: input.outputScript,
                            amount: BigInt(input.value)
                        },
                        sighashType: 0x01
                    };
                case "p2sh-p2wpkh":
                    return {
                        txid: input.txId,
                        index: input.vout,
                        witnessUtxo: {
                            script: input.outputScript,
                            amount: BigInt(input.value)
                        },
                        redeemScript: (0, btc_signer_1.p2wpkh)(buffer_1.Buffer.from(accountPubkeys[input.address], "hex"), this.network).script,
                        sighashType: 0x01
                    };
                case "p2pkh":
                    const tx = await this.rpc.getTransaction(input.txId);
                    if (tx == null)
                        throw new Error("Cannot fetch existing tx " + input.txId);
                    return {
                        txid: input.txId,
                        index: input.vout,
                        nonWitnessUtxo: tx.raw,
                        sighashType: 0x01
                    };
                default:
                    throw new Error("Invalid input type: " + input.type);
            }
        }));
        formattedInputs.forEach(input => psbt.addInput(input));
        coinselectResult.outputs.forEach(output => {
            if (output.script == null && output.address == null) {
                //Change output
                psbt.addOutput({
                    script: (0, BitcoinUtils_1.toOutputScript)(this.network, sendingAccounts[0].address),
                    amount: BigInt(Math.floor(output.value))
                });
            }
            else {
                psbt.addOutput({
                    script: output.script ?? (0, BitcoinUtils_1.toOutputScript)(this.network, output.address),
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
        utxoPool ??= (await Promise.all(sendingAccounts.map(acc => this._getUtxoPool(acc.address, acc.addressType)))).flat();
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
                    txId: buffer_1.Buffer.from(input.txid).toString('hex'),
                    vout: input.index,
                    value: Number(amount),
                    type: (0, BitcoinUtils_1.toCoinselectAddressType)(script)
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
                    script: buffer_1.Buffer.from(output.script)
                });
            }
        let target;
        switch (outputAddressType) {
            case "p2pkh":
                target = btc_signer_1.OutScript.encode({ type: "pkh", hash: (0, Utils_1.randomBytes)(20) });
                break;
            case "p2sh-p2wpkh":
                target = btc_signer_1.OutScript.encode({ type: "sh", hash: (0, Utils_1.randomBytes)(20) });
                break;
            case "p2wpkh":
                target = btc_signer_1.OutScript.encode({ type: "wpkh", hash: (0, Utils_1.randomBytes)(20) });
                break;
            case "p2tr":
                target = btc_signer_1.OutScript.encode({
                    type: "tr",
                    pubkey: buffer_1.Buffer.from("0101010101010101010101010101010101010101010101010101010101010101", "hex")
                });
                break;
            default:
                target = btc_signer_1.OutScript.encode({ type: "wsh", hash: (0, Utils_1.randomBytes)(32) });
                break;
        }
        let coinselectResult = (0, coinselect2_1.maxSendable)(utxoPool, { script: buffer_1.Buffer.from(target), type: outputAddressType ?? "p2wsh" }, feeRate, requiredInputs, additionalOutputs);
        logger.debug("_getSpendableBalance(): Max spendable result: ", coinselectResult);
        return {
            feeRate: feeRate,
            balance: BigInt(Math.floor(coinselectResult.value)),
            totalFee: coinselectResult.fee
        };
    }
    static bitcoinNetworkToObject(network) {
        return btcNetworkMapping[network];
    }
    static psbtInputToCoinselectInput(psbt, vin) {
        const input = psbt.getInput(vin);
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
        return {
            txId: buffer_1.Buffer.from(input.txid).toString('hex'),
            vout: input.index,
            value: Number(amount),
            type: (0, BitcoinUtils_1.toCoinselectAddressType)(script)
        };
    }
    static psbtOutputToCoinselectOutput(psbt, vout) {
        const output = psbt.getOutput(vout);
        if (output.amount == null || output.script == null)
            throw new Error("Outputs need amount & script defined!");
        return {
            value: Number(output.amount),
            script: buffer_1.Buffer.from(output.script)
        };
    }
    static estimatePsbtVSize(psbt) {
        const inputs = [];
        for (let i = 0; i < psbt.inputsLength; i++) {
            inputs.push(BitcoinWallet.psbtInputToCoinselectInput(psbt, i));
        }
        const outputs = [];
        for (let i = 0; i < psbt.outputsLength; i++) {
            outputs.push(BitcoinWallet.psbtOutputToCoinselectOutput(psbt, i));
        }
        return utils_2.utils.transactionBytes(inputs, outputs);
    }
}
exports.BitcoinWallet = BitcoinWallet;
