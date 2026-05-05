/**
 * Adds a `x-atomiq-auth` header with the following binary format, that is hex-encoded:
 * - 4 bytes - timestamp (timestamp when the request was sent)
 * - 32 bytes - random bytes (entropy, to be signed)
 *
 * - 32 bytes - key of the signing authority
 * - 64 bytes - schnorr signature signing the request signing key by the signing authority
 *
 * - 32 bytes - request signing key (signed by the signing authority)
 * - 64 bytes - schnorr signature of the timestamp and random bytes
 *
 * Uses secp256k1 curve and schnorr signatures
 */
export declare function getSignedKeyBasedAuthHandler(certificate: string, privateKey: string): (type: "GET" | "POST", url: string, body?: any) => Record<string, string>;
