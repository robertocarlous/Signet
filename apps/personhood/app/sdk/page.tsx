'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Address, Hex } from 'viem'
import {
  DEPLOYMENTS,
  buildPersonhoodChallenge,
  computeAttestationUid,
  computeDomainSeparator,
  computeSchemaUid,
  credentialId,
  derSignatureToRS,
  hashAttest,
  parseP256PublicKey,
} from '@signetprotocol/evm-sdk'

const A = DEPLOYMENTS.monadTestnet.addresses
const CHAIN_ID = DEPLOYMENTS.monadTestnet.chainId
const EXPLORER = 'https://testnet.monadscan.com'
const DEPLOYER = '0x1780df035b6D25138D729351aF85278d3A719fcD' as Address
const REPO = 'https://github.com/robertocarlous/Signet/tree/main/packages/evm-sdk'

/* ── primitives ─────────────────────────────────────────────────────────── */

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? 'copied' : 'copy'}
    </button>
  )
}

function Code({ children }: { children: string }) {
  return (
    <div className="code-wrap">
      <Copy text={children} />
      <pre className="code">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  mono = true,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } : undefined}
      />
    </label>
  )
}

function Result({ type, value, error }: { type: string; value?: string; error?: string }) {
  return (
    <>
      <div className="panel-label">
        <span>Output</span>
        {value && !error ? <Copy text={value} /> : null}
      </div>
      <div className={`result ${error ? 'err' : ''}`}>
        <span className="rtype">{error ? 'error' : `→ ${type}`}</span>
        {error ?? value ?? '—'}
      </div>
    </>
  )
}

function Widget({
  name,
  desc,
  children,
}: {
  name: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="widget">
      <h3>{name}</h3>
      <p className="desc">{desc}</p>
      <div className="io">{children}</div>
    </div>
  )
}

