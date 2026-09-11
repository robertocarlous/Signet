import { DEPLOYMENTS } from '@signetprotocol/evm-sdk'
import type { Address } from 'viem'

export const A = DEPLOYMENTS.monadTestnet.addresses
export const CHAIN_ID = DEPLOYMENTS.monadTestnet.chainId
export const EXPLORER = 'https://testnet.monadscan.com'
export const DEPLOYER = '0x1780df035b6D25138D729351aF85278d3A719fcD' as Address
export const REPO = 'https://github.com/robertocarlous/Signet/tree/main/packages/evm-sdk'

export interface SdkNavItem {
  slug: string
  href: string
  label: string
}

/** Order here drives the sidebar and the Previous/Next pager — keep them in sync. */
export const SDK_NAV: SdkNavItem[] = [
  { slug: 'quickstart', href: '/sdk', label: 'Quickstart' },
  { slug: 'how-it-fits', href: '/sdk/how-it-fits', label: 'How it fits' },
  { slug: 'schemas', href: '/sdk/schemas', label: 'Schemas' },
  { slug: 'attestations', href: '/sdk/attestations', label: 'Attestations' },
  { slug: 'delegated', href: '/sdk/delegated', label: 'Delegated (gasless)' },
  { slug: 'personhood', href: '/sdk/personhood', label: 'Passkey personhood' },
  { slug: 'reads', href: '/sdk/reads', label: 'Reads & verify' },
  { slug: 'troubleshooting', href: '/sdk/troubleshooting', label: 'Troubleshooting' },
  { slug: 'live', href: '/sdk/live', label: 'Live demo' },
  { slug: 'api', href: '/sdk/api', label: 'API reference' },
]
