/**
 * Type guard to check if an object is an {@link IAddressSwap}
 *
 * @category Swaps
 */
export function isIAddressSwap(obj: any): obj is IAddressSwap {
    return obj!=null &&
        typeof(obj.getAddress) === "function" &&
        typeof(obj.getHyperlink) === "function";
}

/**
 * Interface for swaps which require a user to send funds to a specific address
 *
 * @category Swaps
 */
export interface IAddressSwap {

    /**
     * An address to which the user needs to send funds on the source chain
     */
    getAddress(): string;

    /**
     * A hyperlink representation of the address + amount that the user needs to sends on the source chain.
     *  This is suitable to be displayed in a form of QR code.
     */
    getHyperlink(): string;

}
