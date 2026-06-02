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
      className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-2xl bg-violet-600 text-white px-5 py-3 text-sm font-medium shadow-lg hover:bg-violet-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <Plus size={16} />
      {label}
    </Link>
  )
}
