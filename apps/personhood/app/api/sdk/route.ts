import { NextResponse } from 'next/server'
import { type Address, type Hex, isAddress, isHex } from 'viem'
import { relayerClient } from '@/app/lib/signet'

export const runtime = 'nodejs'

type Body =
  | { action: 'registerSchema'; definition: string; revocable?: boolean; resolver?: Address }
  | { action: 'attest'; schemaUID: Hex; subject: Address; data?: Hex }

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  let relayer
  try {
    relayer = relayerClient()
  } catch {
    return NextResponse.json({ error: 'relayer is not configured on this deployment' }, { status: 503 })
  }
  const { client } = relayer

  try {
    if (body.action === 'registerSchema') {
      if (!body.definition || body.definition.trim().length === 0) {
        return NextResponse.json({ error: 'definition is required' }, { status: 400 })
      }
      const { hash, uid } = await client.registerSchema({
        definition: body.definition,
        revocable: body.revocable ?? true,
        resolver: body.resolver && isAddress(body.resolver) ? body.resolver : undefined,
      })
      return NextResponse.json({ uid, txHash: hash })
    }

    if (body.action === 'attest') {
      if (!isHex(body.schemaUID) || !isAddress(body.subject)) {
        return NextResponse.json({ error: 'schemaUID (0x bytes32) and subject (0x address) are required' }, { status: 400 })
      }
      const { hash, uid } = await client.attest({
        schemaUID: body.schemaUID,
        subject: body.subject,
        data: body.data && isHex(body.data) ? body.data : '0x',
      })
      return NextResponse.json({ uid, txHash: hash })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (err) {
    const detail = (err instanceof Error ? err.message : String(err)).slice(0, 400)
    console.error('sdk route failed:', detail)
    return NextResponse.json({ error: 'call failed', detail }, { status: 500 })
  }
}
