'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Menu, X, Lightbulb, Send, LogIn, UserCircle, LayoutGrid, LogOut, MessagesSquare, Trophy, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const PUBLIC_ITEMS = [
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/kviss', labelKey: 'quiz', icon: Trophy },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
  { href: '/innskraning', labelKey: 'login', icon: LogIn },
] as const

const AUTH_ITEMS = [
  { href: '/auth-mvp/heim', labelKey: 'teskeidar', icon: LayoutGrid, activePrefixes: ['/auth-mvp/heim', '/auth-mvp/lanad-og-skilad', '/auth-mvp/utlagt-og-endurgreitt', '/auth-mvp/bokhaldid', '/auth-mvp/umonnun', '/auth-mvp/vedrid'] },
  { href: '/auth-mvp/kviss', labelKey: 'quiz', icon: Trophy, feature: 'kviss' },
  { href: '/auth-mvp/auglysandi', labelKey: 'advertiser', icon: Megaphone, feature: 'advertiser' },
  { href: '/auth-mvp/samvinna', labelKey: 'agentCollaboration', icon: MessagesSquare, agentCollaboration: true },
  { href: '/auth-mvp/minn-profill', labelKey: 'profile', icon: UserCircle },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
] as const

interface TeskeidMenuProps {
  variant: 'public' | 'authenticated'
}

export function TeskeidMenu({ variant }: TeskeidMenuProps) {
  const t = useTranslations('teskeid.nav')
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [agentCollaborationAvailable, setAgentCollaborationAvailable] = useState(false)
  const [agentUnreadCount, setAgentUnreadCount] = useState(0)
  const [capabilities, setCapabilities] = useState({ kviss: false, advertiser: false })
  const ref = useRef<HTMLDetailsElement>(null)

  const items = variant === 'public'
    ? PUBLIC_ITEMS
    : AUTH_ITEMS.filter(item => (
        (!('agentCollaboration' in item) || !item.agentCollaboration || agentCollaborationAvailable)
        && (!('feature' in item) || !item.feature || capabilities[item.feature as keyof typeof capabilities])
      ))

  useEffect(() => {
    if (variant !== 'authenticated') return
    createClient().auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null)
    })
  }, [variant])

  useEffect(() => {
    if (variant !== 'authenticated') return
    let active = true
    fetch('/api/auth-mvp/capabilities', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : { kviss: false, advertiser: false })
      .then((value: { kviss?: boolean; advertiser?: boolean }) => {
        if (active) setCapabilities({
          kviss: value.kviss === true,
          advertiser: value.advertiser === true,
        })
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [variant])

  useEffect(() => {
    if (variant !== 'authenticated') return
    let active = true

    async function loadSummary() {
      try {
        const response = await fetch('/api/auth-mvp/agent-collaboration/summary', { cache: 'no-store' })
        if (!response.ok) {
          if (active && (response.status === 404 || response.status === 401)) {
            setAgentCollaborationAvailable(false)
            setAgentUnreadCount(0)
            active = false
          }
          return
        }
        const data = await response.json() as { unreadCount?: number }
        if (active) {
          setAgentCollaborationAvailable(true)
          setAgentUnreadCount(Math.max(0, Number(data.unreadCount) || 0))
        }
      } catch {
        // Menu availability must not depend on the optional unread summary.
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
  }, [variant, pathname])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && ref.current) {
        ref.current.open = false
        setOpen(false)
      }
    }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        ref.current.open = false
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [open])

  function closeMenu() {
    if (ref.current) ref.current.open = false
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
    <details
      ref={ref}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group relative z-[60]"
    >
      <summary
        role="button"
        onClick={(event) => {
          const details = event.currentTarget.parentElement as HTMLDetailsElement
          setOpen(!details.open)
        }}
        aria-label={open
          ? t('closeMenu')
          : showAgentMenuUnread
            ? `${t('menu')} · ${t('agentUnread', { count: agentUnreadCount })}`
            : t('menu')}
        aria-expanded={open}
        className="relative flex h-11 w-11 cursor-pointer touch-manipulation list-none items-center justify-center rounded-full text-[#42493e] transition-colors hover:bg-black/5 hover:text-[#154212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden"
      >
        <Menu size={20} aria-hidden className="group-open:hidden" />
        <X size={20} aria-hidden className="hidden group-open:block" />
        {showAgentMenuUnread && (
          <span
            data-testid="agent-unread-indicator"
            aria-hidden
            className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#fbf9f4] bg-red-600"
          />
        )}
      </summary>

      <div
        aria-hidden={!open}
        className="absolute right-0 top-full z-50 mt-1 hidden w-56 overflow-hidden rounded-xl border border-black/10 bg-[#fbf9f4] shadow-lg group-open:block"
      >
          {variant === 'authenticated' && userEmail && (
            <>
              <div className="px-4 py-2.5 border-b border-black/5">
                <p className="text-[11px] text-[#72796e] truncate">{userEmail}</p>
              </div>
            </>
          )}
          {items.map((item) => {
            const { href, labelKey, icon: Icon } = item
            const active = 'activePrefixes' in item
              ? item.activePrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
              : pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
            const showUnread = 'agentCollaboration' in item
              && item.agentCollaboration
              && agentUnreadCount > 0
              && !pathname.startsWith('/auth-mvp/samvinna')
            return (
              <Link
                key={href}
                href={href}
                onClick={closeMenu}
                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors min-h-[44px] ${
                  active
                    ? 'bg-[#2d5a27] text-[#9dd090] font-medium'
                    : 'text-[#42493e] hover:bg-black/5'
                }`}
              >
                <Icon size={16} aria-hidden />
                <span className="min-w-0 flex-1">{t(labelKey)}</span>
                {showUnread && (
                  <>
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span className="sr-only">{t('agentUnread', { count: agentUnreadCount })}</span>
                  </>
                )}
              </Link>
            )
          })}
          {variant === 'authenticated' && (
            <div className="border-t border-black/5">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors min-h-[44px] w-full"
              >
                <LogOut size={16} aria-hidden />
                <span>{t('signOut')}</span>
              </button>
            </div>
          )}
      </div>
    </details>
  )
}
