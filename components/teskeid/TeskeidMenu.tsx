'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useTeskeidLauncherCommitSignal } from './AuthenticatedLauncherTracker'
import {
  BookOpen,
  CalendarDays,
  CloudSun,
  Handshake,
  Heart,
  Lightbulb,
  LogIn,
  LogOut,
  Megaphone,
  Menu,
  MessagesSquare,
  Send,
  Trophy,
  UserCircle,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  TESKEID_LAUNCHER_CATALOG,
  isTeskeidLauncherId,
  type TeskeidLauncherIcon,
  type TeskeidLauncherId,
} from '@/lib/teskeid/launcherCatalog'

const PUBLIC_ITEMS = [
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/kviss', labelKey: 'quiz', icon: Trophy },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
  { href: '/innskraning', labelKey: 'login', icon: LogIn },
] as const

const ICONS: Record<TeskeidLauncherIcon, LucideIcon> = {
  handshake: Handshake,
  wallet: Wallet,
  'book-open': BookOpen,
  heart: Heart,
  'cloud-sun': CloudSun,
  trophy: Trophy,
  megaphone: Megaphone,
  calendar: CalendarDays,
}
interface TeskeidMenuProps {
  variant: 'public' | 'authenticated'
  initialFeatureIds?: readonly TeskeidLauncherId[]
  initialAgentCollaborationAvailable?: boolean
}

function isActivePath(pathname: string, href: string, prefixes?: readonly string[]) {
  if (prefixes) return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}

