'use client'

import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'

interface BookkeepingPendingLinkProps {
  href: string
  ariaLabel: string
  className: string
  children: ReactNode
}

function isLocalNavigationClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && event.currentTarget.target !== '_blank'
}

export function BookkeepingPendingLink({
  href,
  ariaLabel,
  className,
  children,
}: BookkeepingPendingLinkProps) {
  const [pending, setPending] = useState(false)

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      className={className}
      onClick={(event) => {
        if (pending) {
          event.preventDefault()
          return
        }
        if (isLocalNavigationClick(event)) setPending(true)
      }}
    >
      {pending ? <LoaderCircle aria-hidden size={20} className="animate-spin" /> : children}
    </Link>
  )
}
