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
      // Social-recovery-capable PasskeyAttester (setGuardians / recoverPersonhood). Supersedes
      // 0x5A99835d5E7434BBf3e44Cc6A3E76b762045c48d — not an upgrade (no admin/upgrade path by
      // design), a parallel deployment. Attestations under the old attester remain valid.
      passkeyAttester: '0xfFBCd844DA4F5CaBBa36f60e4f17cEfe00029c8A',
      personhoodResolver: '0x9eF15a8383a3564b62FbA13759B3C5c5C6c8FBBD',
      personhoodSchemaUID: '0x6171b49bd97f67cab946cc7fe562c49faeb093fdd30ad438f7358b85849a26b6',
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
