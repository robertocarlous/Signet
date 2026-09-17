import type { Metadata } from 'next'
import Link from 'next/link'
import MainShell from './MainShell'
import TopNav from './TopNav'
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
            <span className="mark">◈</span> Signet
          </Link>
          <TopNav />
        </header>
        <MainShell>{children}</MainShell>
        <footer>
          <div className="footer-inner">
            <span>Signet — the attestation layer for an AI-native internet.</span>
            <div className="footer-links">
              <a href="https://github.com/robertocarlous/Signet" target="_blank" rel="noreferrer">
                GitHub
              </a>
              <Link href="/sdk">SDK docs</Link>
              <a href="https://testnet.monadscan.com" target="_blank" rel="noreferrer">
                Explorer
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
