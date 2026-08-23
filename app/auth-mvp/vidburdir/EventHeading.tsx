'use client'

import { useEffect, useRef } from 'react'
import { EVENT_HEADING_HASH } from '@/lib/events/contracts'

export function EventHeading({ title }: { title: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (window.location.hash !== EVENT_HEADING_HASH) return

    const focusHeading = () => headingRef.current?.focus()
    const usesAnimationFrame = typeof window.requestAnimationFrame === 'function'
    const scheduledFocus = usesAnimationFrame
      ? window.requestAnimationFrame(focusHeading)
      : window.setTimeout(focusHeading, 0)

    return () => {
      if (usesAnimationFrame && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(scheduledFocus)
      } else {
        window.clearTimeout(scheduledFocus)
      }
    }
  }, [])

  return (
    <h1
      ref={headingRef}
      id={EVENT_HEADING_HASH.slice(1)}
      tabIndex={-1}
      className="min-w-0 flex-1 break-words text-pretty text-lg font-semibold leading-tight text-primary"
    >
      {title}
    </h1>
  )
}
