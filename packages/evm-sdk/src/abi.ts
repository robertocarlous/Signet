/** Minimal ABIs for the Signet EVM contracts — only what the SDK calls. */

export const schemaRegistryAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'definition', type: 'string' },
      { name: 'resolver', type: 'address' },
      { name: 'revocable', type: 'bool' },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getSchema',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [
      {
        name: 'schema',
        type: 'tuple',
        components: [
          { name: 'authority', type: 'address' },
          { name: 'resolver', type: 'address' },
          { name: 'revocable', type: 'bool' },
          { name: 'definition', type: 'string' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'event',
    name: 'SchemaRegistered',
    inputs: [
      { name: 'uid', type: 'bytes32', indexed: true },
      { name: 'authority', type: 'address', indexed: true },
      { name: 'resolver', type: 'address', indexed: false },
      { name: 'revocable', type: 'bool', indexed: false },
      { name: 'definition', type: 'string', indexed: false },
    ],
  },
] as const

const attestationTuple = {
  name: 'attestation',
  type: 'tuple',
  components: [
    { name: 'uid', type: 'bytes32' },
    { name: 'schemaUID', type: 'bytes32' },
    { name: 'subject', type: 'address' },
    { name: 'attester', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'time', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'revocationTime', type: 'uint64' },
    { name: 'revoked', type: 'bool' },
    { name: 'data', type: 'bytes' },
  ],
} as const

const delegatedAttestationRequest = {
  name: 'request',
  type: 'tuple',
  components: [
    { name: 'schemaUID', type: 'bytes32' },
    { name: 'subject', type: 'address' },
    { name: 'attester', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'data', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
  ],
} as const

const delegatedRevocationRequest = {
  name: 'request',
  type: 'tuple',
  components: [
    { name: 'attestationUID', type: 'bytes32' },
    { name: 'revoker', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint64' },
    { name: 'signature', type: 'bytes' },
  ],
} as const

export const attestationRegistryAbi = [
  {
    type: 'function',
    name: 'attest',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [
          { name: 'schemaUID', type: 'bytes32' },
          { name: 'subject', type: 'address' },
          { name: 'expirationTime', type: 'uint64' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'revoke',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'request',
        type: 'tuple',
        components: [{ name: 'attestationUID', type: 'bytes32' }],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'attestByDelegation',
    stateMutability: 'nonpayable',
    inputs: [delegatedAttestationRequest],
    outputs: [{ name: 'uid', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'revokeByDelegation',
    stateMutability: 'nonpayable',
    inputs: [delegatedRevocationRequest],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getAttestation',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [attestationTuple],
  },
  {
    type: 'function',
    name: 'isAttested',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isValid',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getNonce',
    stateMutability: 'view',
    inputs: [{ name: 'attester', type: 'address' }],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'getRevocationNonce',
    stateMutability: 'view',
    inputs: [{ name: 'revoker', type: 'address' }],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'Attested',
    inputs: [
      { name: 'uid', type: 'bytes32', indexed: true },
      { name: 'schemaUID', type: 'bytes32', indexed: true },
      { name: 'subject', type: 'address', indexed: true },
      { name: 'attester', type: 'address', indexed: false },
      { name: 'nonce', type: 'uint64', indexed: false },
      { name: 'time', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Revoked',
    inputs: [
      { name: 'uid', type: 'bytes32', indexed: true },
      { name: 'schemaUID', type: 'bytes32', indexed: true },
      { name: 'subject', type: 'address', indexed: true },
      { name: 'attester', type: 'address', indexed: false },
      { name: 'revocationTime', type: 'uint64', indexed: false },
    ],
  },
] as const

export const passkeyAttesterAbi = [
  {
    type: 'function',
    name: 'attestPersonhood',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'subject', type: 'address' },
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
      {
        name: 'auth',
        type: 'tuple',
        components: [
          { name: 'authenticatorData', type: 'bytes' },
          { name: 'clientDataJSON', type: 'string' },
          { name: 'challengeIndex', type: 'uint256' },
          { name: 'typeIndex', type: 'uint256' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
    ],
    outputs: [{ name: 'uid', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'challenge',
    stateMutability: 'view',
    inputs: [
      { name: 'subject', type: 'address' },
      { name: 'x', type: 'uint256' },
      { name: 'y', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'personhoodOf',
    stateMutability: 'view',
    inputs: [{ name: 'subject', type: 'address' }],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'passkeyEnrolled',
    stateMutability: 'view',
    inputs: [{ name: 'credentialId', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'personhoodSchema',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'PersonhoodAttested',
    inputs: [
      { name: 'subject', type: 'address', indexed: true },
      { name: 'attestationUID', type: 'bytes32', indexed: true },
      { name: 'credentialId', type: 'bytes32', indexed: true },
    ],
  },
] as const
