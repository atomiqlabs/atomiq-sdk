import {secp256k1, schnorr} from "@noble/curves/secp256k1";
import {randomBytes} from "../../utils/Utils";


function parsePrivateKey(value: string, name: string) {
    if(!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte hex private key`);
    const bytes = Buffer.from(value, "hex");
    if(!secp256k1.utils.isValidPrivateKey(bytes)) throw new Error(`${name} is not a valid secp256k1 private key`);
    return bytes;
}

function parsePublicKey(value: string, name: string) {
    if(!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be an X-only 32-byte hex public key`);
    if(!secp256k1.utils.isValidPublicKey(Buffer.from("02"+value, "hex"), true)) throw new Error(`${name} is not a valid X-only 32-byte secp256k1 public key`);
    return Buffer.from(value, "hex");
}

function parseSignature(value: string, name: string) {
    if(!/^[0-9a-fA-F]{128}$/.test(value)) throw new Error(`${name} must be a valid 64-byte hex schnorr signature`);
    return Buffer.from(value, "hex");
}

const CERTIFICATE_LENGTH = 64+128+64;

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
export function getSignedKeyBasedAuthHandler(certificate: string, privateKey: string): (type: "GET" | "POST", url: string, body?: any) => Record<string, string> {
    const _privateKey = parsePrivateKey(privateKey, "Private key");

    if(certificate.length!==CERTIFICATE_LENGTH) throw new Error(`Certificate has invalid length, expected ${CERTIFICATE_LENGTH}!`);

    const authorityPublicKey = parsePublicKey(certificate.substring(0, 64), "Certificate: Authority Public key");
    const authoritySignature = parseSignature(certificate.substring(64, 64+128), "Certificate: Authority Signature");
    const signingPublicKey = parsePublicKey(certificate.substring(64+128), "Certificate: Signing Public key");

    if(!schnorr.verify(authoritySignature, signingPublicKey, authorityPublicKey)) throw new Error("Invalid certificate, authority signature is not valid!");
    if(!signingPublicKey.equals(schnorr.getPublicKey(privateKey))) throw new Error("Passed private key doesn't match the certificate!");

    const _certificate = Buffer.from(certificate, "hex");

    return () => {
        const timestamp = Math.floor(Date.now()/1000);
        const timestampBuffer = Buffer.alloc(4);
        timestampBuffer.writeUInt32BE(timestamp);
        const requestUid = randomBytes(32);

        const toSign = Buffer.concat([timestampBuffer, requestUid]);
        const signature = schnorr.sign(toSign, _privateKey);

        return {
            "x-atomiq-auth": Buffer.concat([
                toSign,
                _certificate,
                signature
            ]).toString("hex")
        }
    };
}
