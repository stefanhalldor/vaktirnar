'use client'

import { useCallback, useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'

export function HouseholdChoreAuthorityBoundary({
  children,
  loadingLabel,
  fallbackIdeaTitle,
}: {
  children: React.ReactNode
  loadingLabel: string
  fallbackIdeaTitle: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const checkedPathRef = useRef(pathname)
  const refreshInFlightRef = useRef(false)
  const [isPending, startTransition] = useTransition()
  const pathChanged = checkedPathRef.current !== pathname

  const refreshAuthority = useCallback(() => {
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  useEffect(() => {
    if (!isPending) refreshInFlightRef.current = false
  }, [isPending])

  useEffect(() => {
    if (!pathChanged) return
    checkedPathRef.current = pathname
    refreshAuthority()
  }, [pathChanged, pathname, refreshAuthority])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshAuthority()
    }
    const refreshOnPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshAuthority()
    }

    window.addEventListener('pageshow', refreshOnPageShow)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('pageshow', refreshOnPageShow)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshAuthority])

  if (isPending || pathChanged) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <TeskeidLoader
          ideaTitles={[]}
          loadingLabel={loadingLabel}
          fallbackIdeaTitle={fallbackIdeaTitle}
        />
      </div>
    )
  }

  return children
}
