'use client'

import { type Address, type Hex, bytesToHex, getAddress, hexToBytes, keccak256, encodePacked } from 'viem'
import { parseP256PublicKey } from '@signetprotocol/evm-sdk'

const b64uEncode = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const b64uDecode = (s: string): ArrayBuffer => {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** Copy a typed array into a fresh, plain `ArrayBuffer` (satisfies DOM `BufferSource`). */
const ab = (u8: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(u8.byteLength)
  new Uint8Array(out).set(u8)
  return out
}

export interface StoredPasskey {
  credentialId: string // base64url
  x: string // hex
  y: string // hex
  createdAt: number
}

const STORAGE_KEY = 'signet.personhood.passkey'

export function loadPasskey(): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredPasskey) : null
  } catch {
    return null
  }
}
export function savePasskey(p: StoredPasskey) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* private mode — ignore */
  }
}
export function clearPasskey() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** A Signet identity address, deterministically derived from the passkey public key. */
export function identityAddress(x: bigint, y: bigint): Address {
  const h = keccak256(encodePacked(['uint256', 'uint256'], [x, y]))
  return getAddress(`0x${h.slice(-40)}`)
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
}

/** Register a new device passkey (ES256 / P-256 only) and return its public key. */
export async function createPasskey(rpId: string): Promise<StoredPasskey> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: ab(challenge),
      rp: { id: rpId, name: 'Signet' },
      user: { id: ab(userId), name: 'signet-personhood', displayName: 'Signet Personhood' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 (secp256r1) — required by the contract
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null

  if (!cred) throw new Error('passkey creation was cancelled')
  const response = cred.response as AuthenticatorAttestationResponse

  if (typeof response.getPublicKeyAlgorithm === 'function' && response.getPublicKeyAlgorithm() !== -7) {
    throw new Error('this authenticator did not produce a P-256 key')
  }
  const spki = response.getPublicKey?.()
  if (!spki) throw new Error('could not read the passkey public key on this browser')

  const { x, y } = parseP256PublicKey(spki)
  const stored: StoredPasskey = {
    credentialId: b64uEncode(cred.rawId),
    x: bytesToHex(numberToBytes32(x)),
    y: bytesToHex(numberToBytes32(y)),
    createdAt: Date.now(),
  }
  savePasskey(stored)
  return stored
}

export interface RawAssertion {
  authenticatorData: string // hex
  clientDataJSON: string // hex
  signature: string // hex
}

/** Ask the passkey to sign `challengeHex` (the Signet personhood challenge). */
export async function getAssertion(
  rpId: string,
  challengeHex: Hex,
  credentialIdB64: string,
): Promise<RawAssertion> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: ab(hexToBytes(challengeHex)),
      rpId,
      allowCredentials: [{ type: 'public-key', id: b64uDecode(credentialIdB64) }],
      userVerification: 'preferred',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw new Error('passkey signature was cancelled')
  const r = assertion.response as AuthenticatorAssertionResponse
  return {
    authenticatorData: bytesToHex(new Uint8Array(r.authenticatorData)),
    clientDataJSON: bytesToHex(new Uint8Array(r.clientDataJSON)),
    signature: bytesToHex(new Uint8Array(r.signature)),
  }
}

function numberToBytes32(n: bigint): Uint8Array {
  const out = new Uint8Array(32)
  let v = n
  for (let i = 31; i >= 0 && v > 0n; i--) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}
