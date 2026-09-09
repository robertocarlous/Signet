# @signetprotocol/evm-sdk

TypeScript SDK for **Signet** attestations on **Monad** (EVM). Thin wrapper over
[viem](https://viem.sh) that mirrors `@signetprotocol/stellar-sdk`'s surface:

- permissionless **schemas** + direct **attestations**
- **EIP-712 delegated** attest / revoke — sign off-chain, anyone relays, relayer pays gas
- **WebAuthn / P-256 passkey** proof-of-personhood

UID derivation, the EIP-712 domain/types, and the personhood challenge are byte-for-byte
identical to [`contracts/evm`](../../contracts/evm); the parity is covered by tests
that assert against live Monad-testnet values.

## Install

```bash
npm install @signetprotocol/evm-sdk viem
```

## Quick start

```ts
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SignetClient } from '@signetprotocol/evm-sdk'

const transport = http('https://rpc.ankr.com/monad_testnet')
const account = privateKeyToAccount('0x...')

const signet = new SignetClient({
  chain: 'monadTestnet', // bundles the deployed addresses
  publicClient: createPublicClient({ transport }),
  walletClient: createWalletClient({ account, transport }),
})

// 1. register a schema
const { uid: schemaUID } = await signet.registerSchema({
  definition: 'bool verified,string level',
  revocable: true,
})

// 2. attest
const { uid } = await signet.attest({
  schemaUID,
  subject: '0xSubject...',
  data: '0x01',
})

await signet.isValid(uid) // true
```

## Delegated (EIP-712)

```ts
// signer (offline)
const request = await signet.signDelegatedAttestation({
  schemaUID,
  subject: '0xSubject...',
  data: '0x01',
})

// relayer (elsewhere, pays gas)
const { uid } = await signet.submitDelegatedAttestation(request)
```

## Passkey proof-of-personhood

```ts
import { parseP256PublicKey, assertionFromCredential } from '@signetprotocol/evm-sdk'

// enrolment: read the passkey's public key once (from registration)
const { x, y } = parseP256PublicKey(attestationResponse.getPublicKey())

// challenge the passkey must sign
const challenge = signet.personhoodChallenge('0xSubject...', x, y)

// browser: navigator.credentials.get({ publicKey: { challenge: hexToBytes(challenge), ... } })
const auth = assertionFromCredential(assertion) // -> WebAuthnAuth

// relay it — verified on-chain via the RIP-7212 P-256 precompile
const { uid } = await signet.attestPersonhood({ subject: '0xSubject...', x, y, auth })
```

## Pure helpers (no network)

| function | mirrors |
|---|---|
| `computeSchemaUid` | `SignetUID.schemaUID` |
| `computeAttestationUid` | `SignetUID.attestationUID` |
| `computeDomainSeparator` | `SignetAttestationRegistry.DOMAIN_SEPARATOR()` |
| `hashAttest` / `hashRevoke` | `hashDelegatedAttestation` / `hashDelegatedRevocation` |
| `buildPersonhoodChallenge` | `PasskeyAttester.challenge` |
| `credentialId` | `keccak256(abi.encode(x, y))` |
| `derSignatureToRS` | DER ECDSA → low-s `(r, s)` |
| `toWebAuthnAuth` / `assertionFromCredential` | build the `WebAuthnAuth` tuple |

Addresses ship in `DEPLOYMENTS` (kept in sync with `contracts/evm/deployments.json`).

## Try it

- **Live playground:** [signet-personhood.vercel.app/sdk](https://signet-personhood.vercel.app/sdk) — run every helper in the browser and fire real transactions through a relayer.
- **Runnable example:**
  ```bash
  pnpm --filter @signetprotocol/evm-sdk example              # pure helpers only
  PRIVATE_KEY=0x... pnpm --filter @signetprotocol/evm-sdk example   # + live register / attest / delegate
  ```
- **Parity tests** (the correctness proof — pure functions vs live on-chain values):
  ```bash
  pnpm --filter @signetprotocol/evm-sdk test
  ```

## Publishing (maintainers)

```bash
npm login                       # to an account with access to the @signetprotocol scope
cd packages/evm-sdk
npm publish                      # runs prepublishOnly: clean + build + test; publishConfig.access = public
```

Consumers then just `npm install @signetprotocol/evm-sdk viem`.
