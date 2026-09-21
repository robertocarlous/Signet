import { NextResponse } from 'next/server'
import { BaseError, ContractFunctionRevertedError, type Address, type Hex, isAddress } from 'viem'
import { toWebAuthnAuth } from '@signetprotocol/evm-sdk'
import { readClient, relayerClient } from '@/app/lib/signet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  subject: Address
  guardians: Address[]
  threshold: number
  authenticatorData: Hex
  clientDataJSON: string
  signature: Hex
}

const FRIENDLY: Record<string, { status: number; message: string }> = {
  NotEnrolled: { status: 409, message: "This identity doesn't hold a personhood attestation yet — enrol first." },
  TooFewGuardians: { status: 400, message: 'Pick at least 2 guardians.' },
  InvalidThreshold: { status: 400, message: 'Threshold must be between 2 and the number of guardians.' },
  DuplicateGuardian: { status: 400, message: 'The same address was listed twice.' },
  BadPasskeySignature: { status: 422, message: 'The passkey signature did not verify on chain.' },
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

/** Current guardians/threshold/nonces for `?address=`. Public read — no relayer needed. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address')
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'pass ?address=0x...' }, { status: 400 })
  }

  const signet = readClient()
  try {
    const [guardians, threshold, setGuardiansNonce, recoveryNonce] = await Promise.all([
      signet.guardiansOf(address),
      signet.guardianThreshold(address),
      signet.guardianNonce(address),
      signet.recoveryNonce(address),
    ])
    return NextResponse.json({
      address,
      guardians,
      threshold,
      setGuardiansNonce: setGuardiansNonce.toString(),
      recoveryNonce: recoveryNonce.toString(),
    })
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'lookup failed', detail: text.slice(0, 300) }, { status: 500 })
  }
}

/** Set (or rotate) `subject`'s recovery guardians — the current passkey must have signed. */
export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { subject, guardians, threshold, authenticatorData, clientDataJSON, signature } = body
  if (
    !subject ||
    !isAddress(subject) ||
    !Array.isArray(guardians) ||
    guardians.length < 2 ||
    !guardians.every((g) => isAddress(g)) ||
    !threshold ||
    !authenticatorData ||
    !clientDataJSON ||
    !signature
  ) {
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
    const { hash } = await relayer.client.setGuardians({ subject, guardians, threshold, auth })
    return NextResponse.json({ txHash: hash })
  } catch (err) {
    const name = revertName(err)
    const raw = err instanceof Error ? err.message : String(err)

    if (name && FRIENDLY[name]) {
      return NextResponse.json({ error: FRIENDLY[name].message, code: name }, { status: FRIENDLY[name].status })
    }

    console.error('setGuardians failed:', name ?? '(no revert name)', '\n', raw)
    return NextResponse.json(
      { error: 'setting guardians failed', code: name ?? null, detail: (name ? `${name}: ` : '') + raw.slice(0, 400) },
      { status: 500 },
    )
  }
}
