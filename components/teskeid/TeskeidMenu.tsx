'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Menu, X, Lightbulb, Send, LogIn, Home, UserCircle, Archive } from 'lucide-react'

const PUBLIC_ITEMS = [
  { href: '/', labelKey: 'ideas', icon: Lightbulb },
  { href: '/senda-hugmynd', labelKey: 'submitIdea', icon: Send },
  { href: '/innskraning', labelKey: 'login', icon: LogIn },
] as const

const AUTH_ITEMS = [
  { href: '/auth-mvp/heim', labelKey: 'home', icon: Home },
  { href: '/auth-mvp/minn-profill', labelKey: 'profile', icon: UserCircle },
  { href: '/auth-mvp/lanad-og-skilad', labelKey: 'loans', icon: Archive },
] as const

interface TeskeidMenuProps {
  variant: 'public' | 'authenticated'
}

export function TeskeidMenu({ variant }: TeskeidMenuProps) {
  const t = useTranslations('teskeid.nav')
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const items = variant === 'public' ? PUBLIC_ITEMS : AUTH_ITEMS

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
        <div className="absolute right-0 top-full mt-1 w-52 bg-[#fbf9f4] border border-black/10 rounded-xl shadow-lg z-50 overflow-hidden">
          {items.map(({ href, labelKey, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
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
        </div>
      )}
    </div>
  )
}
