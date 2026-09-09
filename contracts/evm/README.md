# Signet — EVM contracts (Monad)

Solidity port of the Signet attestation protocol, targeting **Monad**. The data
model, UID derivation, error set, and events mirror the Soroban implementation in
[`contracts/stellar/protocol`](../stellar/protocol) so the SDK, indexer, and docs
stay chain-agnostic.

> **Status: M1 complete.** Schema registry, direct + EIP-712 delegated
> attest/revoke, resolver dispatch, and views are implemented and tested
> (21 forge tests). The WebAuthn/P256 passkey authorization layer is M2.

## Live — Monad testnet (chain 10143)

| Contract | Address |
|---|---|
| `SignetSchemaRegistry` | [`0x2eb183fFd7D40866DEA68f2173C4C5a604D22602`](https://testnet.monadscan.com/address/0x2eb183fFd7D40866DEA68f2173C4C5a604D22602) |
| `SignetAttestationRegistry` | [`0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C`](https://testnet.monadscan.com/address/0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C) |

Canonical machine-readable copy: [`deployments.json`](./deployments.json).
Source verification on MonadScan is pending an API key (`forge script … --verify`).

**Verified live** — a `proof-of-personhood` schema (`0xb17ffe44…856a88c2`) was
registered, a direct self-attestation created, and an **EIP-712 delegated
attestation** ([`0xee633951…d75e972d`](https://testnet.monadscan.com/tx/0xee633951031ea8ef7aa74972ef0c377dab88f0cc2e243f112d82a231d75e972d))
relayed — all on chain 10143.

## Layout

```
src/
  interfaces/        ISchemaRegistry, IAttestationRegistry, IResolver
  lib/               Types (structs), Errors, SignetUID (id derivation),
                     SignetEIP712 (delegated-attest/revoke typed data)
  SignetSchemaRegistry.sol       permissionless schema registry
  SignetAttestationRegistry.sol  core attest/revoke engine (direct + delegated)
  resolvers/
    SchemaResolver.sol   abstract base for policy resolvers
    SampleResolver.sol   reference allowlist resolver
script/Deploy.s.sol    deploys the core pair
test/                  forge tests (SchemaRegistry, AttestationRegistry, Delegation)
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
