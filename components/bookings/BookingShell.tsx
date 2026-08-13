import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'

export function BookingShell({
  title,
  description,
  backHref,
  backLabel,
  menuVariant = 'public',
  children,
}: {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  menuVariant?: 'public' | 'authenticated'
  children: React.ReactNode
}) {
  const externalBack = Boolean(backHref && /^https?:\/\//i.test(backHref))
  const backClassName = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
        <header className="mb-6">
          <div className="flex min-h-11 items-center gap-3">
            {backHref ? (
              externalBack ? (
                <a href={backHref} aria-label={backLabel} referrerPolicy="no-referrer" className={backClassName}>
                  <ArrowLeft aria-hidden size={20} />
                </a>
              ) : (
                <Link href={backHref} aria-label={backLabel} className={backClassName}>
                  <ArrowLeft aria-hidden size={20} />
                </Link>
              )
            ) : (
              <Link
                href="/"
                aria-label="Teskeið"
                className="inline-flex min-h-11 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <TeskeidLogo size={82} decorative />
              </Link>
            )}
            <div className="min-w-0 flex-1" />
            <TeskeidMenu variant={menuVariant} />
          </div>
          <h1 className="mt-4 text-pretty text-2xl font-semibold leading-tight text-primary">{title}</h1>
          {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </header>

        <div className="flex-1">{children}</div>
      </main>
    </div>
  )
}
