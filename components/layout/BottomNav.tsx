'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Home, Users, UserPlus, Settings } from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { href: '/home', icon: Home, key: 'home' },
  { href: '/children', icon: Users, key: 'children' },
  { href: '/contacts', icon: UserPlus, key: 'contacts' },
  { href: '/settings', icon: Settings, key: 'settings' },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white/95 backdrop-blur-sm safe-area-pb">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {navItems.map(({ href, icon: Icon, key }) => {
          const active = href === '/home' ? pathname === '/home' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition-colors',
                active ? 'text-violet-600' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <Icon className={clsx('h-5 w-5', active && 'stroke-[2.5]')} />
              <span className="text-xs font-medium">{t(key)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
