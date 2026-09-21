'use client'

import { useState } from 'react'
import { isAddress, type Address, type Hex } from 'viem'
import { DEPLOYMENTS, buildRecoveryChallenge, recoverTypedData } from '@signetprotocol/evm-sdk'
import { createPasskey, getAssertion, savePasskey, type StoredPasskey } from '../lib/webauthn-browser'
import { connectWallet, signTypedData } from '../lib/injectedWallet'

const EXPLORER = 'https://testnet.monadscan.com'
const CHAIN_ID = DEPLOYMENTS.monadTestnet.chainId
const PASSKEY_ATTESTER = DEPLOYMENTS.monadTestnet.addresses.passkeyAttester as Address

interface GuardiansResp {
  guardians: Address[]
  threshold: number
  recoveryNonce: string
}

interface Approval {
  guardian: Address
  signature: Hex
}

export default function RecoverPage() {
  const rpId =
    process.env.NEXT_PUBLIC_RP_ID || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')

  const [subjectInput, setSubjectInput] = useState('')
  const [subject, setSubject] = useState<Address | null>(null)
  const [info, setInfo] = useState<GuardiansResp | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)

  const [newPasskey, setNewPasskey] = useState<StoredPasskey | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  const [approvals, setApprovals] = useState<Approval[]>([])
  const [guardianBusy, setGuardianBusy] = useState(false)
  const [guardianError, setGuardianError] = useState<string | null>(null)

  const [deadline] = useState(() => BigInt(Math.floor(Date.now() / 1000) + 3600))
  const [recoverBusy, setRecoverBusy] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)
  const [result, setResult] = useState<{ uid: Hex; txHash: Hex } | null>(null)

  async function onLookup() {
    setLookupError(null)
    setInfo(null)
    setSubject(null)
    const addr = subjectInput.trim()
    if (!isAddress(addr)) return setLookupError('Enter a valid 0x address.')

    setLookupBusy(true)
    try {
      const r = await fetch(`/api/guardians?address=${addr}`, { cache: 'no-store' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || data.error || 'lookup failed')
      if (!data.guardians || data.guardians.length === 0) {
        throw new Error('This identity has no recovery guardians configured — recovery is not possible for it.')
      }
      setInfo(data as GuardiansResp)
      setSubject(addr as Address)
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e))
    } finally {
      setLookupBusy(false)
    }
  }

  async function onCreatePasskey() {
    setPasskeyError(null)
    setPasskeyBusy(true)
    try {
      setNewPasskey(await createPasskey(rpId))
    } catch (e) {
      setPasskeyError(e instanceof Error ? e.message : String(e))
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function onGuardianSign() {
    if (!subject || !info || !newPasskey) return
    setGuardianError(null)
    setGuardianBusy(true)
    try {
      const account = await connectWallet()
      const lower = account.toLowerCase()
      if (!info.guardians.some((g) => g.toLowerCase() === lower)) {
        throw new Error(`${account} is not one of this identity's configured guardians.`)
      }
      if (approvals.some((a) => a.guardian.toLowerCase() === lower)) {
        throw new Error(`${account} already signed.`)
      }

      const typedData = recoverTypedData(CHAIN_ID, PASSKEY_ATTESTER, {
        subject,
        newX: BigInt(newPasskey.x),
        newY: BigInt(newPasskey.y),
        nonce: BigInt(info.recoveryNonce),
        deadline,
      })
      const signature = await signTypedData(account, typedData)
      setApprovals((prev) => [...prev, { guardian: account, signature }])
    } catch (e) {
      setGuardianError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardianBusy(false)
    }
  }

  async function onRecover() {
    if (!subject || !info || !newPasskey) return
    setRecoverError(null)
    setRecoverBusy(true)
    try {
      const nonce = BigInt(info.recoveryNonce)
      const challenge = buildRecoveryChallenge({
        chainId: CHAIN_ID,
        passkeyAttester: PASSKEY_ATTESTER,
        subject,
        newX: BigInt(newPasskey.x),
        newY: BigInt(newPasskey.y),
        nonce,
      })
      const assertion = await getAssertion(rpId, challenge, newPasskey.credentialId)

      const res = await fetch('/api/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject,
          newX: newPasskey.x,
          newY: newPasskey.y,
          deadline: deadline.toString(),
          guardianSignatures: approvals.map((a) => a.signature),
          ...assertion,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'recovery failed')

      // This browser now holds the recovered identity's live passkey — tag it with
      // the (unchanged) subject so the Enrol/Verify pages pick it up correctly.
      savePasskey({ ...newPasskey, subject })
      setResult({ uid: data.uid as Hex, txHash: data.txHash as Hex })
    } catch (e) {
      setRecoverError(e instanceof Error ? e.message : String(e))
    } finally {
      setRecoverBusy(false)
    }
  }

  const threshold = info?.threshold ?? 0
  const enoughApprovals = approvals.length >= threshold

  return (
    <>
      <span className="eyebrow">
        <span className="dot" /> Social recovery · guardians vouch, the new device proves it
      </span>
      <h1>Recover a lost passkey</h1>
      <p className="lede">
        Lost the device behind a Signet identity? If it configured recovery guardians, enough of them can
        approve swapping in a brand-new passkey — same identity, new key. Guardians vouch for the person; the
        new device still has to prove it holds a real passkey.
      </p>

      <div className="card">
        <div className="card-head">
          <span className="step">1</span>
          <h2>Whose identity?</h2>
        </div>
        <div className="row">
          <input
            type="text"
            placeholder="0x… subject address"
            value={subjectInput}
            onChange={(e) => setSubjectInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLookup()}
            disabled={!!subject}
          />
          <button onClick={onLookup} disabled={lookupBusy || !!subject}>
            {lookupBusy ? <span className="spinner" /> : 'Look up'}
          </button>
        </div>
        {lookupError && <p className="error">{lookupError}</p>}
        {info && subject && (
          <>
            <p className="note" style={{ marginTop: 12 }}>
              Needs {info.threshold} of {info.guardians.length} guardian signatures.
            </p>
            <dl className="kv" style={{ marginTop: 8 }}>
              {info.guardians.map((g, i) => (
                <div key={g} style={{ display: 'contents' }}>
                  <dt>guardian {i + 1}</dt>
                  <dd>{g}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>

      {subject && (
        <div className="card">
          <div className="card-head">
            <span className="step">2</span>
            <h2>New device passkey</h2>
          </div>
          {newPasskey ? (
            <dl className="kv">
              <dt>passkey P-256 x</dt>
              <dd>{newPasskey.x}</dd>
              <dt>passkey P-256 y</dt>
              <dd>{newPasskey.y}</dd>
            </dl>
          ) : (
            <>
              <p className="note">
                Create a passkey on this device. Guardians will approve binding it to the identity above; you
                still have to prove you hold it before the swap goes through.
              </p>
              <button onClick={onCreatePasskey} disabled={passkeyBusy}>
                {passkeyBusy ? <span className="spinner" /> : '＋'} Create new passkey
              </button>
            </>
          )}
          {passkeyError && <p className="error">{passkeyError}</p>}
        </div>
      )}

      {subject && newPasskey && info && (
        <div className="card">
          <div className="card-head">
            <span className="step">3</span>
            <h2>Guardian approvals</h2>
          </div>
          <p className="note">
            Each guardian connects their own wallet on this page and signs — one at a time, same browser or
            not, doesn&apos;t matter. {approvals.length} of {info.threshold} collected.
          </p>
          <div className="stat-row" style={{ marginTop: 10 }}>
            {approvals.map((a) => (
              <span className="stat-pill" key={a.guardian}>
                ✔ {a.guardian.slice(0, 6)}…{a.guardian.slice(-4)}
              </span>
            ))}
          </div>
          {!enoughApprovals && (
            <button onClick={onGuardianSign} disabled={guardianBusy} style={{ marginTop: 10 }}>
              {guardianBusy ? <span className="spinner" /> : '🖊️'} Connect wallet &amp; sign as guardian
            </button>
          )}
          {guardianError && <p className="error">{guardianError}</p>}
        </div>
      )}

      {subject && newPasskey && enoughApprovals && (
        <div className="card">
          <div className="card-head">
            <span className="step">4</span>
            <h2>Recover</h2>
          </div>
          {result ? (
            <>
              <span className="badge ok">✔ Recovered</span>
              <dl className="kv" style={{ marginTop: 14 }}>
                <dt>attestation</dt>
                <dd>{result.uid}</dd>
                <dt>tx</dt>
                <dd>
                  <a className="link" href={`${EXPLORER}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
                    {result.txHash}
                  </a>
                </dd>
              </dl>
              <p className="note">
                This browser now holds the identity&apos;s live passkey — the{' '}
                <a className="link" href="/">
                  Enrol
                </a>{' '}
                page will pick it up.
              </p>
            </>
          ) : (
            <>
              <ol className="steps">
                <li>The new passkey signs a fresh challenge, proving this device actually holds it.</li>
                <li>A relayer submits it with the collected guardian signatures — you pay nothing.</li>
                <li>The old attestation is revoked and a new one is written to the same subject.</li>
              </ol>
              <button onClick={onRecover} disabled={recoverBusy} style={{ marginTop: 14 }}>
                {recoverBusy ? <span className="spinner" /> : '⚡'} Recover personhood
              </button>
            </>
          )}
          {recoverError && <p className="error">{recoverError}</p>}
        </div>
      )}
    </>
  )
}
