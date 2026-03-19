"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSwapExecutionActionWait = exports.isSwapExecutionActionSignSmartChainTx = exports.isSwapExecutionActionSignPSBT = exports.isSwapExecutionActionSendToAddress = void 0;
const btc_signer_1 = require("@scure/btc-signer");
const TokenAmount_1 = require("./TokenAmount");
const Token_1 = require("./Token");
const swapExecutionActionWaitNames = {
    LP: "Awaiting LP payout",
    SETTLEMENT: "Automatic settlement",
    BITCOIN_CONFS: "Bitcoin confirmations"
};
function isSwapExecutionActionPsbtTx(obj, type) {
    const resolvedType = type ?? obj?.type;
    if (obj == null || typeof (obj) !== "object")
        return false;
    if (resolvedType !== "FUNDED_PSBT" && resolvedType !== "RAW_PSBT")
        return false;
    return obj.type === resolvedType &&
        obj.psbt instanceof btc_signer_1.Transaction &&
        typeof (obj.psbtHex) === "string" &&
        typeof (obj.psbtBase64) === "string" &&
        (resolvedType === "FUNDED_PSBT"
            ? Array.isArray(obj.signInputs) && obj.signInputs.every((input) => typeof (input) === "number")
            : typeof (obj.in1sequence) === "number");
}
/**
 * Type guard for {@link SwapExecutionActionSendToAddress}
 *
 * @category Swap Actions
 */
function isSwapExecutionActionSendToAddress(obj, lightning) {
    const resolvedLightning = lightning ?? (obj?.chain === "LIGHTNING");
    return obj != null &&
        typeof (obj) === "object" &&
        obj.type === "SendToAddress" &&
        obj.name === (resolvedLightning ? "Deposit on Lightning" : "Deposit on Bitcoin") &&
        typeof (obj.description) === "string" &&
        obj.chain === (resolvedLightning ? "LIGHTNING" : "BITCOIN") &&
        Array.isArray(obj.txs) &&
        obj.txs.every((tx) => tx != null &&
            typeof (tx) === "object" &&
            tx.type === (resolvedLightning ? "BOLT11_PAYMENT_REQUEST" : "BITCOIN_ADDRESS") &&
            typeof (tx.address) === "string" &&
            typeof (tx.hyperlink) === "string" &&
            (0, TokenAmount_1.isTokenAmount)(tx.amount, lightning ? Token_1.BitcoinTokens.BTCLN : Token_1.BitcoinTokens.BTC, true)) &&
        typeof (obj.waitForTransactions) === "function";
}
exports.isSwapExecutionActionSendToAddress = isSwapExecutionActionSendToAddress;
/**
 * Type guard for {@link SwapExecutionActionSignPSBT}
 *
 * @category Swap Actions
 */
function isSwapExecutionActionSignPSBT(obj, psbtType) {
    const resolvedPsbtType = psbtType ?? obj?.txs?.[0]?.type;
    return obj != null &&
        typeof (obj) === "object" &&
        obj.type === "SignPSBT" &&
        obj.name === "Deposit on Bitcoin" &&
        typeof (obj.description) === "string" &&
        obj.chain === "BITCOIN" &&
        Array.isArray(obj.txs) &&
        obj.txs.every((tx) => isSwapExecutionActionPsbtTx(tx, resolvedPsbtType)) &&
        typeof (obj.submitPsbt) === "function";
}
exports.isSwapExecutionActionSignPSBT = isSwapExecutionActionSignPSBT;
/**
 * Type guard for {@link SwapExecutionActionSignSmartChainTx}
 *
 * @category Swap Actions
 */
function isSwapExecutionActionSignSmartChainTx(obj, chainIdentifier) {
    const allowedChains = chainIdentifier == null ? null : Array.isArray(chainIdentifier) ? chainIdentifier : [chainIdentifier];
    return obj != null &&
        typeof (obj) === "object" &&
        obj.type === "SignSmartChainTransaction" &&
        (obj.name === "Initiate swap" ||
            obj.name === "Settle manually" ||
            obj.name === "Refund") &&
        typeof (obj.description) === "string" &&
        typeof (obj.chain) === "string" &&
        (allowedChains == null || allowedChains.includes(obj.chain)) &&
        Array.isArray(obj.txs) &&
        typeof (obj.submitTransactions) === "function" &&
        typeof (obj.requiredSigner) === "string";
}
exports.isSwapExecutionActionSignSmartChainTx = isSwapExecutionActionSignSmartChainTx;
/**
 * Type guard for {@link SwapExecutionActionWait}
 *
 * @category Swap Actions
 */
function isSwapExecutionActionWait(obj, waitType) {
    const resolvedWaitType = waitType ??
        Object.keys(swapExecutionActionWaitNames).find(key => swapExecutionActionWaitNames[key] === obj?.name);
    return obj != null &&
        typeof (obj) === "object" &&
        obj.type === "Wait" &&
        resolvedWaitType != null &&
        obj.name === swapExecutionActionWaitNames[resolvedWaitType] &&
        typeof (obj.description) === "string" &&
        typeof (obj.wait) === "function" &&
        typeof (obj.expectedTimeSeconds) === "number" &&
        typeof (obj.pollTimeSeconds) === "number";
}
exports.isSwapExecutionActionWait = isSwapExecutionActionWait;
