import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { PendingInvitation } from '@/lib/loans/types'
import { getUnreadRecentEventsForUser } from '@/lib/recent-events/helpers.server'
import type { RecentEventDisplay, LoanFieldChange } from '@/lib/recent-events/types'
import { RecentSection, type RecentLabels } from './RecentSection'

const LOCALE_MAP: Record<string, string> = { is: 'is-IS', en: 'en-GB' }

function formatDateStr(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1),
  )
}

function buildDetailLines(
  changes: LoanFieldChange[] | undefined,
  t: (key: string, params?: Record<string, string>) => string,
  displayLocale: string,
): string[] {
  if (!changes?.length) return []
  return changes.map((change) => {
    const fmt = (v: string | null | undefined) => formatDateStr(v, displayLocale)
    if (change.field === 'item_name') {
      return t('eventDetailItemNameChanged', { oldName: change.oldValue ?? '', newName: change.newValue ?? '' })
    }
    if (change.field === 'loaned_at') {
      return t('eventDetailLoanedAtChanged', { oldDate: fmt(change.oldValue), newDate: fmt(change.newValue) })
    }
    if (change.field === 'due_at') {
      if (change.changeType === 'added')   return t('eventDetailReturnDateAdded',   { date: fmt(change.newValue) })
      if (change.changeType === 'removed') return t('eventDetailReturnDateRemoved', { date: fmt(change.oldValue) })
      return t('eventDetailReturnDateChanged', { oldDate: fmt(change.oldValue), newDate: fmt(change.newValue) })
    }
    // note
    if (change.changeType === 'added')   return t('eventDetailNoteAdded',   { content: change.newValue ?? '' })
    if (change.changeType === 'removed') return t('eventDetailNoteRemoved', { content: change.oldValue ?? '' })
    return t('eventDetailNoteChanged', { oldContent: change.oldValue ?? '', newContent: change.newValue ?? '' })
  })
}

const UPCOMING_KEYS = [
  'upcomingEmail',
  'upcomingExpenses',
  'upcomingPartner',
  'upcomingWeather',
  'upcomingKidsShift',
  'upcomingThirdShift',
  'upcomingOutToPlay',
] as const

const EVENT_TYPE_TO_KEY: Record<string, string> = {
  loan_created:              'eventLoanCreated',
  loan_updated:              'eventLoanUpdated',
  loan_returned:             'eventLoanReturned',
  loan_return_undone:        'eventLoanReturnUndone',
  loan_deleted:              'eventLoanDeleted',
  loan_invitation_received:  'eventLoanInvitationReceived',
  loan_invitation_accepted:  'eventLoanInvitationAccepted',
  loan_invitation_declined:  'eventLoanInvitationDeclined',
}


export default async function HeimPage() {
  const { user } = await guardTeskeidSession()

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

  const loansEnabled = await checkFeatureAccess(user.id, user.email!, 'lanad-og-skilad')

  const displayLocale = LOCALE_MAP[locale] ?? locale

  let pendingInvitations: PendingInvitation[] = []
  let invitationsError = false
  let recentEvents: RecentEventDisplay[] = []
  let eventsError = false

  if (loansEnabled) {
    let admin: ReturnType<typeof getAdmin> | null = null
    try {
      admin = getAdmin()
    } catch {
      console.error('[heim/page] getAdmin failed')
      invitationsError = true
      eventsError = true
    }

    if (admin !== null) {
      const invitationsResult = await Promise.resolve(
        admin.rpc('get_my_pending_invitations', { p_actor_id: user.id })
      ).catch(() => null)

      if (!invitationsResult || invitationsResult.error) {
        console.error('[heim/page] get_my_pending_invitations failed')
        invitationsError = true
      } else {
        pendingInvitations = (invitationsResult.data ?? []) as PendingInvitation[]
      }

      try {
        const rows = await getUnreadRecentEventsForUser(user.id)
        recentEvents = rows.map((event) => {
          const labelKey = EVENT_TYPE_TO_KEY[event.event_type] ?? event.event_type
          const itemName = event.payload.itemName ?? ''
          const isDeleted = event.event_type === 'loan_deleted'
          const isInvitation = event.event_type === 'loan_invitation_received'
          let viewHref: string | null = null
          if (!isDeleted && event.entity_id) {
            viewHref = isInvitation
              ? `/auth-mvp/lanad-og-skilad?invitation=${event.entity_id}`
              : '/auth-mvp/lanad-og-skilad'
          }
          const tFn = (key: string, params?: Record<string, string>) =>
            t(key as Parameters<typeof t>[0], params as Parameters<typeof t>[1])
          return {
            id:          event.id,
            label:       t(labelKey as Parameters<typeof t>[0], { itemName }),
            href:        event.href,
            viewHref,
            isDeleted,
            detailLines: buildDetailLines(event.payload.changes, tFn, displayLocale),
          }
        })
      } catch {
        console.error('[heim/page] recent events query failed')
        eventsError = true
      }
    }
  }

  const rowBatch = recentEvents.map((e) => String(e.id)).join('.')
  const pendingCount = pendingInvitations.length
  const firstName = displayName ? (displayName.trim().split(/\s+/)[0] ?? displayName) : null
  const greeting = firstName ? t('greeting', { firstName }) : t('greetingFallback')

  const recentLabels: RecentLabels = {
    recent:      t('recent'),
    markAllRead: t('recentMarkAllRead'),
    markOneRead: t('recentMarkRead'),
    done:        t('recentDone'),
    noRecent:    t('noRecent'),
    viewItem:    t('recentView'),
    closeDrawer: t('recentClose'),
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-8 pb-10 flex flex-col gap-6">

        {/* ── Kveðja + profile-icon í sömu línu ──────────────────── */}
        <section className="flex items-center justify-between gap-3">
          <p className="text-xl font-semibold text-primary">{greeting}</p>
          <TeskeidMenu variant="authenticated" />
        </section>

        {/* ── Nýlegt — hidden when LOANS_ENABLED=false or events query failed ─ */}
        {loansEnabled && !eventsError && (
          <RecentSection
            key={rowBatch}
            rows={recentEvents}
            displayLocale={displayLocale}
            labels={recentLabels}
          />
        )}

        {/* ── Teskeiðar — always renders; active row is loans-gated ── */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('featuresTitle')}</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
            {loansEnabled && (
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
            )}

            {UPCOMING_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled
                className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] opacity-60 cursor-not-allowed"
              >
                <span className="text-sm font-medium text-foreground">{t(key)}</span>
                <span className="text-xs text-muted-foreground">{t('upcoming')}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Lógó — miðjað neðst ────────────────────────────────── */}
        <div className="flex justify-center pt-4">
          <Link
            href="/auth-mvp/heim"
            aria-label={tLoans('homeLink')}
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
