import { type Address, type Hex, encodeAbiParameters, encodePacked, keccak256, stringToHex } from 'viem'

/** Domain-separation tags — must match `contracts/evm/src/lib/SignetUID.sol`. */
export const SCHEMA_UID_DOMAIN = keccak256(stringToHex('SIGNET_SCHEMA_UID_V1'))
export const ATTEST_UID_DOMAIN = keccak256(stringToHex('SIGNET_ATTEST_UID_V1'))

export interface SchemaUidInput {
  definition: string
  authority: Address
  resolver: Address
  revocable: boolean
}

/**
 * Reproduce `SignetUID.schemaUID`:
 * `keccak256(abi.encode(SCHEMA_DOMAIN, keccak256(bytes(definition)), authority, resolver, revocable))`
 */
export function computeSchemaUid({ definition, authority, resolver, revocable }: SchemaUidInput): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'address' }, { type: 'address' }, { type: 'bool' }],
      [SCHEMA_UID_DOMAIN, keccak256(stringToHex(definition)), authority, resolver, revocable]
    )
  )
}

export interface AttestationUidInput {
  registry: Address
  schemaUID: Hex
  subject: Address
  attester: Address
  nonce: bigint
}

/**
 * Reproduce `SignetUID.attestationUID`:
 * `keccak256(abi.encodePacked(ATTEST_DOMAIN, registry, schemaUID, subject, attester, nonce))`
 */
export function computeAttestationUid({ registry, schemaUID, subject, attester, nonce }: AttestationUidInput): Hex {
  return keccak256(
    encodePacked(
      ['bytes32', 'address', 'bytes32', 'address', 'address', 'uint64'],
      [ATTEST_UID_DOMAIN, registry, schemaUID, subject, attester, nonce]
    )
  )
}
