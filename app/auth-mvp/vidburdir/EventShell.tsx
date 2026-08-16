import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { ClosedTestingBanner } from '@/components/teskeid/ClosedTestingBanner'

export function EventShell({
  title,
  children,
  homeLabel,
  backHref,
  backLabel,
}: {
  title: string
  children: React.ReactNode
  homeLabel: string
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
        <header className="mb-6 flex min-h-11 items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label={backLabel}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft aria-hidden size={20} />
            </Link>
          ) : null}
          <h1 className="min-w-0 flex-1 break-words text-pretty text-lg font-semibold leading-tight text-primary">
            {title}
          </h1>
          <TeskeidMenu variant="authenticated" />
        </header>

        {/* Events is a fixed closed-testing feature in this MVP. Keeping this
            shell client-safe lets the route error boundary reuse it. */}
        <ClosedTestingBanner className="mb-6" />

        <div className="flex-1">{children}</div>

        <Link
          href="/auth-mvp/heim"
          aria-label={homeLabel}
          className="mx-auto mt-12 inline-flex min-h-11 items-center justify-center rounded-xl px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TeskeidLogo size={74} decorative />
        </Link>
      </main>
    </div>
  )
}
