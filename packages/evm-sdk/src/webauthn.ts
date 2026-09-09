import {
  type Address,
  type Hex,
  bytesToHex,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  stringToHex,
  toHex,
} from 'viem'
import { p256 } from '@noble/curves/nist.js'
import type { WebAuthnAuth } from './types'

/** Matches `PasskeyAttester.CHALLENGE_DOMAIN`. */
export const PERSONHOOD_CHALLENGE_DOMAIN = keccak256(stringToHex('SIGNET_PERSONHOOD_V1'))

/** secp256r1 group order. */
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n

export interface PersonhoodChallengeInput {
  chainId: number
  passkeyAttester: Address
  subject: Address
  x: bigint
  y: bigint
}

/**
 * Reproduce `PasskeyAttester.challenge(subject, x, y)`:
 * `abi.encode(CHALLENGE_DOMAIN, block.chainid, address(this), subject, x, y)`.
 * These are the exact bytes the passkey must sign (embedded, base64url, in clientDataJSON).
 */
export function buildPersonhoodChallenge({ chainId, passkeyAttester, subject, x, y }: PersonhoodChallengeInput): Hex {
  return encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
    ],
    [PERSONHOOD_CHALLENGE_DOMAIN, BigInt(chainId), passkeyAttester, subject, x, y]
  )
}

/** `keccak256(abi.encode(x, y))` — the `PasskeyAttester` credential id. */
export function credentialId(x: bigint, y: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [x, y]))
}

/**
 * Extract the P-256 public key `(x, y)` from the SPKI bytes returned by
 * `AuthenticatorAttestationResponse.getPublicKey()` (or any uncompressed point).
 */
export function parseP256PublicKey(spkiOrPoint: ArrayBuffer | Uint8Array | Hex): { x: bigint; y: bigint } {
  const bytes =
    typeof spkiOrPoint === 'string'
      ? hexToBytes(spkiOrPoint)
      : spkiOrPoint instanceof Uint8Array
        ? spkiOrPoint
        : new Uint8Array(spkiOrPoint)

  // An uncompressed EC point is 65 bytes: 0x04 ‖ X(32) ‖ Y(32). In SPKI it is the tail.
  const idx = bytes.lastIndexOf(0x04, bytes.length - 65)
  const start = idx >= 0 && bytes.length - idx === 65 ? idx : bytes.length - 65
  const point = bytes.subarray(start, start + 65)
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error('parseP256PublicKey: could not locate an uncompressed P-256 point')
  }
  return {
    x: BigInt(bytesToHex(point.subarray(1, 33))),
    y: BigInt(bytesToHex(point.subarray(33, 65))),
  }
}

/** DER ECDSA signature -> low-s normalised `(r, s)` as 32-byte hex. */
export function derSignatureToRS(der: ArrayBuffer | Uint8Array | Hex): { r: Hex; s: Hex } {
  const bytes = typeof der === 'string' ? hexToBytes(der) : der instanceof Uint8Array ? der : new Uint8Array(der)
  const sig = p256.Signature.fromBytes(bytes, 'der')
  let s = sig.s
  if (s > P256_N / 2n) s = P256_N - s
  return { r: toHex(sig.r, { size: 32 }), s: toHex(s, { size: 32 }) }
}

/** Byte offset of `needle` in a UTF-8 string (WebAuthn member offsets are pre-unicode, so === char index). */
function byteIndexOf(haystack: string, needle: string): number {
  const i = haystack.indexOf(needle)
  if (i < 0) throw new Error(`toWebAuthnAuth: '${needle}' not found in clientDataJSON`)
  return i
}

export interface AssertionParts {
  authenticatorData: ArrayBuffer | Uint8Array | Hex
  clientDataJSON: ArrayBuffer | Uint8Array | string
  /** DER signature from `AuthenticatorAssertionResponse.signature`. */
  signature: ArrayBuffer | Uint8Array | Hex
}

/**
 * Turn a raw `navigator.credentials.get()` assertion into the `WebAuthnAuth`
 * tuple that `PasskeyAttester` / `WebAuthn.sol` expect.
 */
export function toWebAuthnAuth(parts: AssertionParts): WebAuthnAuth {
  const authenticatorData =
    typeof parts.authenticatorData === 'string'
      ? parts.authenticatorData
      : bytesToHex(
          parts.authenticatorData instanceof Uint8Array
            ? parts.authenticatorData
            : new Uint8Array(parts.authenticatorData)
        )

  const clientDataJSON =
    typeof parts.clientDataJSON === 'string'
      ? parts.clientDataJSON
      : new TextDecoder().decode(
          parts.clientDataJSON instanceof Uint8Array ? parts.clientDataJSON : new Uint8Array(parts.clientDataJSON)
        )

  const { r, s } = derSignatureToRS(parts.signature)

  return {
    authenticatorData,
    clientDataJSON,
    challengeIndex: BigInt(byteIndexOf(clientDataJSON, '"challenge":"')),
    typeIndex: BigInt(byteIndexOf(clientDataJSON, '"type":"')),
    r,
    s,
  }
}

/** Convenience: pull the assertion parts straight off a browser `PublicKeyCredential`. */
export function assertionFromCredential(credential: {
  response: {
    authenticatorData: ArrayBuffer
    clientDataJSON: ArrayBuffer
    signature: ArrayBuffer
  }
}): WebAuthnAuth {
  return toWebAuthnAuth({
    authenticatorData: credential.response.authenticatorData,
    clientDataJSON: credential.response.clientDataJSON,
    signature: credential.response.signature,
  })
}
