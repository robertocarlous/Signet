import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Signet · Passkey Personhood',
  description:
    'Prove you are a real device holder with a passkey. One tap, no seed phrase — verified on-chain on Monad via the RIP-7212 P-256 precompile.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            ◈ Signet
          </Link>
          <nav>
            <Link href="/">Enrol</Link>
            <Link href="/verify">Verify</Link>
            <Link href="/sdk">SDK</Link>
            <a href="https://github.com/robertocarlous/Signet" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          Signet — the attestation layer for an AI-native internet. Live on Monad testnet (chain 10143).
        </footer>
      </body>
    </html>
  )
}
