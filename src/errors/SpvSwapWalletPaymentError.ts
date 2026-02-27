import {TokenAmount} from "../types/TokenAmount";
import {BtcToken} from "../types/Token";

/**
 * An error indicating that a received UTXO amount/fee doesn't match what the swap requires
 *
 * @category Errors
 */
export class SpvSwapWalletOverpayError extends Error {

    /**
     * Amount (in sats) that should have been sent to the swap wallet
     */
    readonly expectedAmount: TokenAmount<BtcToken<false>, true>;
    /**
     * Amount (in sats) that was actually sent to the swap wallet
     */
    readonly actualAmount: TokenAmount<BtcToken<false>, true>;

    constructor(
        expectedAmount: TokenAmount<BtcToken<false>, true>,
        actualAmount: TokenAmount<BtcToken<false>, true>,
        msg?: string
    ) {
        super(msg);
        this.expectedAmount = expectedAmount;
        this.actualAmount = actualAmount;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SpvSwapWalletOverpayError.prototype);
    }

}

/**
 * An error indicating that a received UTXO amount/fee doesn't match what the swap requires
 *
 * @category Errors
 */
export class SpvSwapWalletUnderpayError extends Error {

    /**
     * Amount (in sats) that should have been sent to the swap wallet
     */
    readonly expectedAmount: TokenAmount<BtcToken<false>, true>;
    /**
     * Amount (in sats) that was actually sent to the swap wallet
     */
    readonly actualAmount: TokenAmount<BtcToken<false>, true>;

    constructor(
        expectedAmount: TokenAmount<BtcToken<false>, true>,
        actualAmount: TokenAmount<BtcToken<false>, true>,
        msg?: string
    ) {
        super(msg);
        this.expectedAmount = expectedAmount;
        this.actualAmount = actualAmount;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SpvSwapWalletUnderpayError.prototype);
    }

}

/**
 * An error indicating that a received UTXO amount/fee doesn't match what the swap requires
 *
 * @category Errors
 */
export class SpvSwapWalletNetworkFeeError extends Error {

    /**
     * Minimum fee rate (in sats/vB) that should have been paid
     */
    readonly minimumFeeRate: number;
    /**
     * Fee rate (in sats/vB) that was actually paid
     */
    readonly actualFeeRate?: number;

    constructor(
        minimumFeeRate: number,
        actualFeeRate?: number,
        msg?: string
    ) {
        super(msg);
        this.minimumFeeRate = minimumFeeRate;
        this.actualFeeRate = actualFeeRate;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, SpvSwapWalletNetworkFeeError.prototype);
    }

}