export function TeskeidMenu({
  variant,
  initialFeatureIds,
  initialAgentCollaborationAvailable = false,
}: TeskeidMenuProps) {
  const t = useTranslations('teskeid.nav')
  const pathname = usePathname()
  const launcherCommitSignal = useTeskeidLauncherCommitSignal()
  const router = useRouter()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const hasServerProjection = initialFeatureIds !== undefined
  const [fetchedAgentCollaborationAvailable, setFetchedAgentCollaborationAvailable] = useState(false)
  const [agentUnreadCount, setAgentUnreadCount] = useState(0)
  const [fetchedFeatureIds, setFetchedFeatureIds] = useState<TeskeidLauncherId[]>([])
  const featureIds = hasServerProjection ? initialFeatureIds : fetchedFeatureIds
  const agentCollaborationAvailable = hasServerProjection
    ? initialAgentCollaborationAvailable
    : fetchedAgentCollaborationAvailable

  const authenticatedFeatures = featureIds.flatMap((id) => {
    const item = TESKEID_LAUNCHER_CATALOG.find((candidate) => candidate.id === id)
    return item ? [item] : []
  })

  useEffect(() => {
    if (variant !== 'authenticated') return
    createClient().auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null)
    })
  }, [variant])

  useEffect(() => {
    if (variant !== 'authenticated' || hasServerProjection) return
    let active = true

    async function loadCanonicalProjection() {
      try {
        const response = await fetch('/api/auth-mvp/launcher', { cache: 'no-store' })
        if (!response.ok) return
        const value = await response.json() as {
          featureIds?: unknown
          agentCollaborationAvailable?: unknown
        }
        if (!active) return
        const ids = Array.isArray(value.featureIds)
          ? value.featureIds.filter(isTeskeidLauncherId)
          : []
        setFetchedFeatureIds(ids)
        setFetchedAgentCollaborationAvailable(value.agentCollaborationAvailable === true)
      } catch {
        // Keep the previous canonical projection when refresh fails.
      }
    }

    async function coordinateProjection() {
      const status = await launcherCommitSignal?.waitForCompletion(2_000)
      if (!active) return
      await loadCanonicalProjection()
      if (status === 'timed-out' && launcherCommitSignal) {
        const finalStatus = await launcherCommitSignal.waitForCompletion()
        if (active && finalStatus === 'committed') await loadCanonicalProjection()
      }
    }

    void coordinateProjection()
    return () => { active = false }
  }, [hasServerProjection, launcherCommitSignal, pathname, variant])

  useEffect(() => {
    if (variant !== 'authenticated' || !agentCollaborationAvailable) {
      setAgentUnreadCount(0)
      return
    }
    let active = true

    async function loadSummary() {
      try {
        const response = await fetch('/api/auth-mvp/agent-collaboration/summary', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json() as { unreadCount?: number }
        if (active) setAgentUnreadCount(Math.max(0, Number(data.unreadCount) || 0))
      } catch {
        // Unread status is optional and never controls utility visibility.
      }
    }

    let timeoutId: number | undefined
    async function pollSummary() {
      if (document.visibilityState === 'visible') await loadSummary()
      if (active) timeoutId = window.setTimeout(pollSummary, 30_000)
    }
    function onVisibilityChange() {
      if (!active || document.visibilityState !== 'visible') return
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      void pollSummary()
    }

    void pollSummary()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [agentCollaborationAvailable, variant])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function closeMenu() {
    setOpen(false)
  }

  async function handleSignOut() {
    closeMenu()
    await createClient().auth.signOut()
    router.push('/innskraning')
  }

  const showAgentMenuUnread = variant === 'authenticated'
    && agentCollaborationAvailable
    && agentUnreadCount > 0
    && !pathname.startsWith('/auth-mvp/samvinna')

  return (
    <div ref={rootRef} role="group" className="relative z-[60]">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open
          ? t('closeMenu')
          : showAgentMenuUnread
            ? `${t('menu')} · ${t('agentUnread', { count: agentUnreadCount })}`
            : t('menu')}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-[#42493e] transition-colors hover:bg-black/5 hover:text-[#154212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-1"
      >
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        {showAgentMenuUnread && (
          <span
            data-testid="agent-unread-indicator"
            aria-hidden
            className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#fbf9f4] bg-red-600"
          />
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] w-[min(18rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl border border-black/10 bg-[#fbf9f4] shadow-lg"
        >
          {variant === 'authenticated' && userEmail && (
            <div className="border-b border-black/5 px-4 py-2.5">
              <p className="truncate text-[11px] text-[#72796e]">{userEmail}</p>
            </div>
          )}

          <nav aria-label={t(variant === 'authenticated' ? 'featureNavigation' : 'publicNavigation')}>
            {variant === 'public' && PUBLIC_ITEMS.map(({ href, labelKey, icon: Icon }) => {
              const active = isActivePath(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMenu}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors ${active
                    ? 'bg-[#2d5a27] font-medium text-[#d9f3d3]'
                    : 'text-[#42493e] hover:bg-black/5'}`}
                >
                  <Icon size={16} aria-hidden />
                  <span className="min-w-0 flex-1">{t(labelKey)}</span>
                </Link>
              )
            })}

            {variant === 'authenticated' && (
              <>
                {authenticatedFeatures.map((item) => {
                  const Icon = ICONS[item.icon]
                  const active = isActivePath(pathname, item.href, item.activePrefixes)
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={closeMenu}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors ${active
                        ? 'bg-[#2d5a27] font-medium text-[#d9f3d3]'
                        : 'text-[#42493e] hover:bg-black/5'}`}
                    >
                      <Icon size={16} aria-hidden />
                      <span className="min-w-0 flex-1">{t(item.navKey)}</span>
                    </Link>
                  )
                })}

                <div className="border-t border-black/5">
                  <Link
                    href="/auth-mvp/heim"
                    onClick={closeMenu}
                    aria-current={pathname === '/auth-mvp/heim' ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors ${pathname === '/auth-mvp/heim'
                      ? 'bg-[#2d5a27] font-medium text-[#d9f3d3]'
                      : 'text-[#42493e] hover:bg-black/5'}`}
                  >
                    <Lightbulb size={16} aria-hidden />
                    <span>{t('home')}</span>
                  </Link>
                  {agentCollaborationAvailable && (
                    <Link
                      href="/auth-mvp/samvinna"
                      onClick={closeMenu}
                      aria-current={pathname.startsWith('/auth-mvp/samvinna') ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors ${pathname.startsWith('/auth-mvp/samvinna')
                        ? 'bg-[#2d5a27] font-medium text-[#d9f3d3]'
                        : 'text-[#42493e] hover:bg-black/5'}`}
                    >
                      <MessagesSquare size={16} aria-hidden />
                      <span className="min-w-0 flex-1">{t('agentCollaboration')}</span>
                      {showAgentMenuUnread && (
                        <>
                          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                          <span className="sr-only">{t('agentUnread', { count: agentUnreadCount })}</span>
                        </>
                      )}
                    </Link>
                  )}
                  <Link
                    href="/auth-mvp/minn-profill"
                    onClick={closeMenu}
                    aria-current={pathname.startsWith('/auth-mvp/minn-profill') ? 'page' : undefined}
                    className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm text-[#42493e] transition-colors hover:bg-black/5"
                  >
                    <UserCircle size={16} aria-hidden />
                    <span>{t('profile')}</span>
                  </Link>
                  <Link
                    href="/senda-hugmynd"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm text-[#42493e] transition-colors hover:bg-black/5"
                  >
                    <Send size={16} aria-hidden />
                    <span>{t('submitIdea')}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600"
                  >
                    <LogOut size={16} aria-hidden />
                    <span>{t('signOut')}</span>
                  </button>
                </div>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  )
}
