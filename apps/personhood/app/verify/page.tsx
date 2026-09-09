'use client'

import { useState } from 'react'
import { isAddress } from 'viem'

const EXPLORER = 'https://testnet.monadscan.com'

interface StatusResp {
  address: string
  verified: boolean
  attestation?: {
    uid: string
    schemaUID: string
    subject: string
    attester: string
    time: string
    revoked: boolean
    data: string
  }
  error?: string
}

export default function VerifyPage() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<StatusResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setError(null)
    setResult(null)
    const addr = input.trim()
    if (!isAddress(addr)) {
      setError('Enter a valid 0x address.')
      return
    }
    setLoading(true)
    try {
      const r = await fetch(`/api/status?address=${addr}`, { cache: 'no-store' })
      const data = (await r.json()) as StatusResp
      if (!r.ok) throw new Error(data.error || 'lookup failed')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>Verify personhood</h1>
      <p className="lede">
        Anyone can check whether an address holds a valid Signet personhood attestation — no API key, no
        middleman. This reads <code>PasskeyAttester.personhoodOf</code> and the attestation registry
        directly.
      </p>

      <div className="card">
        <div className="row">
          <input
            type="text"
            placeholder="0x… address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <button onClick={check} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Check'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {result && (
        <div className="card">
          <span className={`badge ${result.verified ? 'ok' : 'no'}`}>
            {result.verified ? '✔ Personhood verified' : '✕ No valid personhood attestation'}
          </span>
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>address</dt>
            <dd>{result.address}</dd>
            {result.attestation && (
              <>
                <dt>attestation uid</dt>
                <dd>{result.attestation.uid}</dd>
                <dt>attester</dt>
                <dd>
                  <a
                    className="link"
                    href={`${EXPLORER}/address/${result.attestation.attester}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {result.attestation.attester}
                  </a>{' '}
                  (PasskeyAttester)
                </dd>
                <dt>schema</dt>
                <dd>{result.attestation.schemaUID}</dd>
                <dt>issued</dt>
                <dd>{new Date(Number(result.attestation.time) * 1000).toISOString()}</dd>
                <dt>revoked</dt>
                <dd>{String(result.attestation.revoked)}</dd>
                <dt>data (x, y)</dt>
                <dd>{result.attestation.data}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </>
  )
}
