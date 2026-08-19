'use client'

import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type NavigationMode = 'push' | 'replace'
const DEFAULT_RECOVERY_TIMEOUT_MS = 30_000

interface TeskeidNavigationFeedbackValue {
  navigate: (href: string, mode?: NavigationMode) => void
}

const TeskeidNavigationFeedbackContext =
  createContext<TeskeidNavigationFeedbackValue | null>(null)

function isPlainPrimaryClick(event: MouseEvent<HTMLDivElement>) {
  return event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
}

export function TeskeidNavigationFeedbackProvider({
  children,
  pendingFallback,
  recoveryTimeoutMs = DEFAULT_RECOVERY_TIMEOUT_MS,
}: {
  children: ReactNode
  pendingFallback: ReactNode
  recoveryTimeoutMs?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`
  const previousRouteKeyRef = useRef(routeKey)
  const navigationPendingRef = useRef(false)
  const scheduledNavigationRef = useRef<number | null>(null)
  const recoveryTimeoutRef = useRef<number | null>(null)
  const [navigationPending, setNavigationPending] = useState(false)

  const resetNavigation = useCallback(() => {
    if (recoveryTimeoutRef.current !== null) {
      window.clearTimeout(recoveryTimeoutRef.current)
      recoveryTimeoutRef.current = null
    }
    navigationPendingRef.current = false
    setNavigationPending(false)
  }, [])

  const beginNavigation = useCallback(() => {
    if (navigationPendingRef.current) return false
    navigationPendingRef.current = true
    setNavigationPending(true)
    recoveryTimeoutRef.current = window.setTimeout(resetNavigation, recoveryTimeoutMs)
    return true
  }, [recoveryTimeoutMs, resetNavigation])

  const navigate = useCallback((href: string, mode: NavigationMode = 'push') => {
    if (!beginNavigation()) return

    const commitNavigation = () => {
      scheduledNavigationRef.current = null
      if (mode === 'replace') router.replace(href)
      else router.push(href)
    }

    if (typeof window.requestAnimationFrame === 'function') {
      scheduledNavigationRef.current = window.requestAnimationFrame(commitNavigation)
    } else {
      scheduledNavigationRef.current = window.setTimeout(commitNavigation, 0)
    }
  }, [beginNavigation, router])

  useEffect(() => {
    if (previousRouteKeyRef.current === routeKey) return
    previousRouteKeyRef.current = routeKey
    resetNavigation()
  }, [resetNavigation, routeKey])

  useEffect(() => () => {
    if (scheduledNavigationRef.current !== null) {
      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(scheduledNavigationRef.current)
      } else {
        window.clearTimeout(scheduledNavigationRef.current)
      }
    }
    if (recoveryTimeoutRef.current !== null) window.clearTimeout(recoveryTimeoutRef.current)
  }, [])

  const value = useMemo(() => ({ navigate }), [navigate])

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (navigationPendingRef.current || !isPlainPrimaryClick(event)) return
    if (!(event.target instanceof Element)) return

    const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || !event.currentTarget.contains(anchor)) return
    if (
      anchor.hasAttribute('download')
      || anchor.target === '_blank'
      || anchor.dataset.teskeidNavigationFeedback === 'off'
    ) return

    const href = anchor.getAttribute('href')
    if (!href) return

    let destination: URL
    try {
      destination = new URL(href, window.location.href)
    } catch {
      return
    }

    if (destination.origin !== window.location.origin) return
    if (
      destination.pathname === window.location.pathname
      && destination.search === window.location.search
    ) return

    beginNavigation()
  }

  return (
    <TeskeidNavigationFeedbackContext.Provider value={value}>
      <div
        aria-busy={navigationPending || undefined}
        className="contents"
        onClickCapture={handleClickCapture}
      >
        {navigationPending ? pendingFallback : children}
      </div>
    </TeskeidNavigationFeedbackContext.Provider>
  )
}

export function useTeskeidNavigation() {
  const value = useContext(TeskeidNavigationFeedbackContext)
  const router = useRouter()
  const fallback = useMemo<TeskeidNavigationFeedbackValue>(() => ({
    navigate: (href, mode = 'push') => {
      if (mode === 'replace') router.replace(href)
      else router.push(href)
    },
  }), [router])

  return value ?? fallback
}
