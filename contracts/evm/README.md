# Signet — EVM contracts (Monad)

Solidity port of the Signet attestation protocol, targeting **Monad**. The data
model, UID derivation, error set, and events mirror the Soroban implementation in
[`contracts/stellar/protocol`](../stellar/protocol) so the SDK, indexer, and docs
stay chain-agnostic.

> **Status: M3 complete.** Schema registry, direct + EIP-712 delegated
> attest/revoke, resolver dispatch, views, a WebAuthn/P-256 passkey
> proof-of-personhood layer, **and opt-in social recovery for a lost or
> compromised passkey** — implemented, tested (49 forge tests), and live
> on Monad testnet.

## Live — Monad testnet (chain 10143)

| Contract | Address |
|---|---|
| `SignetSchemaRegistry` | [`0x2eb183fFd7D40866DEA68f2173C4C5a604D22602`](https://testnet.monadscan.com/address/0x2eb183fFd7D40866DEA68f2173C4C5a604D22602) |
| `SignetAttestationRegistry` | [`0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C`](https://testnet.monadscan.com/address/0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C) |
| `PasskeyAttester` | [`0xfFBCd844DA4F5CaBBa36f60e4f17cEfe00029c8A`](https://testnet.monadscan.com/address/0xfFBCd844DA4F5CaBBa36f60e4f17cEfe00029c8A) |
| `PersonhoodResolver` | [`0x9eF15a8383a3564b62FbA13759B3C5c5C6c8FBBD`](https://testnet.monadscan.com/address/0x9eF15a8383a3564b62FbA13759B3C5c5C6c8FBBD) |

Personhood schema UID: `0x6171b49bd97f67cab946cc7fe562c49faeb093fdd30ad438f7358b85849a26b6`.
Canonical machine-readable copy: [`deployments.json`](./deployments.json) — including the
superseded M2 `PasskeyAttester`/`PersonhoodResolver` (still live, still valid, just without
guardians — see `supersededPasskeyPersonhood`).
Source verification on MonadScan is pending an API key (`forge script … --verify`).

**Verified live** on chain 10143:
- direct register + self-attestation of a schema
- an **EIP-712 delegated attestation** ([`0xee633951…`](https://testnet.monadscan.com/tx/0xee633951031ea8ef7aa74972ef0c377dab88f0cc2e243f112d82a231d75e972d)) relayed by a third party
- a **passkey proof-of-personhood**: a WebAuthn assertion verified on-chain via the
  **native RIP-7212 P-256 precompile** (confirmed present at `0x100`), producing
  attestation `0xcb9642f3…44005f6` whose `attester` is the current `PasskeyAttester`.

## M2 — passkey proof-of-personhood

```
device passkey ──WebAuthn assertion──▶ PasskeyAttester.attestPersonhood(subject, x, y, auth)
                                          │  WebAuthn.verify  → P256.verify (RIP-7212 @ 0x100)
                                          │  one enrolment per credential, one attestation per subject
                                          ▼
                                       SignetAttestationRegistry.attest(...)   (attester = PasskeyAttester)
                                          │  PersonhoodResolver: reverts unless attester == PasskeyAttester
                                          ▼
                                       personhood attestation, data = abi.encode(pubKeyX, pubKeyY)
```

- **No seed phrase.** The person proves control of a device passkey; anyone
  relays the tx and pays gas. `subject` can be any address (an EOA, a smart
  account, whatever the app assigns).
- **Not capturable.** `PasskeyAttester` / `PersonhoodResolver` are immutable and
  admin-less; the schema is permissionless to read and reference.
- `challenge(subject, x, y)` returns the exact bytes the passkey must sign
  (`SIGNET_PERSONHOOD_V1 ‖ chainId ‖ attester ‖ subject ‖ x ‖ y`).
- Deploy wires resolver ↔ attester with `vm.computeCreateAddress` — no setters.

## M3 — social recovery (guardians)

`PasskeyAttester` has no admin and no upgrade path — great for "not capturable," bad if the
one passkey behind an identity is ever lost or stolen, with nothing to fall back on. M3 adds
an opt-in escape hatch: name guardians while you still hold the passkey; enough of them can
later approve swapping in a new one.

```
while the passkey is live:
  subject's passkey ──sign setGuardiansChallenge──▶ PasskeyAttester.setGuardians(subject, guardians[], threshold, auth)

device lost — recovery:
  guardians (their own wallets) ──EIP-712 sign recoveryDigest──▶ threshold signatures collected off-chain
  new device's passkey          ──sign recoveryChallenge──────▶ proves it actually holds the new key
                                                                 ▼
                                        PasskeyAttester.recoverPersonhood(subject, newX, newY, deadline, guardianSigs[], newAuth)
                                          │  revokes the old attestation, mints a fresh one — same subject, new key
                                          ▼
                                        personhood attestation persists under the same identity
```

- **Guardians vouch for the person; they can't pick the key.** Recovery needs both `threshold`
  guardian approvals *and* an independent WebAuthn proof from the new device — collusion among
  guardians alone can't bind an identity to a key nobody's device produced.
- **Guardians are set with the live passkey, not after the fact.** `setGuardians` requires the
  *current* passkey to sign — only someone who still holds their device decides who gets to
  vouch for them later. Callable any time post-enrolment to set up, or rotate, guardians.
- At least 2 guardians, and `threshold` is enforced between 2 and `guardians.length`.
- Still no admin: nobody but a subject's own chosen guardians can ever trigger a recovery for
  them, and a subject who never called `setGuardians` has no recovery path at all (matches the
  original M2 behaviour exactly).
- `PasskeyAttester` deploys its own EIP-712 domain (`"SignetPasskeyAttester"`, separate from
  `SignetAttestationRegistry`'s `"Signet"` domain) purely for guardian recovery signatures.

## Layout

```
src/
  interfaces/        ISchemaRegistry, IAttestationRegistry, IResolver
  lib/               Types (structs), Errors, SignetUID (id derivation),
                     SignetEIP712 (delegated typed data), WebAuthn (P-256 assertion)
  SignetSchemaRegistry.sol       permissionless schema registry
  SignetAttestationRegistry.sol  core attest/revoke engine (direct + delegated)
  PasskeyAttester.sol            WebAuthn passkey -> personhood attestation, + guardian recovery
  resolvers/
    SchemaResolver.sol       abstract base for policy resolvers
    SampleResolver.sol       reference allowlist resolver
    PersonhoodResolver.sol   locks the personhood schema to PasskeyAttester
script/  Deploy.s.sol (core), DeployPersonhood.s.sol (M2), SmokePersonhood.s.sol
test/    SchemaRegistry, AttestationRegistry, Delegation, WebAuthn, PasskeyAttester
```

## Develop

```bash
forge install          # vendors forge-std + openzeppelin-contracts into lib/ (gitignored)
forge build
forge test
forge fmt
```

## EIP-712 delegated attestation

Domain `{ name: "Signet", version: "1", chainId, verifyingContract }`. An
attester signs one of:

```
Attest(bytes32 schemaUID,address subject,address attester,uint64 nonce,uint64 deadline,uint64 expirationTime,bytes data)
Revoke(bytes32 attestationUID,address revoker,uint64 nonce,uint64 deadline)
```

then anyone submits `attestByDelegation` / `revokeByDelegation` (relayer pays
gas). `nonce` must equal `getNonce(attester)` / `getRevocationNonce(revoker)`;
`deadline` bounds signature validity. `hashDelegatedAttestation(...)` /
`hashDelegatedRevocation(...)` / `DOMAIN_SEPARATOR()` are exposed for signers.

## Deploy to Monad testnet

```bash
cp .env.example .env   # set PRIVATE_KEY + RPC
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast --verify
```

## Design notes

- **No admin / no upgrades.** The protocol layer is immutable; all policy
  (fees, gating, personhood rules) lives in per-schema resolver contracts.
- **Multi-attestation.** `(schemaUID, subject)` can hold many attestations,
  disambiguated by a per-attester `nonce`; the global `uid` is
  `keccak256(SIGNET_ATTEST_UID_V1 ‖ registry ‖ schemaUID ‖ subject ‖ attester ‖ nonce)`.
- **Divergence from Stellar.** `value` is `bytes` (schema-encoded) rather than a
  Soroban `String`; delegated auth is EIP-712 ECDSA rather than BLS12-381.
- **Resolver safety.** `onAttest` / `onRevoke` are critical gates — a `false`
  return or a revert blocks the operation. `onResolve` is best-effort.
