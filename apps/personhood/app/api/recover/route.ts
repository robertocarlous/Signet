import { NextResponse } from 'next/server'
import { BaseError, ContractFunctionRevertedError, type Address, type Hex, isAddress } from 'viem'
import { toWebAuthnAuth } from '@signetprotocol/evm-sdk'
import { relayerClient } from '@/app/lib/signet'

export const runtime = 'nodejs'

interface Body {
  subject: Address
  newX: Hex
  newY: Hex
  deadline: string
  /** One EIP-712 signature per guardian, collected client-side from their own wallets. */
  guardianSignatures: Hex[]
  /** The NEW passkey's assertion over `recoveryChallenge(subject, newX, newY, nonce)`. */
  authenticatorData: Hex
  clientDataJSON: string
  signature: Hex
}

const FRIENDLY: Record<string, { status: number; message: string }> = {
  NotEnrolled: { status: 409, message: "This identity doesn't hold a personhood attestation to recover." },
  NoGuardiansConfigured: { status: 409, message: 'No recovery guardians were ever configured for this identity.' },
  InsufficientGuardianApprovals: {
    status: 422,
    message: "Not enough valid guardian signatures — check they signed the current nonce/deadline and haven't expired.",
  },
  PasskeyAlreadyEnrolled: { status: 409, message: 'That new passkey has already claimed a different personhood attestation.' },
  BadPasskeySignature: { status: 422, message: 'The new passkey signature did not verify on chain.' },
  ExpiredSignature: { status: 422, message: 'The recovery deadline has passed — start over with a fresh one.' },
}

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

  const { subject, newX, newY, deadline, guardianSignatures, authenticatorData, clientDataJSON, signature } = body
  if (
    !subject ||
    !isAddress(subject) ||
    !newX ||
    !newY ||
    !deadline ||
    !Array.isArray(guardianSignatures) ||
    guardianSignatures.length === 0 ||
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
    const newAuth = toWebAuthnAuth({ authenticatorData, clientDataJSON, signature })
    const { hash, uid } = await relayer.client.recoverPersonhood({
      subject,
      newX: BigInt(newX),
      newY: BigInt(newY),
      deadline: BigInt(deadline),
      guardianSignatures,
      newAuth,
    })
    return NextResponse.json({ txHash: hash, uid })
  } catch (err) {
    const name = revertName(err)
    const raw = err instanceof Error ? err.message : String(err)

    if (name && FRIENDLY[name]) {
      return NextResponse.json({ error: FRIENDLY[name].message, code: name }, { status: FRIENDLY[name].status })
    }

    console.error('recoverPersonhood failed:', name ?? '(no revert name)', '\n', raw)
    return NextResponse.json(
      { error: 'recovery failed', code: name ?? null, detail: (name ? `${name}: ` : '') + raw.slice(0, 400) },
      { status: 500 },
    )
  }
}
