import { NextResponse } from 'next/server'
import { BaseError, ContractFunctionRevertedError, type Address, type Hex, isAddress } from 'viem'
import { toWebAuthnAuth } from '@signetprotocol/evm-sdk'
import { relayerClient } from '@/app/lib/signet'

export const runtime = 'nodejs'

interface Body {
  subject: Address
  x: Hex
  y: Hex
  authenticatorData: Hex
  clientDataJSON: string
  signature: Hex
}

const FRIENDLY: Record<string, { status: number; message: string }> = {
  PasskeyAlreadyEnrolled: { status: 409, message: 'This passkey has already claimed a personhood attestation.' },
  SubjectAlreadyVerified: { status: 409, message: 'This identity already holds a personhood attestation.' },
  BadPasskeySignature: { status: 422, message: 'The passkey signature did not verify on chain.' },
  InvalidPublicKey: { status: 400, message: 'The passkey public key is invalid.' },
}

/** Pull a decoded custom-error name out of a viem error, if present. */
function revertName(err: unknown): string | undefined {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.data?.errorName ?? reverted.reason ?? undefined
    }
  }
  return undefined
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
    const name = revertName(err)
    const raw = err instanceof Error ? err.message : String(err)

    if (name && FRIENDLY[name]) {
      return NextResponse.json({ error: FRIENDLY[name].message, code: name }, { status: FRIENDLY[name].status })
    }

    console.error('attestPersonhood failed:', name ?? '(no revert name)', '\n', raw)
    return NextResponse.json(
      { error: 'enrolment failed', code: name ?? null, detail: (name ? `${name}: ` : '') + raw.slice(0, 400) },
      { status: 500 },
    )
  }
}
