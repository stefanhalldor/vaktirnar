'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Menu, X, Lightbulb, Send, LogIn, UserCircle, LayoutGrid, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const PUBLIC_ITEMS = [
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
  { href: '/innskraning', labelKey: 'login', icon: LogIn },
] as const

const AUTH_ITEMS = [
  { href: '/auth-mvp/heim', labelKey: 'teskeidar', icon: LayoutGrid, activePrefixes: ['/auth-mvp/heim', '/auth-mvp/lanad-og-skilad', '/auth-mvp/umonnun', '/auth-mvp/vedrid'] },
  { href: '/auth-mvp/minn-profill', labelKey: 'profile', icon: UserCircle },
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
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
  const ref = useRef<HTMLDivElement>(null)

  const items = variant === 'public' ? PUBLIC_ITEMS : AUTH_ITEMS

  useEffect(() => {
    if (variant !== 'authenticated') return
    createClient().auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null)
    })
  }, [variant])

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t('closeMenu') : t('menu')}
        aria-expanded={open}
        className="flex items-center justify-center w-11 h-11 rounded-full text-[#42493e] hover:text-[#154212] hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-1"
      >
        {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
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
                <span>{t(labelKey)}</span>
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
