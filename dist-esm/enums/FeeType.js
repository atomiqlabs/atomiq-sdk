/**
 * Enum representing types of fees in a swap
 *
 * @category Pricing
 */
export var FeeType;
(function (FeeType) {
    /**
     * Swap fee taken by the LP
     */
    FeeType[FeeType["SWAP"] = 0] = "SWAP";
    /**
     * Network fee to cover the transactions on the destination (output) network
     */
    FeeType[FeeType["NETWORK_OUTPUT"] = 1] = "NETWORK_OUTPUT";
    /**
     * Bitcoin input-side network fee paid by externally funded SPV swaps
     */
    FeeType[FeeType["NETWORK_INPUT"] = 2] = "NETWORK_INPUT";
})(FeeType = FeeType || (FeeType = {}));
