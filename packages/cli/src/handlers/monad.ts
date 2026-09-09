import { BaseHandler, HandlerArgs } from './base'
import { logger } from '../logger'

/**
 * Monad / EVM handler — thin wrapper over `@signetprotocol/evm-sdk`.
 *
 * Key file: a 0x-prefixed private key (plain text) or a JSON object with a
 * `privateKey` field. Everything targets Monad testnet (chain 10143) unless
 * `--url` overrides the RPC.
 */
export class MonadHandler extends BaseHandler {
  private client: any
  private account: any

  async initialize(keyData: string, url?: string): Promise<boolean> {
    try {
      const { createPublicClient, createWalletClient, http } = await import('viem')
      const { privateKeyToAccount } = await import('viem/accounts')
      const { SignetClient, DEPLOYMENTS } = await import('@signetprotocol/evm-sdk')

      let pk = keyData.trim()
      try {
        const parsed = JSON.parse(keyData)
        pk = parsed.privateKey ?? parsed.secret ?? pk
      } catch {
        /* plain text key */
      }
      if (!pk.startsWith('0x')) pk = `0x${pk}`

      const rpcUrl = url ?? 'https://rpc.ankr.com/monad_testnet'
      const chain = {
        id: DEPLOYMENTS.monadTestnet.chainId,
        name: 'Monad Testnet',
        nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      } as const

      this.account = privateKeyToAccount(pk as `0x${string}`)
      const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
      const walletClient = createWalletClient({ account: this.account, chain, transport: http(rpcUrl) })
      this.client = new SignetClient({ chain: 'monadTestnet', publicClient, walletClient })
      this.initialized = true

      this.logSuccess(`Monad handler ready — signer ${this.account.address}`)
      return true
    } catch (error: any) {
      this.logError(`Monad init failed: ${error.message}`)
      return false
    }
  }

  async check(action: string, args: HandlerArgs): Promise<boolean> {
    if (!this.initialized) {
      this.logError('Handler not initialized')
      return false
    }
    this.logAction(action, args.type, 'monad')

    try {
      if (args.type === 'schema') return await this.schema(action, args)
      if (args.type === 'attestation') return await this.attestation(action, args)
      this.logError(`Unsupported type on monad: ${args.type} (try: schema, attestation)`)
      return false
    } catch (error: any) {
      this.logError(error.shortMessage ?? error.message ?? String(error))
      return false
    }
  }

  private async schema(action: string, args: HandlerArgs): Promise<boolean> {
    if (action === 'create') {
      const c = args.content ?? {}
      const definition: string = typeof c.definition === 'string' ? c.definition : JSON.stringify(c)
      const resolver = c.resolver as `0x${string}` | undefined
      const revocable = c.revocable ?? true
      const { hash, uid } = await this.client.registerSchema({ definition, resolver, revocable })
      this.logSuccess('Schema registered')
      this.logResult('result', { uid, txHash: hash, definition, resolver: resolver ?? null, revocable })
      return true
    }
    if (action === 'fetch') {
      const schema = await this.client.getSchema(args.uid as `0x${string}`)
      this.logResult('schema', schema)
      return true
    }
    this.logError(`Unknown schema action: ${action}`)
    return false
  }

  private async attestation(action: string, args: HandlerArgs): Promise<boolean> {
    if (action === 'create') {
      const c = args.content ?? {}
      if (!c.schemaUID || !c.subject) throw new Error('attestation JSON needs `schemaUID` and `subject`')
      const { hash, uid } = await this.client.attest({
        schemaUID: c.schemaUID,
        subject: c.subject,
        data: c.data ?? '0x',
        expirationTime: c.expirationTime ? BigInt(c.expirationTime) : 0n,
      })
      this.logSuccess('Attestation created')
      this.logResult('result', { uid, txHash: hash })
      return true
    }
    if (action === 'fetch') {
      const att = await this.client.getAttestation(args.uid as `0x${string}`)
      const valid = await this.client.isValid(args.uid as `0x${string}`)
      this.logResult('attestation', { ...att, isValid: valid })
      return true
    }
    if (action === 'revoke') {
      const { hash } = await this.client.revoke(args.uid as `0x${string}`)
      this.logSuccess('Attestation revoked')
      this.logResult('result', { txHash: hash })
      return true
    }
    this.logError(`Unknown attestation action: ${action}`)
    return false
  }

  // BaseHandler.logResult uses JSON.stringify, which throws on BigInt — pre-serialize.
  protected logResult(label: string, result: any) {
    const safe = JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    logger.log(`${label}:`, JSON.stringify(safe, null, 2))
  }
}
