/**
 * @signetprotocol/evm-sdk
 *
 * TypeScript SDK for Signet attestations on Monad (EVM):
 *  - permissionless schemas + direct attestations
 *  - EIP-712 delegated attest / revoke (relayer pays gas)
 *  - WebAuthn / P-256 passkey proof-of-personhood
 *
 * Byte layouts for UIDs, the EIP-712 domain/types, and the personhood challenge
 * are kept identical to `contracts/evm`.
 */

export { SignetClient, type WriteResult } from './client'

export * from './types'

export {
  DEPLOYMENTS,
  getDeployment,
  MONAD_TESTNET,
  MONAD_TESTNET_CHAIN_ID,
  ZERO_ADDRESS,
  ZERO_BYTES32,
  type DeploymentKey,
} from './deployments'

export {
  computeSchemaUid,
  computeAttestationUid,
  SCHEMA_UID_DOMAIN,
  ATTEST_UID_DOMAIN,
  type SchemaUidInput,
  type AttestationUidInput,
} from './uid'

export {
  ATTEST_TYPES,
  REVOKE_TYPES,
  ATTEST_TYPEHASH,
  REVOKE_TYPEHASH,
  EIP712_NAME,
  EIP712_VERSION,
  signetDomain,
  computeDomainSeparator,
  attestTypedData,
  revokeTypedData,
  hashAttest,
  hashRevoke,
} from './eip712'

export {
  PERSONHOOD_CHALLENGE_DOMAIN,
  buildPersonhoodChallenge,
  credentialId,
  parseP256PublicKey,
  derSignatureToRS,
  toWebAuthnAuth,
  assertionFromCredential,
  type PersonhoodChallengeInput,
  type AssertionParts,
} from './webauthn'
