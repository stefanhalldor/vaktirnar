'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Menu, X, Lightbulb, Send, LogIn, UserCircle, LayoutGrid, LogOut, MessagesSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const PUBLIC_ITEMS = [
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
  { href: '/innskraning', labelKey: 'login', icon: LogIn },
] as const

const AUTH_ITEMS = [
  { href: '/auth-mvp/heim', labelKey: 'teskeidar', icon: LayoutGrid, activePrefixes: ['/auth-mvp/heim', '/auth-mvp/lanad-og-skilad', '/auth-mvp/umonnun', '/auth-mvp/vedrid'] },
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
  const ref = useRef<HTMLDivElement>(null)

  const items = variant === 'public'
    ? PUBLIC_ITEMS
    : AUTH_ITEMS.filter(item => (
        !('agentCollaboration' in item) || !item.agentCollaboration || agentCollaborationAvailable
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
      if (e.key === 'Escape') setOpen(false)
    }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [open])

  async function handleSignOut() {
    setOpen(false)
    await createClient().auth.signOut()
    router.push('/innskraning')
  }

  const showAgentMenuUnread = variant === 'authenticated'
    && agentCollaborationAvailable
    && agentUnreadCount > 0
    && !pathname.startsWith('/auth-mvp/samvinna')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open
          ? t('closeMenu')
          : showAgentMenuUnread
            ? `${t('menu')} · ${t('agentUnread', { count: agentUnreadCount })}`
            : t('menu')}
        aria-expanded={open}
        className="relative flex items-center justify-center w-11 h-11 rounded-full text-[#42493e] hover:text-[#154212] hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-1"
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
        <div className="absolute right-0 top-full mt-1 w-56 bg-[#fbf9f4] border border-black/10 rounded-xl shadow-lg z-50 overflow-hidden">
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
                onClick={() => setOpen(false)}
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
      )}
    </div>
  )
}
