'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Copy } from './_lib/ui'
import { REPO, SDK_NAV } from './_lib/constants'

export default function SdkLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const index = SDK_NAV.findIndex((item) => item.href === pathname)
  const current = index === -1 ? SDK_NAV[0] : SDK_NAV[index]
  const prev = index > 0 ? SDK_NAV[index - 1] : undefined
  const next = index !== -1 && index < SDK_NAV.length - 1 ? SDK_NAV[index + 1] : undefined

  return (
    <>
      {current.slug === 'quickstart' && (
        <div className="sdk-hero">
          <h1>@signetprotocol/evm-sdk</h1>
          <p>
            A <code>viem</code>-based TypeScript SDK for the Signet attestation protocol on Monad.
            Register schemas, write attestations — directly or <em>gasless</em> via EIP-712 delegation —
            and verify device-passkey personhood. Every helper reproduces the exact byte layout its
            contract uses, so you can compute ids and signatures offline and trust they&apos;ll match on
            chain.
          </p>
          <span className="install">
            npm install @signetprotocol/evm-sdk viem <Copy text="npm install @signetprotocol/evm-sdk viem" />
          </span>
          <div className="quicklinks">
            <a href={REPO} target="_blank" rel="noreferrer">Source & README ↗</a>
            <a href={`${REPO}/examples/monad-sdk.ts`} target="_blank" rel="noreferrer">Runnable example ↗</a>
            <a href={`${REPO}/test`} target="_blank" rel="noreferrer">Parity tests ↗</a>
            <a href="https://github.com/robertocarlous/Signet/tree/main/apps/docs" target="_blank" rel="noreferrer">Protocol docs ↗</a>
            <a href="/api/monad/contracts" target="_blank" rel="noreferrer">Deployments JSON ↗</a>
          </div>
        </div>
      )}

      <div className="layout">
        <nav className="toc">
          {SDK_NAV.map((item) => (
            <Link key={item.slug} href={item.href} className={item.href === pathname ? 'active' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div>
          <section className="sdk-section">{children}</section>

          <nav className="pager">
            {prev ? (
              <Link href={prev.href} className="pager-link pager-prev">
                <span className="pager-dir">← Previous</span>
                <span className="pager-label">{prev.label}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={next.href} className="pager-link pager-next">
                <span className="pager-dir">Next →</span>
                <span className="pager-label">{next.label}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
      </div>
    </>
  )
}
