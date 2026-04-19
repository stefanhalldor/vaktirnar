import { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface HeaderProps {
  title: string
  backHref?: string
  action?: ReactNode
}

export function Header({ title, backHref, action }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
        {backHref && (
          <Link href={backHref} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="flex-1 text-lg font-semibold text-gray-900">{title}</h1>
        {action && <div>{action}</div>}
      </div>
    </header>
  )
}
