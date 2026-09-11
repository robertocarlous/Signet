'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Address, Hex } from 'viem'
import {
  buildPersonhoodChallenge,
  computeAttestationUid,
  computeDomainSeparator,
  computeSchemaUid,
  credentialId,
  derSignatureToRS,
  hashAttest,
  parseP256PublicKey,
} from '@signetprotocol/evm-sdk'
import { A, CHAIN_ID, DEPLOYER, EXPLORER } from './constants'
import { Code, Field, Result, Widget, safe } from './ui'

/* ── interactive helper widgets ────────────────────────────────────────── */

export function SchemaUidWidget() {
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

export function AttestationUidWidget() {
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

export function DomainSeparatorWidget() {
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

export function HashAttestWidget() {
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

export function PersonhoodChallengeWidget() {
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

export function ParsePubKeyWidget() {
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

export function DerToRsWidget() {
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

export function RegisterSchemaLive({ onUid }: { onUid: (uid: string) => void }) {
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

export function AttestLive({ schemaUID }: { schemaUID: string }) {
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
