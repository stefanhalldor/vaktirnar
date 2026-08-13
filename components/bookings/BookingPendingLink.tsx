'use client'

import { useState } from 'react'
import Link from 'next/link'

export function BookingPendingLink({
  href,
  pendingLabel,
  children,
  className,
  onNavigate,
}: {
  href: string
  pendingLabel: string
  children: React.ReactNode
  className: string
  onNavigate?: () => void
}) {
  const [pending, setPending] = useState(false)
  return (
    <Link
      href={href}
      prefetch={false}
      aria-disabled={pending || undefined}
      onClick={event => {
        if (
          event.defaultPrevented
          || event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey
        ) return
        event.preventDefault()
        if (pending) return
        onNavigate?.()
        setPending(true)
        // Detail pages carry private identifiers and can follow a page where
        // analytics was mounted. Paint feedback first, then unload the entire
        // document so scripts and client state cannot survive into the detail.
        window.requestAnimationFrame(() => {
          window.setTimeout(() => window.location.assign(href), 0)
        })
      }}
      className={className}
    >
      {pending ? pendingLabel : children}
    </Link>
  )
}
