import { getTranslations, getLocale } from 'next-intl/server'
import Link from 'next/link'
import { TeskeidLogo } from '@/components/teskeid/TeskeidLogo'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveTeskeidLauncher } from '@/lib/teskeid/launcher.server'
import type { LoanItem } from '@/lib/loans/types'
import type { Idea } from '@/lib/teskeid/types'
import { ReadyTeskeidCard } from '@/components/teskeid/ReadyTeskeidCard'
import { HomeIdeasDrawer } from '@/components/teskeid/HomeIdeasDrawer'
import { getUnreadRecentEventsForUser, recordRecentEvent } from '@/lib/recent-events/helpers.server'
import type { ExpenseRecentEventRow, RecentEventDisplay } from '@/lib/recent-events/types'
import {
  expenseActivityIdFromEventKey,
  resolveExpenseRecentEventTargets,
  resolveRecentEventSourceAccess,
  syncExpenseMemberInvitationEvents,
} from '@/lib/recent-events/access.server'
import {
  getDisplayLocale,
  buildDetailLines,
  EVENT_TYPE_TO_KEY,
  EXPENSE_EVENT_TYPE_TO_KEY,
  formatEventTimestamp,
  isRecentEventSource,
  parseRecentEventRow,
  pickLoanUpdatedLabelKey,
} from '@/lib/recent-events/display'
import { RecentSection, type RecentLabels } from './RecentSection'


