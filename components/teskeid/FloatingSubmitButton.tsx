'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'

export function FloatingSubmitButton({ label }: { label: string }) {
  const pathname = usePathname()
  if (pathname === '/senda-hugmynd') return null

  return (
    <Link
      href="/senda-hugmynd"
      aria-label={label}
      className="fixed bottom-[5.5rem] right-6 z-40 w-14 h-14 rounded-full bg-[#7c400c] text-[#ffb17a] flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c400c] focus-visible:ring-offset-2"
    >
      <Plus size={24} />
    </Link>
  )
}
