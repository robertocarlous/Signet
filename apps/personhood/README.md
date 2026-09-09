# Signet · Passkey Personhood demo

The **Live Product** for the hero flow: enrol a device passkey → mint an on-chain
proof-of-personhood attestation on Monad testnet → verify any address.

- `/` — create a passkey, then tap once to verify. A **server relayer pays gas**, so
  judges need no wallet and no MON. The passkey signature is verified on chain by
  `PasskeyAttester` via the RIP-7212 P-256 precompile.
- `/verify` — paste any address, see whether it holds a valid personhood attestation
  (reads the contracts directly — no API key, no middleman).

Built with Next.js (App Router) + [`@signetprotocol/evm-sdk`](../../packages/evm-sdk) + viem.

## Run locally

```bash
pnpm --filter @signetprotocol/personhood-demo dev   # http://localhost:3002
```

`cp .env.example .env.local` first and set:

| var | notes |
|---|---|
| `RELAYER_PRIVATE_KEY` | throwaway wallet with a few testnet MON ([faucet](https://faucet.monad.xyz)); **server only** |
| `MONAD_RPC_URL` | defaults to `https://rpc.ankr.com/monad_testnet` |
| `NEXT_PUBLIC_RP_ID` | WebAuthn RP ID — `localhost` for dev, the bare deploy host in prod |

## Deploy (Vercel)

- Root directory: `apps/personhood`
- Build: `pnpm build` · Install: `pnpm install` (monorepo detected)
- Env: `RELAYER_PRIVATE_KEY`, `NEXT_PUBLIC_RP_ID=<your-host>` (e.g. `signet-personhood.vercel.app`)
- Keep the relayer funded — each enrolment costs ≈0.13 MON.

## Routes

| route | |
|---|---|
| `POST /api/attest` | `{ subject, x, y, authenticatorData, clientDataJSON, signature }` → `{ txHash, uid }` (relayer) |
| `GET /api/status?address=0x…` | `{ verified, attestation?, relayer? }` (read-only) |
