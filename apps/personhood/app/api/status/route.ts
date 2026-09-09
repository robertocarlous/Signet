import { NextResponse } from 'next/server'
import { type Hex, formatEther, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ADDRESSES, publicClient, readClient } from '@/app/lib/signet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address')
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'pass ?address=0x...' }, { status: 400 })
  }

  const signet = readClient()

  let relayer: { address: string; balanceMon: string } | undefined
  const pk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined
  if (pk && pk !== '0x') {
    try {
      const acc = privateKeyToAccount(pk)
      const bal = await publicClient.getBalance({ address: acc.address })
      relayer = { address: acc.address, balanceMon: formatEther(bal) }
    } catch {
      /* ignore */
    }
  }

  try {
    const uid = await signet.personhoodOf(address)
    if (!uid || uid === ZERO) {
      return NextResponse.json({ address, verified: false, contracts: ADDRESSES, relayer })
    }

    const [attestation, isValid] = await Promise.all([signet.getAttestation(uid), signet.isValid(uid)])
    return NextResponse.json({
      address,
      verified: isValid,
      attestation: {
        uid,
        schemaUID: attestation.schemaUID,
        subject: attestation.subject,
        attester: attestation.attester,
        time: attestation.time.toString(),
        revoked: attestation.revoked,
        data: attestation.data,
      },
      contracts: ADDRESSES,
      relayer,
    })
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'lookup failed', detail: text.slice(0, 300) }, { status: 500 })
  }
}
