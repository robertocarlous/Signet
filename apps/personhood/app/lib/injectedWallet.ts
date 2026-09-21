'use client'

/**
 * Minimal EIP-1193 wrapper for guardian signing during recovery. No wallet SDK —
 * `window.ethereum` is a browser-native provider (MetaMask, Rabby, Coinbase Wallet,
 * ...) and `eth_signTypedData_v4` is all a guardian needs to do here.
 */

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

function getProvider(): Eip1193Provider {
  const eth = (globalThis as { ethereum?: Eip1193Provider }).ethereum
  if (!eth) throw new Error('No browser wallet found — install MetaMask (or similar) to sign as a guardian.')
  return eth
}

/** Prompt the guardian to connect a wallet; returns the account they chose. */
export async function connectWallet(): Promise<`0x${string}`> {
  const eth = getProvider()
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
  const account = accounts[0]
  if (!account) throw new Error('no account returned by the wallet')
  return account as `0x${string}`
}

/** Sign EIP-712 typed data (viem's `{ domain, types, primaryType, message }` shape) with the connected wallet. */
export async function signTypedData(account: `0x${string}`, typedData: unknown): Promise<`0x${string}`> {
  const eth = getProvider()
  const payload = JSON.stringify(typedData, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
  const signature = (await eth.request({
    method: 'eth_signTypedData_v4',
    params: [account, payload],
  })) as string
  return signature as `0x${string}`
}
