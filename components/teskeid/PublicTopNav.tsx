'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Send, User } from 'lucide-react'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

const NAV_ITEMS = [
  { href: '/senda-hugmynd', label: 'Ný hugmynd', icon: Send },
  { href: '/innskraning', label: 'Innskráning', icon: User },
] as const

/** Sticky top navigation bar for unauthenticated/public pages. */
export function PublicTopNav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-0 z-50 w-full bg-[#fbf9f4] border-b border-black/5"
      aria-label="Aðalleiðsögn"
    >
      <div className="flex justify-around items-center max-w-[768px] mx-auto px-2 py-1">
        <Link
          href="/"
          aria-label="Teskeið"
          aria-current={pathname === '/' ? 'page' : undefined}
          className="flex items-center justify-center rounded-xl px-5 py-2 min-h-[44px] min-w-[72px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-1 hover:bg-black/5 active:bg-black/10"
        >
          <TeskeidLogo size={64} decorative />
        </Link>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center rounded-xl px-5 py-2 min-h-[44px] min-w-[72px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-1 ${
                active
                  ? 'bg-[#2d5a27] text-[#9dd090]'
                  : 'text-[#42493e] hover:bg-black/5 active:bg-black/10'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} aria-hidden />
              <span className="text-[10px] font-semibold mt-0.5 leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
