# Signet — EVM contracts (Monad)

Solidity port of the Signet attestation protocol, targeting **Monad**. The data
model, UID derivation, error set, and events mirror the Soroban implementation in
[`contracts/stellar/protocol`](../stellar/protocol) so the SDK, indexer, and docs
stay chain-agnostic.

> **Status: M2 complete.** Schema registry, direct + EIP-712 delegated
> attest/revoke, resolver dispatch, views, **and a WebAuthn/P-256 passkey
> proof-of-personhood layer** — implemented, tested (35 forge tests), and live
> on Monad testnet.

## Live — Monad testnet (chain 10143)

| Contract | Address |
|---|---|
| `SignetSchemaRegistry` | [`0x2eb183fFd7D40866DEA68f2173C4C5a604D22602`](https://testnet.monadscan.com/address/0x2eb183fFd7D40866DEA68f2173C4C5a604D22602) |
| `SignetAttestationRegistry` | [`0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C`](https://testnet.monadscan.com/address/0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C) |
| `PasskeyAttester` | [`0x5A99835d5E7434BBf3e44Cc6A3E76b762045c48d`](https://testnet.monadscan.com/address/0x5A99835d5E7434BBf3e44Cc6A3E76b762045c48d) |
| `PersonhoodResolver` | [`0xcf5b29668EB4Ea1dC51BA596c41bb2E722425100`](https://testnet.monadscan.com/address/0xcf5b29668EB4Ea1dC51BA596c41bb2E722425100) |

Personhood schema UID: `0x6e29449805b2f822cdbaea9ca4bbc8758addb90d9ac2206e6d6156a51cac74e4`.
Canonical machine-readable copy: [`deployments.json`](./deployments.json).
Source verification on MonadScan is pending an API key (`forge script … --verify`).

**Verified live** on chain 10143:
- direct register + self-attestation of a schema
- an **EIP-712 delegated attestation** ([`0xee633951…`](https://testnet.monadscan.com/tx/0xee633951031ea8ef7aa74972ef0c377dab88f0cc2e243f112d82a231d75e972d)) relayed by a third party
- a **passkey proof-of-personhood**: a WebAuthn assertion verified on-chain via the
  **native RIP-7212 P-256 precompile** (confirmed present at `0x100`), producing
  attestation `0xc659ddad…bd9e827a` whose `attester` is the `PasskeyAttester`.

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

## Layout

```
src/
  interfaces/        ISchemaRegistry, IAttestationRegistry, IResolver
  lib/               Types (structs), Errors, SignetUID (id derivation),
                     SignetEIP712 (delegated typed data), WebAuthn (P-256 assertion)
  SignetSchemaRegistry.sol       permissionless schema registry
  SignetAttestationRegistry.sol  core attest/revoke engine (direct + delegated)
  PasskeyAttester.sol            WebAuthn passkey -> personhood attestation
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
