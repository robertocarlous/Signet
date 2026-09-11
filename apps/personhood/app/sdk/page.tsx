import { Code } from './_lib/ui'

const QUICKSTART = `import { createPublicClient, createWalletClient, http, encodeAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SignetClient } from '@signetprotocol/evm-sdk'

// needs: Node 18+, an account funded with testnet MON (faucet.monad.xyz), a Monad RPC
const transport = http('https://rpc.ankr.com/monad_testnet')
const account = privateKeyToAccount(process.env.PRIVATE_KEY as \`0x\${string}\`)

const signet = new SignetClient({
  chain: 'monadTestnet',                                  // bundles the deployed addresses
  publicClient: createPublicClient({ transport }),
  walletClient: createWalletClient({ account, transport }),
})

// 1. register a schema (anyone can — you become its authority)
const { uid: schemaUID } = await signet.registerSchema({
  definition: 'bool verified,string level',
  revocable: true,
})

// 2. encode the claim to match the schema definition (same order + types)
const data = encodeAbiParameters(
  [{ type: 'bool' }, { type: 'string' }],
  [true, 'premium'],
)

// 3. attest — subject can be any address, even one that's never touched the chain
const { uid } = await signet.attest({ schemaUID, subject: '0xSubject…', data })

// 4. read it back — no walletClient or gas needed for reads
await signet.isValid(uid)          // true
await signet.getAttestation(uid)   // full record`

export default function QuickstartPage() {
  return (
    <>
      <h2>Quickstart</h2>
      <p>
        This script runs anywhere Node.js runs — a one-off script, a cron job, a backend
        route. It is <strong>not</strong> something you put in a browser page: it holds a
        private key, so it belongs server-side. If you&apos;re building a web app, this is
        the code your <em>backend</em> runs; your frontend then calls that backend over
        HTTP instead of holding a key itself — see{' '}
        <a className="link" href="/sdk/live">
          the Live demo
        </a>{' '}
        below for exactly that split in action.
      </p>
      <p className="note">
        Prerequisites: Node&nbsp;18+, an account funded with testnet MON from the{' '}
        <a className="link" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
          Monad faucet
        </a>
        , and a Monad testnet RPC URL. Reads need none of these.
      </p>

      <ol className="steps">
        <li>
          <code>mkdir signet-quickstart &amp;&amp; cd signet-quickstart &amp;&amp; npm init -y</code>
        </li>
        <li>
          <code>npm install @signetprotocol/evm-sdk viem</code>
        </li>
        <li>
          Create a file named <code>quickstart.ts</code> with the contents below.
        </li>
        <li>
          Run it: <code>npx tsx quickstart.ts</code> (or compile with <code>tsc</code> first).
        </li>
      </ol>

      <Code>{QUICKSTART}</Code>

      <p>
        <code>chain: &apos;monadTestnet&apos;</code> loads the deployed contract addresses for
        you; pass <code>addresses</code> explicitly if you&apos;re pointing at a custom
        deployment. That&apos;s the whole client — one object, four calls.
      </p>
    </>
  )
}
