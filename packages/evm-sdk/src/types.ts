import type { Address, Hex, PublicClient, WalletClient } from 'viem'

/** A schema record, mirroring `contracts/evm` `Types.sol::Schema`. */
export interface Schema {
  authority: Address
  resolver: Address
  revocable: boolean
  definition: string
}

/** An attestation record, mirroring `Types.sol::Attestation`. */
export interface Attestation {
  uid: Hex
  schemaUID: Hex
  subject: Address
  attester: Address
  nonce: bigint
  time: bigint
  expirationTime: bigint
  revocationTime: bigint
  revoked: boolean
  data: Hex
}

/** Arguments for a direct attestation (`msg.sender` is the attester). */
export interface AttestArgs {
  schemaUID: Hex
  subject: Address
  data: Hex
  /** Unix seconds; 0 (default) = no expiry. */
  expirationTime?: bigint
}

/** A delegated attestation request — signed off-chain, relayed by anyone. */
export interface DelegatedAttestationRequest {
  schemaUID: Hex
  subject: Address
  attester: Address
  nonce: bigint
  deadline: bigint
  expirationTime: bigint
  data: Hex
  signature: Hex
}

export interface DelegatedRevocationRequest {
  attestationUID: Hex
  revoker: Address
  nonce: bigint
  deadline: bigint
  signature: Hex
}

/** The WebAuthn assertion shape consumed by `PasskeyAttester` / `WebAuthn.sol`. */
export interface WebAuthnAuth {
  authenticatorData: Hex
  clientDataJSON: string
  challengeIndex: bigint
  typeIndex: bigint
  r: Hex
  s: Hex
}

/** Deployed Signet contract addresses for one chain. */
export interface SignetAddresses {
  schemaRegistry: Address
  attestationRegistry: Address
  passkeyAttester?: Address
  personhoodResolver?: Address
  personhoodSchemaUID?: Hex
}

export interface SignetClientOptions {
  /** Known key in `DEPLOYMENTS` (e.g. `"monadTestnet"`), or pass `addresses` explicitly. */
  chain?: keyof typeof import('./deployments').DEPLOYMENTS
  addresses?: SignetAddresses
  /** viem clients. `publicClient` for reads; `walletClient` for writes / signing. */
  publicClient: PublicClient
  walletClient?: WalletClient
}
