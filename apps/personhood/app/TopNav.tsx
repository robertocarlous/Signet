'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Enrol' },
  { href: '/verify', label: 'Verify' },
  { href: '/sdk', label: 'SDK' },
]

export default function TopNav() {
  const pathname = usePathname()
  return (
    <nav>
      {LINKS.map(({ href, label }) => {
        const active = href === '/' ? pathname === '/' : pathname?.startsWith(href)
        return (
          <Link key={href} href={href} className={active ? 'active' : undefined}>
            {label}
          </Link>
        )
      })}
      <a href="https://github.com/robertocarlous/Signet" target="_blank" rel="noreferrer">
        GitHub
      </a>
    </nav>
  )
}
