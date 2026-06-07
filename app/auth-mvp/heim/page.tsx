import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import Image from 'next/image'
import { UserCircle, ChevronRight, ArrowRight, AlertTriangle, Plus } from 'lucide-react'
import { guardTeskeidAccess } from '@/lib/auth/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { LoanItem, PendingInvitation } from '@/lib/loans/types'
import { sortLoansForHome } from '@/lib/loans/sort'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

function isOverdue(item: LoanItem): boolean {
  if (!item.due_at || item.returned_at) return false
  return item.due_at < new Date().toISOString().slice(0, 10)
}

/**
 * Parse YYYY-MM-DD as a local date to avoid UTC midnight timezone shift.
 * Mirrors the pattern used in LoanCard.tsx.
 */
function formatLoanDate(dateStr: string, locale: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const displayLocale = LOCALE_MAP[locale] ?? locale
  return new Date(year, month - 1, day).toLocaleDateString(displayLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function HeimPage() {
  const { user } = await guardTeskeidAccess()

  const [t, tLoans, locale] = await Promise.all([
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getLocale(),
  ])

  // Profile via authenticated RLS client — no service_role needed.
  // Failure is silent: generic greeting is shown, page continues.
  let displayName: string | null = null
  try {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
    displayName = profile?.display_name?.trim() || null
  } catch {
    // Profile unavailable — fall through to generic greeting
  }

  // Loan data via service_role RPCs.
  // LOANS_ENABLED must be exactly 'true' for loan sections to appear.
  // getAdmin() is wrapped independently. Each RPC is settled via
  // Promise.allSettled so one rejection cannot suppress the other.
  const loansEnabled = process.env.LOANS_ENABLED === 'true'
  let loans: LoanItem[] = []
  let pendingInvitations: PendingInvitation[] = []
  let loansError = false
  let invitationsError = false

  if (loansEnabled) {
    let admin: ReturnType<typeof getAdmin> | null = null
    try {
      admin = getAdmin()
    } catch (err) {
      const errType = err instanceof Error ? err.constructor.name : typeof err
      console.error('[heim/page] getAdmin:', errType)
      loansError = true
      invitationsError = true
    }

    if (admin !== null) {
      const [loansResult, invitationsResult] = await Promise.allSettled([
        admin.rpc('get_my_loans', { p_actor_id: user.id }),
        admin.rpc('get_my_pending_invitations', { p_actor_id: user.id }),
      ])

      if (loansResult.status === 'rejected') {
        const errType = loansResult.reason instanceof Error ? loansResult.reason.constructor.name : typeof loansResult.reason
        console.error('[heim/page] get_my_loans:', errType)
        loansError = true
      } else if (loansResult.value.error) {
        console.error('[heim/page] get_my_loans:', loansResult.value.error.code)
        loansError = true
      } else {
        loans = (loansResult.value.data ?? []) as LoanItem[]
      }

      if (invitationsResult.status === 'rejected') {
        const errType = invitationsResult.reason instanceof Error ? invitationsResult.reason.constructor.name : typeof invitationsResult.reason
        console.error('[heim/page] get_my_pending_invitations:', errType)
        invitationsError = true
      } else if (invitationsResult.value.error) {
        console.error('[heim/page] get_my_pending_invitations:', invitationsResult.value.error.code)
        invitationsError = true
      } else {
        pendingInvitations = (invitationsResult.value.data ?? []) as PendingInvitation[]
      }
    }
  }

  // Sort by loaned_at DESC, id DESC (tie-breaker), then take first 3.
  const recentLoans = sortLoansForHome(loans).slice(0, 3)
  const pendingCount = pendingInvitations.length
  const greeting = displayName ? t('greeting', { displayName }) : t('greetingFallback')

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-5 h-14 border-b border-border bg-background">
        <Image
          src="/teskeid-logo-no-frame.svg"
          alt="Teskeið"
          width={88}
          height={26}
          priority
        />
        <Link
          href="/auth-mvp/minn-profill"
          className="flex items-center justify-center w-10 h-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label={t('profileLink')}
          title={t('profileLink')}
        >
          <UserCircle size={22} aria-hidden />
        </Link>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Greeting */}
        <section>
          <p className="text-xl font-semibold text-primary">{greeting}</p>
        </section>

        {/* Hvað er á dagskrá? — only when loans feature is active */}
        {loansEnabled && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('agenda')}</h2>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Lánað og skilað primary row */}
              <Link
                href="/auth-mvp/lanad-og-skilad"
                className="flex items-center justify-between px-4 hover:bg-background transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <div className="flex items-center gap-2.5 py-3">
                  <span className="text-sm font-medium text-foreground">{t('loansTitle')}</span>
                  {!invitationsError && pendingCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium"
                      aria-label={t('pendingBadgeLabel', { count: pendingCount })}
                    >
                      <span aria-hidden="true">{pendingCount}</span>
                    </span>
                  )}
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" aria-hidden />
              </Link>
              {/* Secondary action: skrá nýjan hlut */}
              <div className="border-t border-border">
                <Link
                  href="/auth-mvp/lanad-og-skilad/ny"
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-primary hover:bg-primary/5 transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <Plus size={14} aria-hidden />
                  {t('loansNewItem')}
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Nýlegt — hidden when LOANS_ENABLED=false or RPC failed */}
        {loansEnabled && !loansError && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-muted-foreground">{t('recent')}</h2>
              {recentLoans.length > 0 && (
                <Link
                  href="/auth-mvp/lanad-og-skilad"
                  className="flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  {t('recentSeeAll')} <ArrowRight size={12} aria-hidden />
                </Link>
              )}
            </div>

            {recentLoans.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-3">{t('noRecent')}</p>
                <Link
                  href="/auth-mvp/lanad-og-skilad/ny"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  {t('noRecentCta')} <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border bg-card border border-border rounded-xl overflow-hidden">
                {recentLoans.map((item) => {
                  const overdue = isOverdue(item)
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 min-h-[48px]">
                      <div className="flex-1 min-w-0 py-3">
                        <p
                          className={`text-sm font-medium leading-tight truncate ${
                            item.returned_at ? 'text-muted-foreground line-through' : 'text-foreground'
                          }`}
                        >
                          {item.item_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.my_role === 'lender' ? tLoans('lent') : tLoans('borrowed')}
                          {item.other_display_name ? ` · ${item.other_display_name}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 py-3">
                        {overdue ? (
                          <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertTriangle size={12} aria-hidden />
                            {tLoans('overdue')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {formatLoanDate(item.loaned_at, locale)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
