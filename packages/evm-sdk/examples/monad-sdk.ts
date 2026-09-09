/**
 * Runnable tour of @signetprotocol/evm-sdk against Monad testnet.
 *
 *   PRIVATE_KEY=0x... pnpm --filter @signetprotocol/evm-sdk example
 *
 * With no PRIVATE_KEY it runs only the pure (offline) helpers.
 * Fund the key at https://faucet.monad.xyz for the live section.
 */
import { createPublicClient, createWalletClient, http, encodeAbiParameters, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  DEPLOYMENTS,
  SignetClient,
  buildPersonhoodChallenge,
  computeSchemaUid,
  computeDomainSeparator,
} from '../src/index'

const RPC = process.env.MONAD_RPC_URL ?? 'https://rpc.ankr.com/monad_testnet'
const { chainId, addresses } = DEPLOYMENTS.monadTestnet

async function main() {
  const publicClient = createPublicClient({ transport: http(RPC) })

  // ── pure helpers (no wallet, no network) ─────────────────────────────
  const definition = 'bool verified,string level'
  console.log('\nchainId               :', chainId)
  console.log('AttestationRegistry   :', addresses.attestationRegistry)
  console.log('computeSchemaUid      :', computeSchemaUid({ definition, authority: addresses.attestationRegistry, resolver: '0x0000000000000000000000000000000000000000', revocable: true }))
  console.log('computeDomainSeparator:', computeDomainSeparator(chainId, addresses.attestationRegistry))
  console.log('personhood challenge  :', buildPersonhoodChallenge({ chainId, passkeyAttester: addresses.passkeyAttester!, subject: addresses.attestationRegistry, x: 1n, y: 2n }).slice(0, 42), '…')

  const pk = process.env.PRIVATE_KEY as Hex | undefined
  if (!pk) {
    console.log('\n(no PRIVATE_KEY — skipping the live section)\n')
    return
  }

  // ── live on Monad testnet ───────────────────────────────────────────
  const account = privateKeyToAccount(pk)
  const walletClient = createWalletClient({ account, transport: http(RPC) })
  const signet = new SignetClient({ chain: 'monadTestnet', publicClient, walletClient })

  console.log('\nsigner                :', account.address)

  const schema = await signet.registerSchema({ definition: `${definition} // ${Date.now()}`, revocable: true })
  console.log('registerSchema        :', schema.uid, '  tx', schema.hash)

  const data = encodeAbiParameters([{ type: 'bool' }, { type: 'string' }], [true, 'premium'])
  const att = await signet.attest({ schemaUID: schema.uid, subject: account.address, data })
  console.log('attest                :', att.uid, '  tx', att.hash)
  console.log('isValid               :', await signet.isValid(att.uid))

  // delegated: sign offline, submit (here the same account relays)
  const request = await signet.signDelegatedAttestation({ schemaUID: schema.uid, subject: account.address, data })
  const delegated = await signet.submitDelegatedAttestation(request)
  console.log('attestByDelegation    :', delegated.uid, '  tx', delegated.hash)
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
