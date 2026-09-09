import type { Address, Hex } from 'viem'
import type { SignetAddresses } from './types'

/**
 * Canonical Signet deployments. Kept in sync with
 * `contracts/evm/deployments.json` (served by the indexer at `/api/contracts`).
 */
export const DEPLOYMENTS = {
  monadTestnet: {
    chainId: 10143,
    addresses: {
      schemaRegistry: '0x2eb183fFd7D40866DEA68f2173C4C5a604D22602',
      attestationRegistry: '0x4A48BE178900874FF1E5c2cF91E0B56f67d5359C',
      passkeyAttester: '0x5A99835d5E7434BBf3e44Cc6A3E76b762045c48d',
      personhoodResolver: '0xcf5b29668EB4Ea1dC51BA596c41bb2E722425100',
      personhoodSchemaUID: '0x6e29449805b2f822cdbaea9ca4bbc8758addb90d9ac2206e6d6156a51cac74e4',
    } satisfies SignetAddresses,
  },
} as const satisfies Record<string, { chainId: number; addresses: SignetAddresses }>

export type DeploymentKey = keyof typeof DEPLOYMENTS

export function getDeployment(chain: DeploymentKey): {
  chainId: number
  addresses: SignetAddresses
} {
  const d = DEPLOYMENTS[chain]
  if (!d) throw new Error(`unknown Signet deployment: ${String(chain)}`)
  return d as { chainId: number; addresses: SignetAddresses }
}

// Re-exports for convenience.
export const MONAD_TESTNET_CHAIN_ID = DEPLOYMENTS.monadTestnet.chainId
export const MONAD_TESTNET: SignetAddresses = DEPLOYMENTS.monadTestnet.addresses as SignetAddresses
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex
