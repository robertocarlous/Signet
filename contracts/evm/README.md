# Signet — EVM contracts (Monad)

Solidity port of the Signet attestation protocol, targeting **Monad**. The data
model, UID derivation, error set, and events mirror the Soroban implementation in
[`contracts/stellar/protocol`](../stellar/protocol) so the SDK, indexer, and docs
stay chain-agnostic.

> **Status: M1 scaffold.** Schema registry, direct attest/revoke, resolver
> dispatch, and views are implemented. Delegated (EIP-712) attest/revoke are
> stubbed (`TODO`). The WebAuthn/P256 passkey authorization layer lands in M2.

## Live — Monad testnet (chain 10143)

| Contract | Address |
|---|---|
| `SignetSchemaRegistry` | [`0x2eb183fFd7D40866DEA68f2173C4C5a604D22602`](https://testnet.monadscan.com/address/0x2eb183fFd7D40866DEA68f2173C4C5a604D22602) |
| `SignetAttestationRegistry` | [`0x094f1d15d70AfA37ee157965274bB30b6aBFCa29`](https://testnet.monadscan.com/address/0x094f1d15d70AfA37ee157965274bB30b6aBFCa29) |

Canonical machine-readable copy: [`deployments.json`](./deployments.json).
Source verification on MonadScan is pending an API key (`forge script … --verify`).

**Verified live end-to-end** — a `proof-of-personhood` schema
(`0xb17ffe44…856a88c2`) was registered and a self-attestation
(`0xe926e6e2…027d92e6`) created and read back as valid on chain 10143.

## Layout

```
src/
  interfaces/        ISchemaRegistry, IAttestationRegistry, IResolver
  lib/               Types (structs), Errors, SignetUID (id derivation)
  SignetSchemaRegistry.sol       permissionless schema registry
  SignetAttestationRegistry.sol  core attest/revoke engine
  resolvers/
    SchemaResolver.sol   abstract base for policy resolvers
    SampleResolver.sol   reference allowlist resolver
script/Deploy.s.sol    deploys the core pair
test/                  forge tests
```

## Develop

```bash
forge install          # vendors forge-std into lib/ (gitignored)
forge build
forge test
forge fmt
```

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
