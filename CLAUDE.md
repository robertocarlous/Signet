# CLAUDE.md

Guide for working with this repository.

## Project

Signet is a permissionless attestation protocol: anyone registers a schema, anyone issues
cryptographically-verifiable claims ("attestations") about a subject, and any application can read
and trust them with no API key and no middleman. Built for the Monad Trust, Identity & AI
Infrastructure hackathon; ships passkey-based proof-of-personhood (WebAuthn + RIP-7212 P-256
precompile) as its flagship Monad-native primitive.

**Primary chain:** Monad (EVM) — live on testnet, chain `10143`.
**Original implementation:** Stellar (Soroban) — still maintained under `contracts/stellar` /
`packages/stellar-sdk`, but no longer the active development focus.
Early-stage ports also exist for Solana, Starknet, and Sui (`contracts/{solana,starknet,sui}`).

## Structure
```
apps/
  personhood/      # Passkey proof-of-personhood demo (Next.js), deployed on Vercel — the main Monad demo
  horizon/          # Indexer (Express.js + MongoDB/Prisma): /api/monad/* read gateway + original Stellar indexer
  docs/             # Documentation site (Mintlify)
contracts/
  evm/              # Solidity core for Monad (Foundry) — SignetSchemaRegistry, SignetAttestationRegistry,
                     #   PasskeyAttester, resolvers (PersonhoodResolver, SchemaResolver, SampleResolver)
  stellar/          # Original Soroban implementation (protocol & resolvers)
  solana/           # Anchor-based Solana contracts (dev)
  starknet/         # Cairo contracts (dev)
  sui/              # Move contracts (dev)
packages/
  evm-sdk/          # @signetprotocol/evm-sdk — viem SDK for Monad: schemas, EIP-712 delegation, passkey personhood
  cli/              # CLI: `signet <cmd> --chain=monad|stellar`
  stellar-sdk/      # Stellar-specific SDK implementation
  sdk/              # TypeScript SDK (re-exports stellar-sdk + core)
  core/             # Core SDK abstractions
examples/           # Example implementations
```

## Commands

```bash
pnpm install    # Install (required: pnpm)
pnpm build      # Build all
pnpm dev        # Dev servers
pnpm test       # Run tests

# Workspace commands
pnpm --filter @signetprotocol/evm-sdk build
pnpm --filter @signetprotocol/evm-sdk test      # parity tests vs live on-chain values
pnpm --filter @signetprotocol/evm-sdk example   # runnable tour (add PRIVATE_KEY for live writes)
pnpm --filter @signetprotocol/personhood-demo dev   # demo app on :3002
pnpm run dev:docs                               # docs on :3001
```

**Contracts:**
```bash
# Monad/EVM (primary):
cd contracts/evm
forge test
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --private-key 0x… --broadcast

# Stellar:
cd contracts/stellar/protocol && make all
```

**Release:**
```bash
pnpm changeset                  # Version bump
pnpm release:stellar 1.0.0      # Release Stellar contracts
pnpm release                    # Full release
```

## Conventions

- No redundant prefixes: `contracts/stellar/protocol/` not `contracts/stellar/stellar-protocol/`
- TypeScript strict mode, ESLint + Prettier
- Conventional commits (commitlint enforced)
- Tests: Vitest (TS/JS), `forge test` (Solidity), cargo test (Rust)

## Requirements

Node.js 18+ + pnpm, Foundry (EVM contracts), Rust + Cargo (Stellar contracts)
