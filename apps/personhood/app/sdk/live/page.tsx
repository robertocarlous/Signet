'use client'

import { useState } from 'react'
import { AttestLive, RegisterSchemaLive } from '../_lib/widgets'

export default function LivePage() {
  const [lastSchema, setLastSchema] = useState('')

  return (
    <>
      <h2>Live demo — write to Monad testnet</h2>
      <p>
        These call the SDK <strong>server-side</strong> through a funded relayer (a Next.js API
        route at <code>/api/sdk</code>, holding the key from the Quickstart client) — so you can
        fire a real transaction from this page without a wallet. This is the frontend/backend split
        in practice: this page never sees a private key, it only calls <code>fetch(&apos;/api/sdk&apos;)</code>.
        Every other widget on this site is pure and runs entirely in your browser.
      </p>
      <RegisterSchemaLive onUid={setLastSchema} />
      <AttestLive schemaUID={lastSchema} />
    </>
  )
}
