'use client'

import { usePathname } from 'next/navigation'

/**
 * `<main>` is capped at 640px globally for the narrow Enrol/Verify forms.
 * The /sdk section is a two-column docs layout and needs the full width —
 * this is a client component (not the root layout) only so it can read the
 * pathname; `layout.tsx` stays a server component so `metadata` still works.
 */
export default function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const wide = pathname?.startsWith('/sdk')
  return <main className={wide ? 'main-wide' : undefined}>{children}</main>
}
