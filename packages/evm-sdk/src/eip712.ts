import {
  type Address,
  type Hex,
  type TypedDataDomain,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  stringToHex,
} from 'viem'
import type { DelegatedAttestationRequest, DelegatedRevocationRequest } from './types'

/** Matches `EIP712("Signet", "1")` in `SignetAttestationRegistry`. */
export const EIP712_NAME = 'Signet'
export const EIP712_VERSION = '1'

export const ATTEST_TYPES = {
  Attest: [
    { name: 'schemaUID', type: 'bytes32' },
    { name: 'subject', type: 'address' },
    { name: 'attester', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'data', type: 'bytes' },
  ],
} as const

export const REVOKE_TYPES = {
  Revoke: [
    { name: 'attestationUID', type: 'bytes32' },
    { name: 'revoker', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
  ],
} as const

/** keccak256 of the ABI type strings — must match `SignetEIP712.sol` constants. */
export const ATTEST_TYPEHASH = keccak256(
  stringToHex(
    'Attest(bytes32 schemaUID,address subject,address attester,uint64 nonce,uint64 deadline,uint64 expirationTime,bytes data)'
  )
)
export const REVOKE_TYPEHASH = keccak256(
  stringToHex('Revoke(bytes32 attestationUID,address revoker,uint64 nonce,uint64 deadline)')
)

const DOMAIN_TYPEHASH = keccak256(
  stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
)

export function signetDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract }
}

/**
 * Compute the EIP-712 domain separator the same way `SignetAttestationRegistry.DOMAIN_SEPARATOR()`
 * returns it — useful for verifying a deployment.
 */
export function computeDomainSeparator(chainId: number, verifyingContract: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [
        DOMAIN_TYPEHASH,
        keccak256(stringToHex(EIP712_NAME)),
        keccak256(stringToHex(EIP712_VERSION)),
        BigInt(chainId),
        verifyingContract,
      ]
    )
  )
}

type UnsignedAttest = Omit<DelegatedAttestationRequest, 'signature'>
type UnsignedRevoke = Omit<DelegatedRevocationRequest, 'signature'>

/** `signTypedData` params for a delegated attestation. */
export function attestTypedData(chainId: number, verifyingContract: Address, request: UnsignedAttest) {
  return {
    domain: signetDomain(chainId, verifyingContract),
    types: ATTEST_TYPES,
    primaryType: 'Attest' as const,
    message: {
      schemaUID: request.schemaUID,
      subject: request.subject,
      attester: request.attester,
      nonce: request.nonce,
      deadline: request.deadline,
      expirationTime: request.expirationTime,
      data: request.data,
    },
  }
}

export function revokeTypedData(chainId: number, verifyingContract: Address, request: UnsignedRevoke) {
  return {
    domain: signetDomain(chainId, verifyingContract),
    types: REVOKE_TYPES,
    primaryType: 'Revoke' as const,
    message: {
      attestationUID: request.attestationUID,
      revoker: request.revoker,
      nonce: request.nonce,
      deadline: request.deadline,
    },
  }
}

/** The digest a signer produces — mirrors `hashDelegatedAttestation` on chain. */
export function hashAttest(chainId: number, verifyingContract: Address, request: UnsignedAttest): Hex {
  return hashTypedData(attestTypedData(chainId, verifyingContract, request))
}

export function hashRevoke(chainId: number, verifyingContract: Address, request: UnsignedRevoke): Hex {
  return hashTypedData(revokeTypedData(chainId, verifyingContract, request))
}

// ----------------------------------------------------------------------
// PasskeyAttester's own EIP-712 domain — used only for guardian recovery
// approvals. Distinct from the `Signet` domain above: `verifyingContract`
// here is the PasskeyAttester address, not the AttestationRegistry.
// ----------------------------------------------------------------------

/** Matches `EIP712("SignetPasskeyAttester", "1")` in `PasskeyAttester`. */
export const PASSKEY_EIP712_NAME = 'SignetPasskeyAttester'
export const PASSKEY_EIP712_VERSION = '1'

export const RECOVER_TYPES = {
  Recover: [
    { name: 'subject', type: 'address' },
    { name: 'newX', type: 'uint256' },
    { name: 'newY', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
  ],
} as const

/** keccak256 of the ABI type string — must match `PasskeyAttester.RECOVER_TYPEHASH`. */
export const RECOVER_TYPEHASH = keccak256(
  stringToHex('Recover(address subject,uint256 newX,uint256 newY,uint256 nonce,uint64 deadline)')
)

export function passkeyAttesterDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: PASSKEY_EIP712_NAME, version: PASSKEY_EIP712_VERSION, chainId, verifyingContract }
}

/**
 * Compute the EIP-712 domain separator the same way `PasskeyAttester.DOMAIN_SEPARATOR()`
 * returns it — useful for verifying a deployment.
 */
export function computePasskeyDomainSeparator(chainId: number, verifyingContract: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [
        DOMAIN_TYPEHASH,
        keccak256(stringToHex(PASSKEY_EIP712_NAME)),
        keccak256(stringToHex(PASSKEY_EIP712_VERSION)),
        BigInt(chainId),
        verifyingContract,
      ]
    )
  )
}

export interface RecoverMessage {
  subject: Address
  /** The *new* device's P-256 public key. */
  newX: bigint
  newY: bigint
  nonce: bigint
  deadline: bigint
}

/** `signTypedData` params for a guardian's recovery approval. */
export function recoverTypedData(chainId: number, verifyingContract: Address, message: RecoverMessage) {
  return {
    domain: passkeyAttesterDomain(chainId, verifyingContract),
    types: RECOVER_TYPES,
    primaryType: 'Recover' as const,
    message,
  }
}

/** The digest a guardian signs — mirrors `PasskeyAttester.recoveryDigest`. */
export function hashRecover(chainId: number, verifyingContract: Address, message: RecoverMessage): Hex {
  return hashTypedData(recoverTypedData(chainId, verifyingContract, message))
}
