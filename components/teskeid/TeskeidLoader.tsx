'use client'

import { useState, useEffect, useMemo } from 'react'
import { TeskeidLogo } from './TeskeidLogo'

export interface TeskeidLoaderProps {
  ideaTitles: string[]
  loadingLabel: string
  fallbackIdeaTitle: string
  intervalMs?: number
  className?: string
}

const MAX_TITLES = 10

export function TeskeidLoader({
  ideaTitles,
  loadingLabel,
  fallbackIdeaTitle,
  intervalMs = 1000,
  className,
}: TeskeidLoaderProps) {
  const titles = useMemo(() => {
    const cleaned = Array.from(
      new Set(ideaTitles.map((t) => t.trim()).filter(Boolean))
    ).slice(0, MAX_TITLES)
    return cleaned.length > 0 ? cleaned : [fallbackIdeaTitle]
  }, [ideaTitles, fallbackIdeaTitle])

  const [index, setIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (reducedMotion || titles.length <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % titles.length), intervalMs)
    return () => clearInterval(id)
  }, [reducedMotion, titles.length, intervalMs])

  return (
    <div
      role="status"
      aria-label={loadingLabel}
      className={`flex flex-col items-center justify-center gap-6 ${className ?? ''}`}
    >
      <div className={reducedMotion ? undefined : 'animate-pulse'}>
        <TeskeidLogo size={160} decorative className="sm:hidden" />
        <TeskeidLogo size={180} decorative className="hidden sm:block" />
      </div>
      <p
        aria-hidden="true"
        className="h-6 text-sm text-[#72796e] text-center"
      >
        {titles[index]}
      </p>
    </div>
  )
}
