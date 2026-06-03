'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lightbulb, Send, User } from 'lucide-react'

export function NavBar() {
  return (
    <header className="w-full top-0 sticky z-50 bg-[#fbf9f4]/80 backdrop-blur-md border-b border-black/5">
      <div className="flex items-center justify-between px-5 py-4 max-w-[768px] mx-auto">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/teskeid-mark.svg" alt="" width={32} height={32} className="shrink-0 rounded-lg" />
          <span className="text-[#154212] font-semibold text-lg tracking-tight">Teskeið</span>
        </Link>
        <Link
          href="/innskraning"
          className="h-8 w-8 rounded-full bg-[#a1d494] flex items-center justify-center text-[#23501e] text-xs font-semibold hover:opacity-80 transition-opacity"
          aria-label="Innskráning"
        >
          <User size={16} />
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
                  : 'text-[#42493e] hover:bg-[#e4e2dd]'
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
