'use client'

import { useMemo, useState } from 'react'
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Out({ value, error }: { value?: string; error?: string }) {
  return <div className={`out ${error ? 'out-err' : ''}`}>{error ?? value ?? '—'}</div>
}

function Code({ children }: { children: string }) {
  return (
    <pre className="code">
      <code>{children}</code>
    </pre>
  )
}

function safe<T>(fn: () => T): { value?: T; error?: string } {
  try {
    return { value: fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────── pure helper cards

function SchemaUid() {
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
    <div className="card">
      <h2>computeSchemaUid</h2>
      <p className="note">The deterministic schema UID — same value the registry emits, no transaction.</p>
      <Field label="definition" value={definition} onChange={setDefinition} />
      <Field label="authority" value={authority} onChange={setAuthority} />
      <Field label="resolver" value={resolver} onChange={setResolver} />
      <label className="checkbox">
        <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} /> revocable
      </label>
      <Out value={r.value} error={r.error} />
      <Code>{`import { computeSchemaUid } from '@signetprotocol/evm-sdk'

computeSchemaUid({
  definition: ${JSON.stringify(definition)},
  authority: '${authority}',
  resolver: '${resolver}',
  revocable: ${revocable},
})`}</Code>
    </div>
  )
}

function AttestationUid() {
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
    <div className="card">
      <h2>computeAttestationUid</h2>
      <p className="note">
        Global attestation id. Binds the registry address and attester, so it never collides across
        deployments. Defaults reproduce the live passkey personhood attestation.
      </p>
      <Field label="schemaUID" value={schemaUID} onChange={setSchemaUID} />
      <Field label="subject" value={subject} onChange={setSubject} />
      <Field label="attester" value={attester} onChange={setAttester} />
      <Field label="nonce" value={nonce} onChange={setNonce} />
      <Out value={r.value} error={r.error} />
      <Code>{`import { computeAttestationUid } from '@signetprotocol/evm-sdk'

computeAttestationUid({
  registry: '${A.attestationRegistry}',
  schemaUID: '${schemaUID}',
  subject: '${subject}',
  attester: '${attester}',
  nonce: ${nonce}n,
})`}</Code>
    </div>
  )
}

function DomainSeparator() {
  const r = safe(() => computeDomainSeparator(CHAIN_ID, A.attestationRegistry as Address))
  return (
    <div className="card">
      <h2>computeDomainSeparator</h2>
      <p className="note">
        The EIP-712 domain separator for the deployed{' '}
        <a className="link" href={`${EXPLORER}/address/${A.attestationRegistry}`} target="_blank" rel="noreferrer">
          AttestationRegistry
        </a>{' '}
        on chain {CHAIN_ID}. Equals its on-chain <code>DOMAIN_SEPARATOR()</code>.
      </p>
      <Out value={r.value} error={r.error} />
      <Code>{`import { computeDomainSeparator } from '@signetprotocol/evm-sdk'

computeDomainSeparator(${CHAIN_ID}, '${A.attestationRegistry}')`}</Code>
    </div>
  )
}

function HashAttest() {
  const [schemaUID, setSchemaUID] = useState(A.personhoodSchemaUID as string)
  const [subject, setSubject] = useState(DEPLOYER as string)
  const [attester, setAttester] = useState(DEPLOYER as string)
  const [nonce, setNonce] = useState('0')
  const [deadline, setDeadline] = useState('18446744073709551615')

  const r = useMemo(
    () =>
      safe(() =>
        hashAttest(CHAIN_ID, A.attestationRegistry as Address, {
          schemaUID: schemaUID as Hex,
          subject: subject as Address,
          attester: attester as Address,
          nonce: BigInt(nonce || '0'),
          deadline: BigInt(deadline || '0'),
          expirationTime: 0n,
          data: '0x',
        }),
      ),
    [schemaUID, subject, attester, nonce, deadline],
  )

  return (
    <div className="card">
      <h2>hashAttest (delegated digest)</h2>
      <p className="note">
        The EIP-712 digest an attester signs for <code>attestByDelegation</code>. Mirrors the on-chain{' '}
        <code>hashDelegatedAttestation</code>.
      </p>
      <Field label="schemaUID" value={schemaUID} onChange={setSchemaUID} />
      <Field label="subject" value={subject} onChange={setSubject} />
      <Field label="attester" value={attester} onChange={setAttester} />
      <Field label="nonce" value={nonce} onChange={setNonce} />
      <Field label="deadline" value={deadline} onChange={setDeadline} />
      <Out value={r.value} error={r.error} />
      <Code>{`import { hashAttest } from '@signetprotocol/evm-sdk'

hashAttest(${CHAIN_ID}, '${A.attestationRegistry}', {
  schemaUID: '${schemaUID}',
  subject: '${subject}',
  attester: '${attester}',
  nonce: ${nonce}n, deadline: ${deadline}n,
  expirationTime: 0n, data: '0x',
})`}</Code>
    </div>
  )
}

function PersonhoodChallenge() {
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
    <div className="card">
      <h2>buildPersonhoodChallenge</h2>
      <p className="note">
        The exact bytes a passkey signs to enrol. Equals <code>PasskeyAttester.challenge(subject, x, y)</code>{' '}
        on chain. Defaults use a real enrolled passkey key.
      </p>
      <Field label="subject" value={subject} onChange={setSubject} />
      <Field label="passkey x" value={x} onChange={setX} />
      <Field label="passkey y" value={y} onChange={setY} />
      <Out value={r.value} error={r.error} />
      <p className="note">credentialId: </p>
      <Out value={cred.value} error={cred.error} />
      <Code>{`import { buildPersonhoodChallenge, credentialId } from '@signetprotocol/evm-sdk'

buildPersonhoodChallenge({
  chainId: ${CHAIN_ID},
  passkeyAttester: '${A.passkeyAttester}',
  subject: '${subject}',
  x: ${x}n, y: ${y}n,
})`}</Code>
    </div>
  )
}