function safe<T>(fn: () => T): { value?: T; error?: string } {
  try {
    return { value: fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/* ── interactive helper widgets ────────────────────────────────────────── */

function SchemaUidWidget() {
  const [definition, setDefinition] = useState('bool verified,string level')
  const [authority, setAuthority] = useState(DEPLOYER as string)
  const [resolver, setResolver] = useState('0x0000000000000000000000000000000000000000')
  const [revocable, setRevocable] = useState(true)
  const r = useMemo(
    () =>
      safe(() =>
        computeSchemaUid({
          definition,
          authority: authority as Address,
          resolver: resolver as Address,
          revocable,
        }),
      ),
    [definition, authority, resolver, revocable],
  )
  return (
    <Widget
      name="computeSchemaUid(input) → bytes32"
      desc="The schema's on-chain id. Deterministic from the definition, the registrant, the resolver, and the revocable flag — so you can compute it before the register() tx and reference schemas that don't exist yet."
    >
      <div>
        <div className="panel-label">Input</div>
        <Field label="definition" value={definition} onChange={setDefinition} mono={false} />
        <Field label="authority (registrant)" value={authority} onChange={setAuthority} />
        <Field label="resolver (0x0 = none)" value={resolver} onChange={setResolver} />
        <label className="checkbox">
          <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} /> revocable
        </label>
      </div>
      <div>
        <Result type="schema UID (bytes32)" value={r.value} error={r.error} />
      </div>
    </Widget>
  )
}

function AttestationUidWidget() {
  const [schemaUID, setSchemaUID] = useState(A.personhoodSchemaUID as string)
  const [subject, setSubject] = useState(DEPLOYER as string)
  const [attester, setAttester] = useState(A.passkeyAttester as string)
  const [nonce, setNonce] = useState('0')
  const r = useMemo(
    () =>
      safe(() =>
        computeAttestationUid({
          registry: A.attestationRegistry as Address,
          schemaUID: schemaUID as Hex,
          subject: subject as Address,
          attester: attester as Address,
          nonce: BigInt(nonce || '0'),
        }),
      ),
    [schemaUID, subject, attester, nonce],
  )
  return (
    <Widget
      name="computeAttestationUid(input) → bytes32"
      desc="The global attestation id. Includes the registry address and the attester, so the same (schema, subject, nonce) can't collide across deployments or between attesters. The defaults reproduce the live passkey personhood attestation — try them, then check it on the explorer."
    >
      <div>
        <div className="panel-label">Input</div>
        <Field label="schemaUID" value={schemaUID} onChange={setSchemaUID} />
        <Field label="subject" value={subject} onChange={setSubject} />
        <Field label="attester" value={attester} onChange={setAttester} />
        <Field label="nonce (per-attester)" value={nonce} onChange={setNonce} />
      </div>
      <div>
        <Result type="attestation UID (bytes32)" value={r.value} error={r.error} />
        {r.value && (
          <p className="note" style={{ marginTop: 8 }}>
            <a className="link" href={`${EXPLORER}/address/${A.attestationRegistry}`} target="_blank" rel="noreferrer">
              view registry ↗
            </a>
          </p>
        )}
      </div>
    </Widget>
  )
}

function DomainSeparatorWidget() {
  const r = safe(() => computeDomainSeparator(CHAIN_ID, A.attestationRegistry as Address))
  return (
    <Widget
      name="computeDomainSeparator(chainId, registry) → bytes32"
      desc="The EIP-712 domain separator for this deployment. Equals the AttestationRegistry's on-chain DOMAIN_SEPARATOR() — the SDK computes it locally so you can build and verify typed-data signatures offline."
    >
      <div>
        <div className="panel-label">Input</div>
        <Field label="chainId" value={String(CHAIN_ID)} onChange={() => {}} />
        <Field label="verifyingContract" value={A.attestationRegistry} onChange={() => {}} />
      </div>
      <div>
        <Result type="domain separator (bytes32)" value={r.value} error={r.error} />
      </div>
    </Widget>
  )
}

function HashAttestWidget() {
  const [subject, setSubject] = useState(DEPLOYER as string)
  const [attester, setAttester] = useState(DEPLOYER as string)
  const [nonce, setNonce] = useState('0')
  const r = useMemo(
    () =>
      safe(() =>
        hashAttest(CHAIN_ID, A.attestationRegistry as Address, {
          schemaUID: A.personhoodSchemaUID as Hex,
          subject: subject as Address,
          attester: attester as Address,
          nonce: BigInt(nonce || '0'),
          deadline: (1n << 64n) - 1n,
          expirationTime: 0n,
          data: '0x',
        }),
      ),
    [subject, attester, nonce],
  )
  return (
    <Widget
      name="hashAttest(chainId, registry, request) → bytes32"
      desc="The EIP-712 digest an attester signs for a gasless (delegated) attestation. Mirrors the contract's hashDelegatedAttestation(). Feed the result to walletClient.signTypedData — or use signDelegatedAttestation(), which does all of this for you."
    >
      <div>
        <div className="panel-label">Input (request)</div>
        <Field label="subject" value={subject} onChange={setSubject} />
        <Field label="attester (signer)" value={attester} onChange={setAttester} />
        <Field label="nonce" value={nonce} onChange={setNonce} />
        <p className="note">schemaUID · deadline · expirationTime · data held constant here</p>
      </div>
      <div>
        <Result type="typed-data digest (bytes32)" value={r.value} error={r.error} />
      </div>
    </Widget>
  )
}

function PersonhoodChallengeWidget() {
  const [subject, setSubject] = useState(DEPLOYER as string)
  const [x, setX] = useState('0x82cb6615a74d9663b542b27a33580b6365f8c5dd0d4f25ef33b7cb03a188a984')
  const [y, setY] = useState('0xd1edf88583b1e7e3b5b0866ef0f63228e81299fadf4a24af5a444c03252d8a78')
  const r = useMemo(
    () =>
      safe(() =>
        buildPersonhoodChallenge({
          chainId: CHAIN_ID,
          passkeyAttester: A.passkeyAttester as Address,
          subject: subject as Address,
          x: BigInt(x || '0'),
          y: BigInt(y || '0'),
        }),
      ),
    [subject, x, y],
  )
  const cred = useMemo(() => safe(() => credentialId(BigInt(x || '0'), BigInt(y || '0'))), [x, y])
  return (
    <Widget
      name="buildPersonhoodChallenge(input) → bytes"
      desc="The exact bytes a device passkey must sign to enrol. Byte-identical to PasskeyAttester.challenge(subject, x, y) on chain — it binds the chain id, the contract, the subject address, and the passkey key so a signature can't be replayed elsewhere. Defaults use a real enrolled passkey."
    >
      <div>
        <div className="panel-label">Input</div>
        <Field label="subject" value={subject} onChange={setSubject} />
        <Field label="passkey P-256 x" value={x} onChange={setX} />
        <Field label="passkey P-256 y" value={y} onChange={setY} />
      </div>
      <div>
        <Result type="challenge bytes (192)" value={r.value} error={r.error} />
        <div style={{ marginTop: 10 }}>
          <Result type="credentialId — keccak256(abi.encode(x,y))" value={cred.value} error={cred.error} />
        </div>
      </div>
    </Widget>
  )
}

function ParsePubKeyWidget() {
  const [spki, setSpki] = useState(
    '0x3059301306072a8648ce3d020106082a8648ce3d0301070342000482cb6615a74d9663b542b27a33580b6365f8c5dd0d4f25ef33b7cb03a188a984d1edf88583b1e7e3b5b0866ef0f63228e81299fadf4a24af5a444c03252d8a78',
  )
  const r = useMemo(
    () =>
      safe(() => {
        const { x, y } = parseP256PublicKey(spki as Hex)
        return `x = 0x${x.toString(16)}\ny = 0x${y.toString(16)}`
      }),
    [spki],
  )
  return (
    <Widget
      name="parseP256PublicKey(spki) → { x, y }"
      desc="Pull the P-256 coordinates out of the SPKI bytes returned by AuthenticatorAttestationResponse.getPublicKey() during passkey registration. These x/y are what you store and pass to attestPersonhood()."
    >
      <div>
        <div className="panel-label">Input</div>
        <Field label="SPKI DER (0x hex)" value={spki} onChange={setSpki} />
      </div>
      <div>
        <Result type="{ x: bigint, y: bigint }" value={r.value} error={r.error} />
      </div>
    </Widget>
  )
}

function DerToRsWidget() {
  const [der, setDer] = useState('0x3006020101020101')
  const r = useMemo(
    () =>
      safe(() => {
        const { r: rr, s } = derSignatureToRS(der as Hex)
        return `r = ${rr}\ns = ${s}`
      }),
    [der],
  )
  return (
    <Widget
      name="derSignatureToRS(der) → { r, s }"
      desc="WebAuthn hands you a DER-encoded ECDSA signature. This decodes it to the two 32-byte halves and normalises s to low-s (≤ N/2), which the on-chain P-256 verifier requires. assertionFromCredential() calls this internally."
    >
      <div>
        <div className="panel-label">Input</div>
        <Field label="DER signature (0x hex)" value={der} onChange={setDer} />
      </div>
      <div>
        <Result type="{ r: Hex, s: Hex } — low-s" value={r.value} error={r.error} />
      </div>
    </Widget>
  )
}

/* ── live write widgets ───────────────────────────────────────────────── */

function RegisterSchemaLive({ onUid }: { onUid: (uid: string) => void }) {
  const [definition, setDefinition] = useState('bool verified,string level')
  const [revocable, setRevocable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ uid: string; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/sdk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'registerSchema', definition, revocable }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'failed')
      setResult(data)
      onUid(data.uid)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="widget">
      <h3>signet.registerSchema(&#123; definition, revocable &#125;) → &#123; uid, hash &#125;</h3>
      <p className="desc">Sends a real transaction on Monad testnet. The demo relayer signs and pays — you need no wallet.</p>
      <div className="io">
        <div>
          <div className="panel-label">Input</div>
          <Field label="definition" value={definition} onChange={setDefinition} mono={false} />
          <label className="checkbox">
            <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} /> revocable
          </label>
          <button onClick={run} disabled={busy} style={{ marginTop: 10 }}>
            {busy ? <span className="spinner" /> : '⚡'} run
          </button>
        </div>
        <div>
          <div className="panel-label">Output</div>
          <div className={`result ${error ? 'err' : ''}`}>
            {error ? (
              error
            ) : result ? (
              <>
                <span className="rtype">→ uid (bytes32)</span>
                {result.uid}
                {'\n\n'}
                <span className="rtype">→ tx</span>
                <a className="link" href={`${EXPLORER}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
                  {result.txHash}
                </a>
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>
      <Code>{`const { uid, hash } = await signet.registerSchema({
  definition: ${JSON.stringify(definition)},
  revocable: ${revocable},
})`}</Code>
    </div>
  )
}

function AttestLive({ schemaUID }: { schemaUID: string }) {
  const [uid, setUid] = useState(schemaUID)
  const [subject, setSubject] = useState(DEPLOYER as string)
  const [data, setData] = useState('0x01')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ uid: string; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (schemaUID) setUid(schemaUID)
  }, [schemaUID])

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/sdk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'attest', schemaUID: uid, subject, data }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.detail || d.error || 'failed')
      setResult(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="widget">
      <h3>signet.attest(&#123; schemaUID, subject, data &#125;) → &#123; uid, hash &#125;</h3>
      <p className="desc">Run registerSchema above first — its uid pre-fills here. Then attest against it. Real tx via the relayer.</p>
      <div className="io">
        <div>
          <div className="panel-label">Input</div>
          <Field label="schemaUID" value={uid} onChange={setUid} />
          <Field label="subject" value={subject} onChange={setSubject} />
          <Field label="data (0x, schema-encoded)" value={data} onChange={setData} />
          <button onClick={run} disabled={busy || !uid} style={{ marginTop: 10 }}>
            {busy ? <span className="spinner" /> : '⚡'} run
          </button>
        </div>
        <div>
          <div className="panel-label">Output</div>
          <div className={`result ${error ? 'err' : ''}`}>
            {error ? (
              error
            ) : result ? (
              <>
                <span className="rtype">→ attestation uid (bytes32)</span>
                {result.uid}
                {'\n\n'}
                <span className="rtype">→ tx</span>
                <a className="link" href={`${EXPLORER}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
                  {result.txHash}
                </a>
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>
      <Code>{`const { uid, hash } = await signet.attest({
  schemaUID: '${uid || '0x…'}',
  subject: '${subject}',
  data: '${data}',
})`}</Code>
    </div>
  )
}

/* ── page ─────────────────────────────────────────────────────────────── */

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

const DELEGATED = `// signer — offline, no gas, no chain access
const request = await signet.signDelegatedAttestation({
  schemaUID, subject: '0xSubject…', data: '0x01',
})

// relayer — anywhere else, pays the gas
const { uid } = await signet.submitDelegatedAttestation(request)`

const PERSONHOOD = `import { parseP256PublicKey, assertionFromCredential } from '@signetprotocol/evm-sdk'

// on registration: read the passkey's P-256 key once
const { x, y } = parseP256PublicKey(regResponse.getPublicKey())

// the challenge the passkey must sign (== PasskeyAttester.challenge on chain)
const challenge = signet.personhoodChallenge(subject, x, y)

// browser: navigator.credentials.get({ publicKey: { challenge: hexToBytes(challenge), … } })
const auth = assertionFromCredential(assertion)          // -> WebAuthnAuth tuple

// relay it — verified on chain via the RIP-7212 P-256 precompile
const { uid } = await signet.attestPersonhood({ subject, x, y, auth })`

export default function SdkPage() {
  const [lastSchema, setLastSchema] = useState('')

  return (
    <>
      <div className="sdk-hero">
        <h1>@signetprotocol/evm-sdk</h1>
        <p>
          A <code>viem</code>-based TypeScript SDK for the Signet attestation protocol on Monad.
          Register schemas, write attestations — directly or <em>gasless</em> via EIP-712 delegation —
          and verify device-passkey personhood. Every helper reproduces the exact byte layout its
          contract uses, so you can compute ids and signatures offline and trust they&apos;ll match on
          chain.
        </p>
        <span className="install">
          npm install @signetprotocol/evm-sdk viem <Copy text="npm install @signetprotocol/evm-sdk viem" />
        </span>
        <div className="quicklinks">
          <a href={REPO} target="_blank" rel="noreferrer">Source & README ↗</a>
          <a href={`${REPO}/examples/monad-sdk.ts`} target="_blank" rel="noreferrer">Runnable example ↗</a>
          <a href={`${REPO}/test`} target="_blank" rel="noreferrer">Parity tests ↗</a>
          <a href="https://github.com/robertocarlous/Signet/tree/main/apps/docs" target="_blank" rel="noreferrer">Protocol docs ↗</a>
          <a href="/api/monad/contracts" target="_blank" rel="noreferrer">Deployments JSON ↗</a>
        </div>
      </div>

      <div className="layout">
        <nav className="toc">
          <a href="#quickstart">Quickstart</a>
          <a href="#model">How it fits</a>
          <a href="#schemas">Schemas</a>
          <a href="#attest">Attestations</a>
          <a href="#delegated">Delegated (gasless)</a>
          <a href="#personhood">Passkey personhood</a>
          <a href="#reads">Reads & verify</a>
          <a href="#troubleshooting">Troubleshooting</a>
          <a href="#live">Live demo</a>
          <a href="#api">API reference</a>
        </nav>

        <div>
          <section id="quickstart" className="sdk-section">
            <h2>Quickstart</h2>
            <p>
              One client, four steps. <code>chain: &apos;monadTestnet&apos;</code> loads the deployed
              contract addresses for you; pass <code>addresses</code> explicitly for a custom deployment.
            </p>
            <p className="note">
              Prerequisites: Node&nbsp;18+, an account funded with testnet MON from the{' '}
              <a className="link" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
                Monad faucet
              </a>
              , and a Monad testnet RPC URL. Reads need none of these.
            </p>
            <Code>{QUICKSTART}</Code>
          </section>

          <section id="model" className="sdk-section">
            <h2>How it fits together</h2>
            <p>Four terms cover the whole SDK surface:</p>
            <table className="api-table">
              <tbody>
                <tr>
                  <td>Schema</td>
                  <td>
                    The shape of a claim, e.g. &ldquo;bool verified,string level&rdquo;. Anyone can register one; the
                    registrant becomes its authority. Registering returns a deterministic schemaUID.
                  </td>
                </tr>
                <tr>
                  <td>Attestation</td>
                  <td>
                    One instance of a claim — &ldquo;using schema X, I (the attester) claim this about subject.&rdquo;
                    Returns a per-claim uid.
                  </td>
                </tr>
                <tr>
                  <td>Subject</td>
                  <td>The address a claim is about. It never has to sign anything or be online.</td>
                </tr>
                <tr>
                  <td>Resolver</td>
                  <td>
                    An optional contract a schema points at to add rules — fees, allowlists, one-per-address. Most
                    quickstart use needs none.
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 18 }}>
              Underneath: three immutable contracts, no admin keys. The SDK is a typed wrapper over them.
            </p>
            <div className="fits">
              <div className="box">
                <b>SchemaRegistry</b> — permissionless. Anyone registers a <em>schema</em> (a
                definition string); the registrant is its authority. Points optionally at a resolver.
              </div>
              <div className="box">
                <b>AttestationRegistry</b> — <em>attestations</em> structured by a schema.
                Direct (<code>msg.sender</code> is the attester) or delegated (EIP-712 signature, anyone relays).
                Per-attester nonces allow many attestations per (schema, subject).
              </div>
              <div className="box">
                <b>Resolver</b> (optional) — a contract the registry calls on every attest/revoke.
                <code>onAttest</code>/<code>onRevoke</code> are hard gates; <code>onResolve</code> is a
                best-effort hook. This is where
                fees, allowlists, and one-per-human rules live.
              </div>
              <div className="box">
                <b>PasskeyAttester</b> — verifies a WebAuthn/P-256 assertion on chain (RIP-7212
                precompile) and writes a personhood attestation. Locked to its schema by a resolver.
              </div>
            </div>
          </section>

          <section id="schemas" className="sdk-section">
            <h2>Schemas</h2>
            <p>
              A schema is a reusable definition other people&apos;s attestations reference. Registering
              is a permissionless transaction; the UID is deterministic, so integrators can hard-code
              it.
            </p>
            <code className="sig">{`signet.registerSchema({ definition: string, revocable: boolean, resolver?: Address })
  → { uid: Hex, hash: Hex }
signet.getSchema(uid: Hex) → { authority, resolver, revocable, definition }
signet.computeSchemaUid({ definition, authority, resolver?, revocable }) → Hex   // pure`}</code>
            <SchemaUidWidget />
          </section>

          <section id="attest" className="sdk-section">
            <h2>Attestations</h2>
            <p>
              A signed claim about a <code>subject</code>, structured by a schema. <code>data</code> is
              ABI-encoded per the schema. The UID binds the registry and attester so it never collides.
            </p>
            <p>Three ways to write one — pick by who pays gas and whether the attester is online:</p>
            <div className="fits">
              <div className="box">
                <b>attest()</b> — the attester (<code>msg.sender</code>) pays gas and must be online. Simplest case:
                you hold the live, funded wallet.
              </div>
              <div className="box">
                <b>signDelegatedAttestation() + submitDelegatedAttestation()</b> — the attester signs offline once,
                no gas; whoever relays it pays. Use when the attester shouldn&apos;t need gas or a connection.
              </div>
              <div className="box">
                <b>attestPersonhood()</b> — a device passkey signs; whoever relays it pays. Use to prove a real
                device/human holder, with no wallet or seed phrase.
              </div>
            </div>
            <code className="sig">{`signet.attest({ schemaUID, subject, data, expirationTime? }) → { uid, hash }
signet.revoke(attestationUID) → { hash }              // attester only, schema must be revocable
signet.getAttestation(uid) → Attestation
signet.isValid(uid) → boolean                         // exists, not revoked, not expired
signet.computeAttestationUid({ schemaUID, subject, attester, nonce }) → Hex   // pure`}</code>
            <AttestationUidWidget />
          </section>

          <section id="delegated" className="sdk-section">
            <h2>Delegated attestation (gasless)</h2>
            <p>
              The attester signs an EIP-712 message offline — no chain access, no gas. A relayer
              submits it and pays. Replay is bounded by a per-attester nonce and a deadline.
            </p>
            <Code>{DELEGATED}</Code>
            <code className="sig">{`signet.signDelegatedAttestation({ schemaUID, subject, data, nonce?, deadline?, expirationTime? })
  → DelegatedAttestationRequest      // { …fields, signature }
signet.submitDelegatedAttestation(request) → { uid, hash }
signet.hashAttest(chainId, registry, request) → Hex               // pure, the digest to sign
signet.computeDomainSeparator(chainId, registry) → Hex            // pure`}</code>
            <HashAttestWidget />
            <DomainSeparatorWidget />
          </section>

          <section id="personhood" className="sdk-section">
            <h2>Passkey proof of personhood</h2>
            <p>
              A person proves control of a device passkey (Face&nbsp;ID / fingerprint / security key).
              The WebAuthn assertion is verified <em>on chain</em> by <code>PasskeyAttester</code> via
              the RIP-7212 P-256 precompile, which then writes a personhood attestation. One enrolment per
              passkey, one attestation per subject, and anyone can relay — the person pays nothing.
            </p>
            <Code>{PERSONHOOD}</Code>
            <code className="sig">{`signet.personhoodChallenge(subject, x, y) → Hex        // == PasskeyAttester.challenge on chain
signet.attestPersonhood({ subject, x, y, auth: WebAuthnAuth }) → { uid, hash }
signet.personhoodOf(address) → Hex                     // attestation UID, or bytes32(0)

parseP256PublicKey(spki) → { x, y }                    // from credential.getPublicKey()
assertionFromCredential(cred) → WebAuthnAuth           // from navigator.credentials.get()
buildPersonhoodChallenge({ chainId, passkeyAttester, subject, x, y }) → Hex
derSignatureToRS(der) → { r, s }                       // low-s`}</code>
            <PersonhoodChallengeWidget />
            <ParsePubKeyWidget />
            <DerToRsWidget />
            <p className="note" style={{ marginTop: 14 }}>
              See it run end to end on the <a className="link" href="/">Enrol</a> page.
            </p>
          </section>

          <section id="reads" className="sdk-section">
            <h2>Reads & verification</h2>
            <p>
              All reads are permissionless — no API key. For a hosted HTTP surface (list attestations,
              filter by subject/schema, personhood lookup) the indexer exposes{' '}
              <a className="link" href="/api/monad/contracts" target="_blank" rel="noreferrer">
                /api/monad
              </a>
              .
            </p>
            <code className="sig">{`signet.getSchema(uid) · signet.isSchemaRegistered(uid)
signet.getAttestation(uid) · signet.isValid(uid) · signet.isAttested(uid)
signet.getNonce(attester) · signet.getRevocationNonce(revoker)
signet.onchainDomainSeparator() · signet.personhoodOf(address)`}</code>
          </section>

          <section id="troubleshooting" className="sdk-section">
            <h2>Troubleshooting</h2>
            <table className="api-table">
              <tbody>
                <tr>
                  <td>insufficient funds for gas</td>
                  <td>
                    The account behind your walletClient has no MON. Fund it from{' '}
                    <a className="link" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
                      faucet.monad.xyz
                    </a>
                    .
                  </td>
                </tr>
                <tr>
                  <td>walletClient is required for writes</td>
                  <td>
                    You called a write (attest, registerSchema…) on a client built with only a publicClient. Add a
                    walletClient.
                  </td>
                </tr>
                <tr>
                  <td>unknown chain &quot;…&quot;</td>
                  <td>
                    The chain option doesn&apos;t match a key in DEPLOYMENTS (currently just monadTestnet). Check for
                    typos, or pass addresses directly for a custom deployment.
                  </td>
                </tr>
                <tr>
                  <td>revert with no clear reason</td>
                  <td>
                    If the schema has a resolver, its onAttest hook can reject — an unpaid fee, a failed allowlist
                    check. Check the resolver contract&apos;s conditions.
                  </td>
                </tr>
                <tr>
                  <td>delegated attestation rejected as expired</td>
                  <td>deadline defaults to &ldquo;never,&rdquo; but a custom one must be a future Unix timestamp.</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section id="live" className="sdk-section">
            <h2>Live demo — write to Monad testnet</h2>
            <p>
              These call the SDK server-side through a funded relayer, so you can fire a real
              transaction without a wallet. Every other widget on this page is pure and runs in your
              browser.
            </p>
            <RegisterSchemaLive onUid={setLastSchema} />
            <AttestLive schemaUID={lastSchema} />
          </section>

          <section id="api" className="sdk-section">
            <h2>API reference</h2>
            <table className="api-table">
              <tbody>
                <tr><td>new SignetClient(opts)</td><td>{'{ chain | addresses, publicClient, walletClient? }'}</td></tr>
                <tr><td>.registerSchema()</td><td>register a schema → {'{ uid, hash }'}</td></tr>
                <tr><td>.getSchema() / .isSchemaRegistered()</td><td>read a schema</td></tr>
                <tr><td>.attest() / .revoke()</td><td>direct write; revoke is attester-only</td></tr>
                <tr><td>.signDelegatedAttestation()</td><td>EIP-712 sign offline → request object</td></tr>
                <tr><td>.submitDelegatedAttestation()</td><td>relay a signed request</td></tr>
                <tr><td>.signDelegatedRevocation() / .submitDelegatedRevocation()</td><td>same, for revocation</td></tr>
                <tr><td>.getAttestation() / .isValid() / .isAttested()</td><td>read an attestation</td></tr>
                <tr><td>.getNonce() / .getRevocationNonce()</td><td>current nonces</td></tr>
                <tr><td>.attestPersonhood() / .personhoodOf() / .personhoodChallenge()</td><td>passkey personhood</td></tr>
                <tr><td>.computeSchemaUid() / .computeAttestationUid()</td><td>pure UID derivation</td></tr>
                <tr><td>.hashDelegatedAttestation() / .hashDelegatedRevocation()</td><td>pure EIP-712 digests</td></tr>
                <tr><td>.domainSeparator() / .onchainDomainSeparator()</td><td>local vs on-chain</td></tr>
                <tr><td>computeSchemaUid / computeAttestationUid / computeDomainSeparator</td><td>standalone pure exports</td></tr>
                <tr><td>hashAttest / hashRevoke / attestTypedData / revokeTypedData</td><td>EIP-712 building blocks</td></tr>
                <tr><td>buildPersonhoodChallenge / credentialId</td><td>personhood, standalone</td></tr>
                <tr><td>parseP256PublicKey / derSignatureToRS / toWebAuthnAuth / assertionFromCredential</td><td>WebAuthn helpers</td></tr>
                <tr><td>DEPLOYMENTS / MONAD_TESTNET / getDeployment()</td><td>deployed addresses</td></tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  )
}
