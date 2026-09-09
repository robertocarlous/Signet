import { createPublicClient, createWalletClient, defineChain, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DEPLOYMENTS, SignetClient } from '@signetprotocol/evm-sdk'

const RPC_URL = process.env.MONAD_RPC_URL ?? 'https://rpc.ankr.com/monad_testnet'

export const monadTestnet = defineChain({
  id: DEPLOYMENTS.monadTestnet.chainId,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'MonadScan', url: 'https://testnet.monadscan.com' } },
  testnet: true,
})

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) })

/** Read-only client — safe anywhere. */
export function readClient() {
  return new SignetClient({ chain: 'monadTestnet', publicClient })
}

/** Relayer client — SERVER ONLY. Throws if the key is missing. */
export function relayerClient() {
  const pk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined
  if (!pk || pk === '0x') throw new Error('RELAYER_PRIVATE_KEY is not set')
  const account = privateKeyToAccount(pk)
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) })
  return { client: new SignetClient({ chain: 'monadTestnet', publicClient, walletClient }), account }
}

export const ADDRESSES = DEPLOYMENTS.monadTestnet.addresses
export const EXPLORER = 'https://testnet.monadscan.com'
