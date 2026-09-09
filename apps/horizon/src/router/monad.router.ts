import { Router } from 'express'
import { createPublicClient, http, parseAbiItem, type Address, type Hex } from 'viem'
import { DEPLOYMENTS, SignetClient } from '@signetprotocol/evm-sdk'

/**
 * Read gateway for Signet on Monad. No database — this proxies `eth_getLogs`
 * and contract reads over the deployed Signet contracts so clients get a stable
 * HTTP surface instead of each doing their own log queries.
 *
 * Mounted at /api/monad.
 */
const router = Router()

const RPC_URL = process.env.MONAD_RPC_URL ?? 'https://rpc.ankr.com/monad_testnet'
const { chainId, addresses } = DEPLOYMENTS.monadTestnet

const publicClient = createPublicClient({ transport: http(RPC_URL) })
const signet = new SignetClient({ chain: 'monadTestnet', publicClient })

const SCHEMA_REGISTERED = parseAbiItem(
  'event SchemaRegistered(bytes32 indexed uid, address indexed authority, address resolver, bool revocable, string definition)',
)
const ATTESTED = parseAbiItem(
  'event Attested(bytes32 indexed uid, bytes32 indexed schemaUID, address indexed subject, address attester, uint64 nonce, uint64 time)',
)

// Monad public RPCs cap eth_getLogs at ~100 blocks, so we scan backward in
// small windows from `latest` until we have enough rows or hit the scan floor.
const CHUNK = 100n
const MAX_CHUNKS = 60 // ~6000 blocks of look-back by default

const bigintJson = (obj: unknown) =>
  JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))

interface ScanOpts {
  address: Address
  event: ReturnType<typeof parseAbiItem>
  args?: Record<string, unknown>
  limit: number
  fromBlock?: string
}

async function scanLogsBackward({ address, event, args, limit, fromBlock }: ScanOpts) {
  const latest = await publicClient.getBlockNumber()
  const floor = fromBlock ? BigInt(fromBlock) : latest > CHUNK * BigInt(MAX_CHUNKS) ? latest - CHUNK * BigInt(MAX_CHUNKS) : 0n

  const collected: Awaited<ReturnType<typeof publicClient.getLogs>> = []
  let to = latest
  while (to >= floor && collected.length < limit) {
    const from = to > CHUNK ? to - CHUNK + 1n : 0n
    const logs = await publicClient.getLogs({ address, event: event as never, args: args as never, fromBlock: from, toBlock: to })
    collected.push(...logs)
    if (from === 0n) break
    to = from - 1n
  }
  // newest first
  collected.sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
  return { latest, floor, logs: collected.slice(0, limit) }
}

router.get('/health', async (_req, res, next) => {
  try {
    const blockNumber = await publicClient.getBlockNumber()
    res.json({ ok: true, chainId, rpc: RPC_URL, blockNumber: blockNumber.toString() })
  } catch (err) {
    next(err)
  }
})

router.get('/contracts', (_req, res) => {
  res.json({ chainId, explorer: 'https://testnet.monadscan.com', addresses })
})

router.get('/schemas', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200)
    const { latest, floor, logs } = await scanLogsBackward({
      address: addresses.schemaRegistry as Address,
      event: SCHEMA_REGISTERED,
      limit,
      fromBlock: req.query.fromBlock as string | undefined,
    })
    const schemas = logs.map((l) => ({
      uid: (l as any).args.uid,
      authority: (l as any).args.authority,
      resolver: (l as any).args.resolver,
      revocable: (l as any).args.revocable,
      definition: (l as any).args.definition,
      blockNumber: l.blockNumber?.toString(),
      txHash: l.transactionHash,
    }))
    res.json(bigintJson({ scannedTo: latest, scannedFrom: floor, count: schemas.length, schemas }))
  } catch (err) {
    next(err)
  }
})

router.get('/schemas/:uid', async (req, res, next) => {
  try {
    const schema = await signet.getSchema(req.params.uid as Hex)
    res.json(bigintJson({ uid: req.params.uid, ...schema }))
  } catch (err) {
    next(err)
  }
})

router.get('/attestations', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200)
    const { latest, floor, logs } = await scanLogsBackward({
      address: addresses.attestationRegistry as Address,
      event: ATTESTED,
      args: {
        ...(req.query.schemaUID ? { schemaUID: req.query.schemaUID as Hex } : {}),
        ...(req.query.subject ? { subject: req.query.subject as Address } : {}),
      },
      limit,
      fromBlock: req.query.fromBlock as string | undefined,
    })
    const attestations = await Promise.all(
      logs.map(async (l) => ({
        uid: (l as any).args.uid,
        schemaUID: (l as any).args.schemaUID,
        subject: (l as any).args.subject,
        attester: (l as any).args.attester,
        nonce: (l as any).args.nonce?.toString(),
        time: (l as any).args.time?.toString(),
        isValid: await signet.isValid((l as any).args.uid as Hex),
        blockNumber: l.blockNumber?.toString(),
        txHash: l.transactionHash,
      })),
    )
    res.json(bigintJson({ scannedTo: latest, scannedFrom: floor, count: attestations.length, attestations }))
  } catch (err) {
    next(err)
  }
})

router.get('/attestations/:uid', async (req, res, next) => {
  try {
    const uid = req.params.uid as Hex
    const [attestation, isValid] = await Promise.all([signet.getAttestation(uid), signet.isValid(uid)])
    res.json(bigintJson({ ...attestation, isValid }))
  } catch (err) {
    next(err)
  }
})

router.get('/personhood/:address', async (req, res, next) => {
  try {
    const address = req.params.address as Address
    const uid = await signet.personhoodOf(address)
    const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'
    if (!uid || uid === ZERO) {
      res.json({ address, verified: false })
      return
    }
    const [attestation, isValid] = await Promise.all([signet.getAttestation(uid), signet.isValid(uid)])
    res.json(bigintJson({ address, verified: isValid, attestation }))
  } catch (err) {
    next(err)
  }
})

export default router
