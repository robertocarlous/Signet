# @signetprotocol/evm-sdk

TypeScript SDK for **Signet** attestations on **Monad** (EVM). It's a thin wrapper over
[viem](https://viem.sh) — if you've used viem before, this will feel familiar; if you
haven't, the [Quick start](#quick-start) below walks through every piece.

## What this SDK does

Signet lets any app write a signed, on-chain claim ("attestation") about an address, and
lets any other app read and trust it — no API key, no central server. This SDK gives you
three things:

- permissionless **schemas** + direct **attestations**
- **EIP-712 delegated** attest / revoke — sign off-chain, anyone relays, relayer pays gas
- **WebAuthn / P-256 passkey** proof-of-personhood

UID derivation, the EIP-712 domain/types, and the personhood challenge are byte-for-byte
identical to [`contracts/evm`](../../contracts/evm); the parity is covered by tests
that assert against live Monad-testnet values.

## Concepts, in plain language

You only need four terms to use this SDK:

| Term | What it means |
|---|---|
| **Schema** | The shape of a claim, e.g. `"bool verified,string level"`. Anyone can register one; whoever registers it becomes its `authority`. Registering returns a `schemaUID` — a deterministic ID for that schema. |
| **Attestation** | One instance of a claim: "using schema X, I (the `attester`) am claiming this about `subject`." Attesting returns an `uid` for that specific claim. |
| **Subject** | The address the claim is *about*. It does not need to sign anything or be online. |
| **Resolver** | An optional contract a schema can point at to add rules (fees, allowlists, "one claim per address," etc.). Most quick-start use doesn't need one. |

Everything else in this README is one of: **register a schema**, **write an attestation**
(three ways), or **read/revoke an attestation**.

## Prerequisites

- Node.js 18+
- A wallet with testnet **MON** to pay gas — get some free from the
  [Monad faucet](https://faucet.monad.xyz)
- An RPC endpoint for Monad testnet (the examples below use a public one; swap in your own
  for production)

## Install

```bash
npm install @signetprotocol/evm-sdk viem
```

## Quick start

This walks through registering a schema and writing your first attestation, step by step.

**1. Set up viem clients.** `publicClient` reads chain state; `walletClient` signs and sends
transactions. `SignetClient` wraps both and already knows the deployed contract addresses
for `chain: 'monadTestnet'`.

```ts
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SignetClient } from '@signetprotocol/evm-sdk'

const transport = http('https://rpc.ankr.com/monad_testnet')
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)

const signet = new SignetClient({
  chain: 'monadTestnet', // bundles the deployed contract addresses — see DEPLOYMENTS
  publicClient: createPublicClient({ transport }),
  walletClient: createWalletClient({ account, transport }),
})
```

> Make sure `account` holds testnet MON (step above) — every write below is a transaction
> and will revert with an "insufficient funds" error otherwise.

**2. Register a schema.** This is a one-time setup step per claim type — reuse the returned
`schemaUID` for every attestation of that kind.

```ts
const { uid: schemaUID } = await signet.registerSchema({
  definition: 'bool verified,string level',
  revocable: true,
})
```

**3. Encode your claim data to match the schema.** The `data` you attest with must be ABI-encoded
in the same order/types as the schema definition — viem's `encodeAbiParameters` does this:

```ts
import { encodeAbiParameters } from 'viem'

const data = encodeAbiParameters(
  [{ type: 'bool' }, { type: 'string' }],
  [true, 'premium'],
)
```

**4. Attest.** `subject` is the address the claim is about — it can be any address, including
one that has never touched the chain.

```ts
const { uid } = await signet.attest({
  schemaUID,
  subject: '0xSubject...',
  data,
})
```

**5. Read it back.**

```ts
await signet.isValid(uid)        // true — not revoked, not expired
await signet.getAttestation(uid) // { schemaUID, subject, attester, data, time, ... }
```

That's the whole loop: register once, attest as many times as you need, read from anywhere
(reads don't need a `walletClient` or gas at all).

## Three ways to write an attestation

Pick based on who pays gas and whether the attester needs to be online:

| Method | Who pays gas | Attester needs to be online? | Use when |
|---|---|---|---|
| `attest()` | The attester (`msg.sender`) | Yes | Simplest case — you control the wallet that's live and funded. |
| `signDelegatedAttestation()` + `submitDelegatedAttestation()` | Whoever relays it | No — signs offline once | The attester shouldn't need gas or a live connection (e.g. signs from a backend, a relayer submits later). |
| `attestPersonhood()` | Whoever relays it | No — a passkey signs | Proving a real device/human holder via WebAuthn, no wallet or seed phrase involved. |

### Delegated (EIP-712)

```ts
// signer (offline, no gas)
const request = await signet.signDelegatedAttestation({
  schemaUID,
  subject: '0xSubject...',
  data: '0x01',
})

// relayer (elsewhere, pays gas) — `request` is a plain JSON-serializable object,
// so you can POST it from the signer to a relayer service
const { uid } = await signet.submitDelegatedAttestation(request)
```

Nonce and deadline are filled in for you unless you pass your own.

### Passkey proof-of-personhood

```ts
import { parseP256PublicKey, assertionFromCredential } from '@signetprotocol/evm-sdk'

// enrolment: read the passkey's public key once (from WebAuthn registration)
const { x, y } = parseP256PublicKey(attestationResponse.getPublicKey())

// challenge the passkey must sign
const challenge = signet.personhoodChallenge('0xSubject...', x, y)

// browser: navigator.credentials.get({ publicKey: { challenge: hexToBytes(challenge), ... } })
const auth = assertionFromCredential(assertion) // -> WebAuthnAuth

// relay it — verified on-chain via the RIP-7212 P-256 precompile, no gas from the passkey holder
const { uid } = await signet.attestPersonhood({ subject: '0xSubject...', x, y, auth })
```

## Revoke

```ts
await signet.revoke(uid) // msg.sender must be the attester; the schema must be revocable
```

## Troubleshooting

| Error | Likely cause |
|---|---|
| `insufficient funds for gas` | The `account` behind your `walletClient` has no MON. Fund it from the [faucet](https://faucet.monad.xyz). |
| `SignetClient: a walletClient is required for writes` | You called a write method (`attest`, `registerSchema`, ...) on a client built with only a `publicClient`. Add a `walletClient`. |
| `SignetClient: unknown chain "..."` | The `chain` option doesn't match a key in `DEPLOYMENTS` (currently just `monadTestnet`). Check for typos, or pass `addresses` directly for a custom deployment. |
| Transaction reverts with no clear reason | If the schema has a `resolver`, its `onAttest` hook can reject the attestation (e.g. a fee wasn't paid, an allowlist check failed). Check the resolver contract's conditions. |
| Delegated attestation rejected as expired | `deadline` defaults to "never," but if you pass your own, make sure it's a future Unix timestamp. |

## Pure helpers (no network)

These are plain functions — no client, no RPC call — useful for computing IDs or hashes
locally, e.g. to check a UID before submitting a transaction.

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
