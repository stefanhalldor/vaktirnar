import { ArrowLeft } from 'lucide-react'
import { BookkeepingPendingLink } from '@/components/bookkeeping/BookkeepingPendingLink'
import { ClosedTestingBanner } from '@/components/teskeid/ClosedTestingBanner'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'

export interface BookkeepingShellProps {
  title: string
  children: React.ReactNode
  backHref?: string
  backLabel?: string
  homeLabel: string
  wide?: boolean
  showClosedTestingBanner?: boolean
}

export function BookkeepingShell({
  title,
  children,
  backHref,
  backLabel,
  homeLabel,
  wide = false,
  showClosedTestingBanner = false,
}: BookkeepingShellProps) {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <main
        className={`mx-auto flex min-h-screen w-full flex-col px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-lg'}`}
      >
        <header className="mb-6 flex min-h-11 items-center gap-3">
          {backHref ? (
            <BookkeepingPendingLink
              href={backHref}
              ariaLabel={backLabel ?? homeLabel}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft aria-hidden size={20} />
            </BookkeepingPendingLink>
          ) : null}
          <h1 className="min-w-0 flex-1 text-pretty text-lg font-semibold leading-tight text-primary">
            {title}
          </h1>
          <TeskeidMenu variant="authenticated" />
        </header>

        {showClosedTestingBanner ? <ClosedTestingBanner className="mb-6" /> : null}

        <div className="min-w-0 flex-1">{children}</div>

        <BookkeepingPendingLink
          href="/auth-mvp/heim"
          ariaLabel={homeLabel}
          className="mx-auto mt-12 inline-flex min-h-11 items-center justify-center rounded-xl px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TeskeidLogo size={74} decorative />
        </BookkeepingPendingLink>
      </main>
    </div>
  )
}