export default async function HeimPage() {
  const { user } = await guardTeskeidSession()

  const [t, tLoans, locale] = await Promise.all([
    getTranslations('teskeid.home'),
    getTranslations('teskeid.loans'),
    getLocale(),
  ])

  // Profile + home ideas via authenticated RLS client — no service_role needed.
  // allSettled so a profile failure doesn't also wipe out the ideas list.
  let displayName: string | null = null
  let allIdeas: Idea[] = []
  try {
    const supabase = await createClient()
    const [profileSettled, ideasSettled] = await Promise.allSettled([
      supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      supabase.from('ideas').select('*')
        .eq('is_public', true)
        .order('is_featured', { ascending: false })
        .order('votes_count', { ascending: false }),
    ])
    if (profileSettled.status === 'fulfilled') {
      displayName = profileSettled.value.data?.display_name?.trim() || null
    }
    if (ideasSettled.status === 'fulfilled') {
      if (ideasSettled.value.error) {
        console.error('[heim/page] ideas query failed')
      } else {
        allIdeas = (ideasSettled.value.data ?? []) as Idea[]
      }
    }
  } catch {
    // createClient() failed — fall through to defaults
  }

  const [recentEventAccess, launcher] = await Promise.all([
    resolveRecentEventSourceAccess(user),
    resolveTeskeidLauncher(user),
  ])
  const { loansEnabled, expensesEnabled, sources: recentEventSources } = recentEventAccess
  const visibleLauncherIds = new Set(launcher.featureIds)
  const umonnunEnabled = visibleLauncherIds.has('umonnun')
  const bookkeepingEnabled = visibleLauncherIds.has('bokhaldid')
  const kvissEnabled = visibleLauncherIds.has('kviss')
  const advertiserEnabled = visibleLauncherIds.has('auglysandi')
  const bookingsEnabled = visibleLauncherIds.has('bokanir')
  const eventsEnabled = visibleLauncherIds.has('afmaeli-og-vidburdir')

  const displayLocale = getDisplayLocale(locale)

  const isPromotedPrivateBeta = (idea: Idea) =>
    (idea.slug === 'utlagt-og-endurgreitt' && expensesEnabled)
    || (idea.slug === 'bokhaldid' && bookkeepingEnabled)
    || (idea.slug === 'kviss' && kvissEnabled)
    || (idea.slug === 'auglysandi' && advertiserEnabled)
    || (idea.slug === 'bokanir' && bookingsEnabled)
    || (idea.slug === 'afmaeli-og-vidburdir' && eventsEnabled)
  const visibleIdeas = allIdeas.filter((idea) => (
    (idea.slug !== 'bokhaldid' || bookkeepingEnabled)
    && (idea.slug !== 'bokanir' || bookingsEnabled)
    && (idea.slug !== 'afmaeli-og-vidburdir' || eventsEnabled)
  ))
  const futureIdeas = visibleIdeas.filter((idea) => (
    !visibleLauncherIds.has(idea.slug as typeof launcher.featureIds[number])
    && idea.status !== 'launched'
    && !isPromotedPrivateBeta(idea)
  ))
  const readyCards: Array<{
    idea: Pick<Idea, 'slug' | 'title' | 'short_description' | 'category'>
    href: string
  }> = launcher.items.map((item) => {
    return {
      idea: {
        slug: item.id,
        title: t(item.titleKey as Parameters<typeof t>[0]),
        short_description: t(item.descriptionKey as Parameters<typeof t>[0]),
        // Category is an internal icon fallback and is not rendered as copy.
        category: 'Annað',
      },
      href: item.href,
    }
  })

  let pendingCount = 0
  let invitationsError = false
  let recentEvents: RecentEventDisplay[] = []
  let eventsError = false
  let loans: LoanItem[] = []

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
      const loansResult = await Promise.resolve(
        admin.rpc('get_my_loans', { p_actor_id: user.id })
      ).catch(() => null)

      if (!loansResult || loansResult.error) {
        console.error('[heim/page] pending loan badge query failed')
        invitationsError = true
      } else {
        loans = (loansResult.data ?? []) as LoanItem[]
        pendingCount = loans.filter(
          (loan) =>
            loan.requires_acknowledgement &&
            loan.invitation_status === 'pending' &&
            loan.returned_at === null,
        ).length
        // Best-effort event guarantor: ensure each pending invitation has a recent_events row.
        // updateOnConflict: false means the first write wins — existing rows are never overwritten.
        await Promise.allSettled(
          loans
            .filter(
              (loan) =>
                loan.requires_acknowledgement &&
                loan.invitation_status === 'pending' &&
                loan.returned_at === null &&
                loan.invitation_id !== null,
            )
            .map((loan) =>
              recordRecentEvent({
                userId: user.id,
                source: 'loans',
                eventType: 'loan_invitation_received',
                entityType: 'invitation',
                entityId: loan.invitation_id!,
                eventKey: `loans:invitation:${loan.invitation_id}:received`,
                payload: { itemName: loan.item_name, recipientRole: loan.my_role },
                href: '/auth-mvp/lanad-og-skilad',
                updateOnConflict: false,
              }),
            ),
        )
      }

    }
  }

  if (recentEventSources.length > 0) {
    try {
      if (expensesEnabled) {
        await syncExpenseMemberInvitationEvents(user.id)
      }
      const rows = await getUnreadRecentEventsForUser(user.id, recentEventSources)
      const parsedRows = rows.flatMap((row) => {
        if (!isRecentEventSource(row.source) || !recentEventSources.includes(row.source)) return []
        const parsed = parseRecentEventRow(row)
        return parsed ? [parsed] : []
      })
      const expenseRows = parsedRows.filter(
        (event): event is ExpenseRecentEventRow => event.source === 'expenses',
      )
      const expenseTargets = expensesEnabled
        ? await resolveExpenseRecentEventTargets(user.id, expenseRows)
        : new Map<string, string>()
      const tFn = (key: string, params?: Record<string, string>) =>
        t(key as Parameters<typeof t>[0], params as Parameters<typeof t>[1])

      recentEvents = parsedRows.map((event) => {
        if (event.source === 'expenses') {
          const title = event.payload.expenseTitle ?? event.payload.groupTitle ?? ''
          const activityId = expenseActivityIdFromEventKey(event.event_key)
          return {
            id: event.id,
            label: t(
              EXPENSE_EVENT_TYPE_TO_KEY[event.event_type] as Parameters<typeof t>[0],
              { title },
            ),
            href: event.href,
            viewHref: activityId ? expenseTargets.get(activityId) ?? null : null,
            isDeleted: false,
            detailLines: [],
            occurredAtLabel: formatEventTimestamp(
              event.occurred_at,
              (key) => tLoans(key as Parameters<typeof tLoans>[0]),
            ),
          }
        }

        const itemName = event.payload.itemName ?? ''
        const isDeleted = event.event_type === 'loan_deleted'
        let labelKey: string
        if (event.event_type === 'loan_invitation_received' && event.payload.recipientRole) {
          labelKey = event.payload.recipientRole === 'borrower'
            ? 'eventLoanInvitationReceivedBorrower'
            : 'eventLoanInvitationReceivedLender'
        } else if (event.event_type === 'loan_updated') {
          labelKey = pickLoanUpdatedLabelKey(event.payload.changes)
        } else {
          labelKey = EVENT_TYPE_TO_KEY[event.event_type] ?? event.event_type
        }
        let viewHref: string | null = null
        if (!isDeleted && event.entity_id) {
          if (event.entity_type === 'invitation') {
            const matchingLoan = loans.find((loan) => loan.invitation_id === event.entity_id)
            if (matchingLoan) {
              const params = new URLSearchParams({ from: 'heim' })
              viewHref = `/auth-mvp/lanad-og-skilad/${matchingLoan.id}?${params}`
            } else {
              const params = new URLSearchParams({ invitation: event.entity_id, from: 'heim' })
              viewHref = `/auth-mvp/lanad-og-skilad?${params}`
            }
          } else if (event.entity_type === 'loan') {
            const params = new URLSearchParams({ from: 'heim' })
            viewHref = `/auth-mvp/lanad-og-skilad/${event.entity_id}?${params}`
          }
        }
        return {
          id: event.id,
          label: t(labelKey as Parameters<typeof t>[0], { itemName }),
          href: event.href,
          viewHref,
          isDeleted,
          detailLines: buildDetailLines(event.payload.changes, tFn, displayLocale),
          occurredAtLabel: formatEventTimestamp(
            event.occurred_at,
            (key) => tLoans(key as Parameters<typeof tLoans>[0]),
          ),
        }
      })
    } catch {
      console.error('[heim/page] recent events query failed')
      eventsError = true
    }
  }

  const rowBatch = recentEvents.map((e) => String(e.id)).join('.')
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
          <TeskeidMenu
            variant="authenticated"
            initialFeatureIds={launcher.featureIds}
            initialAgentCollaborationAvailable={launcher.agentCollaborationAvailable}
          />
        </section>

        {/* ── Nýlegt — shared feed for currently-authorized Teskeið sources ─ */}
        {recentEventSources.length > 0 && !eventsError && (
          <RecentSection
            key={rowBatch}
            rows={recentEvents}
            displayLocale={displayLocale}
            labels={recentLabels}
          />
        )}

        {/* ── Teskeiðar — ready cards first, future ideas in collapsed drawer ── */}
        <section id="teskeidar">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">{t('readyTeskeidarTitle')}</h2>

          {readyCards.length > 0 && (
            <div className="flex flex-col gap-3 mb-4">
              {readyCards.map(({ idea, href }) => {
                const pending = idea.slug === 'lanad-og-skilad' && !invitationsError && pendingCount > 0
                  ? pendingCount
                  : undefined
                return (
                  <ReadyTeskeidCard
                    key={idea.slug}
                    idea={idea}
                    href={href}
                    openLabel={t('readyTeskeidOpen')}
                    pendingBadge={pending}
                    pendingBadgeLabel={pending !== undefined ? t('pendingBadgeLabel', { count: pending }) : undefined}
                    titleOverride={idea.slug === 'bokhaldid' ? t('bookkeepingCardTitle') : undefined}
                    descriptionOverride={idea.slug === 'vedrid'
                      ? t('weatherCardDescription')
                      : idea.slug === 'bokhaldid'
                        ? t('bookkeepingCardDescription')
                        : undefined}
                  />
                )
              })}
            </div>
          )}

          <HomeIdeasDrawer
            title={t('homeIdeasTitle')}
            ideas={futureIdeas}
          />
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
