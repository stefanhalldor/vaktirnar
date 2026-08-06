import { getLocale } from 'next-intl/server'
import {
  TeskeidContextEventList,
  TeskeidContextTimeline,
  type TeskeidContextTimelineEvent,
} from '@/components/chat/TeskeidContextTimeline'
import { formatDateOnly, formatDateTime } from '@/lib/date-format'
import { buildExpenseChatTarget } from '@/lib/chat/adapters/expense.server'
import { getOrCreateThread } from '@/lib/chat/repository.server'
import type {
  ExpenseGroupView,
  ExpenseItemView,
  ExpenseRevisionSnapshot,
  ExpenseRevisionView,
} from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { ExpenseChatPanel } from './ExpenseChatPanel'
import { getExpenseTranslations } from './i18n.server'

const REVISION_SUMMARIES = new Set([
  'expense_updated',
  'expense_title_updated',
  'expense_description_updated',
  'expense_title_description_updated',
  'expense_group_reopened_after_expense_edit',
])

function memberAmounts(
  rows: Array<{ displayName: string; amountMinor: number }>,
  currency: string,
): string {
  return rows.map((row) => `${row.displayName}: ${formatExpenseMinor(row.amountMinor, currency)}`).join(' · ')
}

export async function ExpenseItemHistory({ group, expense }: {
  group: ExpenseGroupView
  expense: ExpenseItemView
}) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  let chatThreadId: string | null = null
  if (process.env.TESKEID_CHAT_ENABLED === 'true') {
    try {
      chatThreadId = (await getOrCreateThread(buildExpenseChatTarget(expense))).id
    } catch {
      // History remains usable before SQL106 is applied or during a chat outage.
      chatThreadId = null
    }
  }
  const revisionsByActivity = new Map(expense.revisions.map((revision) => [revision.activityId, revision]))
  const activity = group.activity.filter((row) => (
    group.kind === 'one_off'
      ? row.entityType !== 'payment_preference'
      : row.entityType === 'expense' && row.entityId === expense.id
  ))
  const timeline: Array<{
    id: string
    createdAt: string
    revision?: ExpenseRevisionView
    activity?: ExpenseGroupView['activity'][number]
  }> = activity.map((row) => ({
    id: `activity:${row.id}`,
    createdAt: row.createdAt,
    activity: row,
    revision: revisionsByActivity.get(row.id),
  }))
  const includedRevisionIds = new Set(timeline.flatMap((row) => row.revision ? [row.revision.id] : []))
  for (const revision of expense.revisions) {
    if (!includedRevisionIds.has(revision.id)) {
      timeline.push({ id: `revision:${revision.id}`, createdAt: revision.createdAt, revision })
    }
  }
  function snapshotValue(snapshot: ExpenseRevisionSnapshot, field: string): string {
    if (field === 'title') return snapshot.expense.title
    if (field === 'note') return snapshot.expense.note || t('history.none')
    if (field === 'total_minor') return formatExpenseMinor(snapshot.expense.totalMinor, snapshot.expense.currency)
    if (field === 'currency') return snapshot.expense.currency
    if (field === 'incurred_on') return formatDateOnly(snapshot.expense.incurredOn, locale)
    if (field === 'category') return snapshot.expense.category
      ? t(`categories.${snapshot.expense.category}`)
      : t('history.none')
    if (field === 'split_method') return t(`splitMethods.${snapshot.expense.splitMethod}`)
    if (field === 'payments') return memberAmounts(snapshot.payments, snapshot.expense.currency)
    if (field === 'shares') return memberAmounts(snapshot.shares, snapshot.expense.currency)
    return t('history.none')
  }

  function settlementValue(snapshot: ExpenseRevisionSnapshot): string {
    return snapshot.balances.length > 0
      ? memberAmounts(snapshot.balances, snapshot.expense.currency)
      : t('history.settled')
  }

  const systemEvents: TeskeidContextTimelineEvent[] = timeline.map((row) => {
    const revision = row.revision
    const actor = revision?.actorDisplayName || row.activity?.actorDisplayName || t('history.unknownActor')
    const summaryCode = revision?.summaryCode ?? row.activity?.summaryCode
    const title = summaryCode && REVISION_SUMMARIES.has(summaryCode)
      ? t(`activitySummary.${summaryCode}`)
      : row.activity
        ? t(`activity.${row.activity.eventType}`)
        : t('activity.expense_updated')
    if (!revision) {
      return {
        id: row.id,
        createdAt: row.createdAt,
        content: (
          <div className="text-sm">
            <p>{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{actor} · {formatDateTime(row.createdAt, locale)}</p>
          </div>
        ),
      }
    }
    const settlementChanged = revision.changedFields.some((field) => (
      field === 'total_minor' || field === 'currency' || field === 'payments' || field === 'shares'
    )) || revision.before.groupStatus !== revision.after.groupStatus
    return {
      id: row.id,
      createdAt: row.createdAt,
      content: (
        <details>
          <summary className="min-h-11 cursor-pointer list-none text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <span className="block font-medium">{title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{actor} · {formatDateTime(row.createdAt, locale)}</span>
            <span className="mt-1 block text-xs text-primary">{t('history.showChanges')}</span>
          </summary>
          <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
            {revision.changedFields.map((field) => (
              <div key={field} className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
                <dt className="font-medium">{t(`history.fields.${field}`)}</dt>
                <dd className="min-w-0 break-words text-muted-foreground">
                  <span className="block">{t('history.before')}: {snapshotValue(revision.before, field)}</span>
                  <span className="mt-1 block text-foreground">{t('history.after')}: {snapshotValue(revision.after, field)}</span>
                </dd>
              </div>
            ))}
            {settlementChanged ? (
              <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
                <dt className="font-medium">{t('history.settlementImpact')}</dt>
                <dd className="min-w-0 break-words text-muted-foreground">
                  <span className="block">{t('history.before')}: {settlementValue(revision.before)}</span>
                  <span className="mt-1 block text-foreground">{t('history.after')}: {settlementValue(revision.after)}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </details>
      ),
    }
  })

  return (
    <TeskeidContextTimeline title={t('history.title')}>
      {chatThreadId ? (
        <ExpenseChatPanel
          expenseId={expense.id}
          threadId={chatThreadId}
          timelineEvents={systemEvents}
        />
      ) : (
        <div className="space-y-3">
          <TeskeidContextEventList events={systemEvents} emptyLabel={t('history.empty')} />
          <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            {t('history.chatUnavailable')}
          </p>
        </div>
      )}
    </TeskeidContextTimeline>
  )
}
