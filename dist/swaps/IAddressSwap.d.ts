/**
 * Type guard to check if an object is an IAddressSwap
 * @category Swaps
 */
export declare function isIAddressSwap(obj: any): obj is IAddressSwap;
/**
 * Interface for swaps which require a user to send funds to a specific address
 * @category Swaps
 */
export interface IAddressSwap {
    getAddress(): string;
    getHyperlink(): string;
}
