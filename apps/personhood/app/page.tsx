'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAddress, type Address, type Hex } from 'viem'
import { DEPLOYMENTS, buildPersonhoodChallenge, buildSetGuardiansChallenge } from '@signetprotocol/evm-sdk'
import {
  clearPasskey,
  createPasskey,
  getAssertion,
  identityAddress,
  isSupported,
  loadPasskey,
  type StoredPasskey,
} from './lib/webauthn-browser'

const EXPLORER = 'https://testnet.monadscan.com'
const CHAIN_ID = DEPLOYMENTS.monadTestnet.chainId
const PASSKEY_ATTESTER = DEPLOYMENTS.monadTestnet.addresses.passkeyAttester as Address

type Phase = 'loading' | 'no-passkey' | 'ready' | 'busy' | 'done'

interface StatusResp {
  verified: boolean
  attestation?: { uid: Hex; schemaUID: Hex; attester: Address; time: string; revoked: boolean }
  relayer?: { address: string; balanceMon: string }
}

interface GuardiansResp {
  guardians: Address[]
  threshold: number
  setGuardiansNonce: string
}

export default function EnrolPage() {
  const [supported, setSupported] = useState(true)
  const [passkey, setPasskey] = useState<StoredPasskey | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [status, setStatus] = useState<StatusResp | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string>('')

  const [guardiansInfo, setGuardiansInfo] = useState<GuardiansResp | null>(null)
  const [guardianInput, setGuardianInput] = useState('')
  const [threshold, setThreshold] = useState(2)
  const [guardianBusy, setGuardianBusy] = useState(false)
  const [guardianStep, setGuardianStep] = useState('')
  const [guardianError, setGuardianError] = useState<string | null>(null)
  const [guardianTxHash, setGuardianTxHash] = useState<Hex | null>(null)

  const rpId = process.env.NEXT_PUBLIC_RP_ID || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')

  const identity: Address | null = useMemo(() => {
    if (!passkey) return null
    // A recovered passkey carries its (unchanged) subject explicitly — it won't
    // match identityAddress(x, y) for the new key, by design.
    return (passkey.subject as Address | undefined) ?? identityAddress(BigInt(passkey.x), BigInt(passkey.y))
  }, [passkey])

  const refreshStatus = useCallback(async (addr: Address) => {
    try {
      const r = await fetch(`/api/status?address=${addr}`, { cache: 'no-store' })
      if (r.ok) setStatus((await r.json()) as StatusResp)
    } catch {
      /* ignore */
    }
  }, [])

  const refreshGuardians = useCallback(async (addr: Address) => {
    try {
      const r = await fetch(`/api/guardians?address=${addr}`, { cache: 'no-store' })
      if (r.ok) setGuardiansInfo((await r.json()) as GuardiansResp)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    setSupported(isSupported())
    const pk = loadPasskey()
    setPasskey(pk)
    setPhase(pk ? 'ready' : 'no-passkey')
  }, [])

  useEffect(() => {
    if (identity) void refreshStatus(identity)
  }, [identity, refreshStatus])

  useEffect(() => {
    if (identity && status?.verified) void refreshGuardians(identity)
  }, [identity, status?.verified, refreshGuardians])

  async function onCreate() {
    setError(null)
    setPhase('busy')
    setStep('Creating a device passkey…')
    try {
      const pk = await createPasskey(rpId)
      setPasskey(pk)
      setPhase('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('no-passkey')
    } finally {
      setStep('')
    }
  }

  async function onEnrol() {
    if (!passkey || !identity) return
    setError(null)
    setTxHash(null)
    setPhase('busy')
    try {
      const x = BigInt(passkey.x)
      const y = BigInt(passkey.y)
      const challenge = buildPersonhoodChallenge({
        chainId: CHAIN_ID,
        passkeyAttester: PASSKEY_ATTESTER,
        subject: identity,
        x,
        y,
      })

      setStep('Waiting for your passkey (Touch ID / fingerprint)…')
      const assertion = await getAssertion(rpId, challenge, passkey.credentialId)

      setStep('Relaying to Monad — verifying the assertion on-chain…')
      const res = await fetch('/api/attest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: identity, x: passkey.x, y: passkey.y, ...assertion }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'PasskeyAlreadyEnrolled' || data.code === 'SubjectAlreadyVerified') {
          await refreshStatus(identity)
          setPhase('done')
          setError(null)
          return
        }
        throw new Error(data.detail || data.error || 'enrolment failed')
      }

      setTxHash(data.txHash as Hex)
      await refreshStatus(identity)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('ready')
    } finally {
      setStep('')
    }
  }

  async function onSetGuardians() {
    if (!passkey || !identity) return
    setGuardianError(null)
    setGuardianTxHash(null)

    const guardians = guardianInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean) as Address[]
    const unique = Array.from(new Set(guardians.map((g) => g.toLowerCase())))
    if (guardians.length < 2) return setGuardianError('List at least 2 guardian addresses (one per line).')
    if (!guardians.every((g) => isAddress(g))) {
      return setGuardianError('One of those addresses is not a valid 0x address.')
    }
    if (unique.length !== guardians.length) return setGuardianError('The same address is listed more than once.')
    if (threshold < 2 || threshold > guardians.length) {
      return setGuardianError(`Threshold must be between 2 and ${guardians.length}.`)
    }

    setGuardianBusy(true)
    try {
      const nonce = BigInt(guardiansInfo?.setGuardiansNonce ?? '0')
      const challenge = buildSetGuardiansChallenge({
        chainId: CHAIN_ID,
        passkeyAttester: PASSKEY_ATTESTER,
        subject: identity,
        guardians,
        threshold,
        nonce,
      })

      setGuardianStep('Waiting for your passkey (Touch ID / fingerprint)…')
      const assertion = await getAssertion(rpId, challenge, passkey.credentialId)

      setGuardianStep('Relaying to Monad…')
      const res = await fetch('/api/guardians', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: identity, guardians, threshold, ...assertion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'setting guardians failed')

      setGuardianTxHash(data.txHash as Hex)
      setGuardianInput('')
      await refreshGuardians(identity)
    } catch (e) {
      setGuardianError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardianBusy(false)
      setGuardianStep('')
    }
  }

  function onReset() {
    clearPasskey()
    setPasskey(null)
    setStatus(null)
    setTxHash(null)
    setError(null)
    setPhase('no-passkey')
  }

  const verified = status?.verified === true
  const busy = phase === 'busy'

  return (
    <>
      <h1>Prove personhood with a passkey</h1>
      <p className="lede">
        One tap on the hardware you already own — no seed phrase, no centralised issuer. Your passkey
        signature is verified <em>on chain</em> on Monad via the RIP-7212 P-256 precompile, and Signet
        writes you a portable proof-of-personhood attestation.
      </p>
      <div className="stat-row">
        <span className="stat-pill">⚡ Gasless — the relayer pays</span>
        <span className="stat-pill">🔒 Verified on chain</span>
        <span className="stat-pill">🔑 No seed phrase</span>
      </div>

      {!supported && (
        <div className="card">
          <p className="error">
            This browser doesn&apos;t expose WebAuthn / passkeys. Try Chrome or Safari on a device with a
            biometric sensor.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="step">1</span>
          <h2>Your Signet identity</h2>
        </div>
        {phase === 'loading' ? (
          <p className="note">Loading…</p>
        ) : !passkey ? (
          <>
            <p className="note">
              Create a passkey. Its public key becomes a deterministic identity address — nothing is sent
              anywhere yet.
            </p>
            <button onClick={onCreate} disabled={busy || !supported}>
              {busy ? <span className="spinner" /> : '＋'} Create passkey
            </button>
          </>
        ) : (
          <>
            <dl className="kv">
              <dt>identity</dt>
              <dd>{identity}</dd>
              <dt>passkey P-256 x</dt>
              <dd>{passkey.x}</dd>
              <dt>passkey P-256 y</dt>
              <dd>{passkey.y}</dd>
            </dl>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="ghost" onClick={onReset} disabled={busy}>
                Forget passkey
              </button>
            </div>
          </>
        )}
      </div>

      {passkey && (
        <div className="card">
          <div className="card-head">
            <span className="step">2</span>
            <h2>Enrol</h2>
          </div>
          {verified ? (
            <>
              <span className="badge ok">✔ Personhood verified</span>
              {status?.attestation && (
                <dl className="kv" style={{ marginTop: 14 }}>
                  <dt>attestation</dt>
                  <dd>
                    <a
                      className="link"
                      href={`${EXPLORER}/address/${status.attestation.attester}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {status.attestation.uid}
                    </a>
                  </dd>
                  <dt>schema</dt>
                  <dd>{status.attestation.schemaUID}</dd>
                  <dt>attester</dt>
                  <dd>{status.attestation.attester} (PasskeyAttester)</dd>
                </dl>
              )}
              {txHash && (
                <p className="note">
                  tx{' '}
                  <a className="link" href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">
                    {txHash}
                  </a>
                </p>
              )}
            </>
          ) : (
            <>
              <ol className="steps">
                <li>Your passkey signs the Signet challenge (bound to chain, contract, identity, key).</li>
                <li>A relayer submits it — you pay nothing.</li>
                <li>
                  <code>PasskeyAttester</code> verifies the P-256 signature on chain and writes the
                  attestation.
                </li>
              </ol>
              <button onClick={onEnrol} disabled={busy} style={{ marginTop: 14 }}>
                {busy ? <span className="spinner" /> : '⚡'} Verify with passkey
              </button>
            </>
          )}
          {step && <p className="note">{step}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {verified && (
        <div className="card">
          <div className="card-head">
            <span className="step">3</span>
            <h2>Recovery guardians</h2>
          </div>
          {guardiansInfo && guardiansInfo.guardians.length > 0 ? (
            <>
              <p className="note">
                {guardiansInfo.threshold} of {guardiansInfo.guardians.length} guardians can approve swapping you
                onto a new passkey if this device is ever lost —{' '}
                <a className="link" href="/recover">
                  see the Recover page
                </a>
                .
              </p>
              <dl className="kv" style={{ marginTop: 12 }}>
                {guardiansInfo.guardians.map((g, i) => (
                  <div key={g} style={{ display: 'contents' }}>
                    <dt>guardian {i + 1}</dt>
                    <dd>{g}</dd>
                  </div>
                ))}
              </dl>
              <p className="note">Setting guardians again below replaces this list.</p>
            </>
          ) : (
            <p className="note">
              Optional, but without it a lost or stolen device means this identity can never be recovered —{' '}
              <code>PasskeyAttester</code> has no admin override. Pick at least 2 people you trust and how many
              of them (the threshold) must agree to approve a recovery.
            </p>
          )}

          <div className="field">
            <span>Guardian addresses (one per line, at least 2)</span>
            <textarea
              value={guardianInput}
              onChange={(e) => setGuardianInput(e.target.value)}
              placeholder={'0xFriend1…\n0xFriend2…'}
              disabled={guardianBusy}
            />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <span>Threshold (signatures required)</span>
            <input
              type="number"
              min={2}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={guardianBusy}
            />
          </div>
          <button onClick={onSetGuardians} disabled={guardianBusy} style={{ marginTop: 4 }}>
            {guardianBusy ? <span className="spinner" /> : '🛡️'} Set guardians
          </button>

          {guardianTxHash && (
            <p className="note" style={{ marginTop: 12 }}>
              tx{' '}
              <a className="link" href={`${EXPLORER}/tx/${guardianTxHash}`} target="_blank" rel="noreferrer">
                {guardianTxHash}
              </a>
            </p>
          )}
          {guardianStep && <p className="note">{guardianStep}</p>}
          {guardianError && <p className="error">{guardianError}</p>}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="step">◈</span>
          <h2>Contracts (Monad testnet)</h2>
        </div>
        <dl className="kv">
          <dt>PasskeyAttester</dt>
          <dd>
            <a className="link" href={`${EXPLORER}/address/${PASSKEY_ATTESTER}`} target="_blank" rel="noreferrer">
              {PASSKEY_ATTESTER}
            </a>
          </dd>
          <dt>AttestationRegistry</dt>
          <dd>{DEPLOYMENTS.monadTestnet.addresses.attestationRegistry}</dd>
        </dl>
        {status?.relayer && (
          <p className={`note ${Number(status.relayer.balanceMon) < 0.3 ? 'warn' : ''}`}>
            relayer {status.relayer.address.slice(0, 10)}… · {Number(status.relayer.balanceMon).toFixed(3)} MON
          </p>
        )}
      </div>
    </>
  )
}
