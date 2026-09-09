import { NextResponse } from 'next/server'
import { type Address, type Hex, isAddress } from 'viem'
import { toWebAuthnAuth } from '@signetprotocol/evm-sdk'
import { relayerClient } from '@/app/lib/signet'

export const runtime = 'nodejs'

interface Body {
  subject: Address
  x: Hex
  y: Hex
  authenticatorData: Hex
  clientDataJSON: Hex
  signature: Hex
}

const KNOWN_ERRORS: Record<string, { status: number; message: string }> = {
  PasskeyAlreadyEnrolled: { status: 409, message: 'This passkey has already claimed a personhood attestation.' },
  SubjectAlreadyVerified: { status: 409, message: 'This identity already holds a personhood attestation.' },
  BadPasskeySignature: { status: 422, message: 'The passkey signature did not verify on chain.' },
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { subject, x, y, authenticatorData, clientDataJSON, signature } = body
  if (!subject || !isAddress(subject) || !x || !y || !authenticatorData || !clientDataJSON || !signature) {
    return NextResponse.json({ error: 'missing or invalid fields' }, { status: 400 })
  }

  let relayer
  try {
    relayer = relayerClient()
  } catch {
    return NextResponse.json({ error: 'relayer is not configured on this deployment' }, { status: 503 })
  }

  try {
    const auth = toWebAuthnAuth({ authenticatorData, clientDataJSON, signature })
    const { hash, uid } = await relayer.client.attestPersonhood({
      subject,
      x: BigInt(x),
      y: BigInt(y),
      auth,
    })
    return NextResponse.json({ txHash: hash, uid })
  } catch (err) {
    const text = err instanceof Error ? `${err.message}` : String(err)
    for (const [name, mapped] of Object.entries(KNOWN_ERRORS)) {
      if (text.includes(name)) return NextResponse.json({ error: mapped.message, code: name }, { status: mapped.status })
    }
    console.error('attestPersonhood failed:', text)
    return NextResponse.json({ error: 'enrolment failed', detail: text.slice(0, 300) }, { status: 500 })
  }
}
