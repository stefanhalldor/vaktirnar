'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lightbulb, Send, User } from 'lucide-react'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

export function NavBar() {
  return (
    <header className="w-full bg-[#fbf9f4] border-b border-black/5">
      <div className="max-w-[768px] mx-auto h-28 sm:h-32 px-5 flex items-center justify-center">
        <Link href="/" aria-label="Teskeið.is" className="inline-flex items-center justify-center py-2">
          <TeskeidLogo size={80} decorative />
        </Link>
      </div>
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()

  const items = [
    { href: '/', label: 'Hugmyndir', icon: Lightbulb },
    { href: '/senda-hugmynd', label: 'Ný hugmynd', icon: Send },
    { href: '/innskraning', label: 'Innskráning', icon: User },
  ]

  return (
    <nav className="fixed bottom-0 w-full z-50 bg-[#fbf9f4] border-t border-black/5">
      <div className="flex justify-around items-center px-5 pt-2 pb-[max(2rem,env(safe-area-inset-bottom))] max-w-[768px] mx-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center rounded-2xl px-6 py-2 transition-colors ${
                active
                  ? 'bg-[#2d5a27] text-[#9dd090]'
                  : 'text-[#42493e]'
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-semibold mt-0.5">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
