import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'

interface LoanShellProps {
  nav: React.ReactNode
  homeLabel: string
  children: React.ReactNode
}

export function LoanShell({ nav, homeLabel, children }: LoanShellProps) {
  return (
    <div className="min-h-screen bg-[#fbf9f4]">
      <main className="max-w-lg mx-auto px-4 pt-6 pb-10 flex flex-col gap-6">
        {nav}
        {children}
        <div className="flex justify-center pt-4">
          <Link
            href="/auth-mvp/heim"
            aria-label={homeLabel}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#154212] focus-visible:ring-offset-2"
          >
            <TeskeidLogo size={160} decorative className="sm:hidden" />
            <TeskeidLogo size={200} decorative className="hidden sm:block" />
          </Link>
        </div>
      </main>
    </div>
  )
}
