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
          <div className="topbar-left">
            <Link href="/" className="brand">
              <span className="mark">◈</span> Signet
            </Link>
            <span className="tagline">the attestation layer for an AI-native internet</span>
          </div>
          <TopNav />
        </header>
        <MainShell>{children}</MainShell>
      </body>
    </html>
  )
}
