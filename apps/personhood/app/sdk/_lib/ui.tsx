'use client'

import { useState } from 'react'

export function Copy({ text }: { text: string }) {
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

export function Code({ children }: { children: string }) {
  return (
    <div className="code-wrap">
      <Copy text={children} />
      <pre className="code">
        <code>{children}</code>
      </pre>
    </div>
  )
}

export function Field({
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

export function Result({ type, value, error }: { type: string; value?: string; error?: string }) {
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

export function Widget({
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

export function safe<T>(fn: () => T): { value?: T; error?: string } {
  try {
    return { value: fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
