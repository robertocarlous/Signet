'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address, Hex } from 'viem'
import { DEPLOYMENTS, buildPersonhoodChallenge } from '@signetprotocol/evm-sdk'
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

export default function EnrolPage() {
  const [supported, setSupported] = useState(true)
  const [passkey, setPasskey] = useState<StoredPasskey | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [status, setStatus] = useState<StatusResp | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<string>('')

  const rpId = process.env.NEXT_PUBLIC_RP_ID || (typeof window !== 'undefined' ? window.location.hostname : 'localhost')

  const identity: Address | null = useMemo(() => {
    if (!passkey) return null
    return identityAddress(BigInt(passkey.x), BigInt(passkey.y))
  }, [passkey])

  const refreshStatus = useCallback(async (addr: Address) => {
    try {
      const r = await fetch(`/api/status?address=${addr}`, { cache: 'no-store' })
      if (r.ok) setStatus((await r.json()) as StatusResp)
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

      {!supported && (
        <div className="card">
          <p className="error">
            This browser doesn&apos;t expose WebAuthn / passkeys. Try Chrome or Safari on a device with a
            biometric sensor.
          </p>
        </div>
      )}

      <div className="card">
        <h2>1 · Your Signet identity</h2>
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
          <h2>2 · Enrol</h2>
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

      <div className="card">
        <h2>Contracts (Monad testnet)</h2>
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