function ParsePubKey() {
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
    <div className="card">
      <h2>parseP256PublicKey</h2>
      <p className="note">Extract (x, y) from the SPKI bytes returned by a WebAuthn credential&apos;s getPublicKey().</p>
      <Field label="SPKI (0x hex)" value={spki} onChange={setSpki} />
      <Out value={r.value} error={r.error} />
      <Code>{`import { parseP256PublicKey } from '@signetprotocol/evm-sdk'

const { x, y } = parseP256PublicKey(spkiBytes)`}</Code>
    </div>
  )
}

function DerToRs() {
  const [der, setDer] = useState('0x3006020101020101')
  const r = useMemo(
    () =>
      safe(() => {
        const { r: rr, s } = derSignatureToRS(der as Hex)
        return `r = ${rr}\ns = ${s}   (low-s normalised)`
      }),
    [der],
  )
  return (
    <div className="card">
      <h2>derSignatureToRS</h2>
      <p className="note">DER ECDSA signature → low-s <code>(r, s)</code>, ready for on-chain P-256 verification.</p>
      <Field label="DER signature (0x hex)" value={der} onChange={setDer} />
      <Out value={r.value} error={r.error} />
      <Code>{`import { derSignatureToRS } from '@signetprotocol/evm-sdk'

const { r, s } = derSignatureToRS(assertion.response.signature)`}</Code>
    </div>
  )
}

// ─────────────────────────────────────────── live write cards

function RegisterSchema({ onUid }: { onUid: (uid: string) => void }) {
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
    <div className="card">
      <h2>registerSchema — live</h2>
      <p className="note">Sends a real transaction on Monad testnet via the demo relayer (you pay nothing).</p>
      <Field label="definition" value={definition} onChange={setDefinition} />
      <label className="checkbox">
        <input type="checkbox" checked={revocable} onChange={(e) => setRevocable(e.target.checked)} /> revocable
      </label>
      <button onClick={run} disabled={busy} style={{ marginTop: 12 }}>
        {busy ? <span className="spinner" /> : '⚡'} registerSchema
      </button>
      {result && (
        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>uid</dt>
          <dd>{result.uid}</dd>
          <dt>tx</dt>
          <dd>
            <a className="link" href={`${EXPLORER}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
              {result.txHash}
            </a>
          </dd>
        </dl>
      )}
      {error && <p className="error">{error}</p>}
      <Code>{`const { uid, txHash } = await signet.registerSchema({
  definition: ${JSON.stringify(definition)},
  revocable: ${revocable},
})`}</Code>
    </div>
  )
}

function Attest({ schemaUID }: { schemaUID: string }) {
  const [uid, setUid] = useState(schemaUID)
  const [subject, setSubject] = useState(DEPLOYER as string)
  const [data, setData] = useState('0x01')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ uid: string; txHash: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // keep in sync when a schema is registered above
  useMemo(() => {
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
    <div className="card">
      <h2>attest — live</h2>
      <p className="note">Register a schema above first, then attest against it. Real tx via the relayer.</p>
      <Field label="schemaUID" value={uid} onChange={setUid} placeholder="0x… (from registerSchema)" />
      <Field label="subject" value={subject} onChange={setSubject} />
      <Field label="data (0x hex)" value={data} onChange={setData} />
      <button onClick={run} disabled={busy || !uid} style={{ marginTop: 12 }}>
        {busy ? <span className="spinner" /> : '⚡'} attest
      </button>
      {result && (
        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>attestation uid</dt>
          <dd>{result.uid}</dd>
          <dt>tx</dt>
          <dd>
            <a className="link" href={`${EXPLORER}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
              {result.txHash}
            </a>
          </dd>
        </dl>
      )}
      {error && <p className="error">{error}</p>}
      <Code>{`const { uid } = await signet.attest({
  schemaUID: '${uid}',
  subject: '${subject}',
  data: '${data}',
})`}</Code>
    </div>
  )
}

export default function SdkPlayground() {
  const [lastSchema, setLastSchema] = useState('')

  return (
    <>
      <h1>SDK playground</h1>
      <p className="lede">
        <code>@signetprotocol/evm-sdk</code> running live. The pure helpers below reproduce the exact
        byte layouts the contracts use — compute UIDs, EIP-712 digests, and the passkey challenge with
        no wallet and no network. The two live cards at the bottom send real transactions on Monad
        testnet through the demo relayer.
      </p>
      <p className="note">
        <code>npm install @signetprotocol/evm-sdk viem</code> · docs:{' '}
        <a className="link" href="https://github.com/robertocarlous/Signet/tree/main/packages/evm-sdk" target="_blank" rel="noreferrer">
          packages/evm-sdk
        </a>
      </p>

      <SchemaUid />
      <AttestationUid />
      <DomainSeparator />
      <HashAttest />
      <PersonhoodChallenge />
      <ParsePubKey />
      <DerToRs />

      <h2 className="section">Live writes (Monad testnet)</h2>
      <RegisterSchema onUid={setLastSchema} />
      <Attest schemaUID={lastSchema} />
    </>
  )
}
