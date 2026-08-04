import Link from 'next/link'
import { Plus, Users, CreditCard, ChevronRight } from 'lucide-react'
import type { ExpenseDashboardView, ExpenseGroupSummaryView } from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseInvitationActions } from './ExpenseInvitationActions'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

function firstOpenBalance(group: ExpenseGroupSummaryView) {
  const balance = group.selfBalances.find((item) => item.amountMinor !== 0)
  return balance ?? null
}

export async function ExpenseDashboard({ dashboard }: { dashboard: ExpenseDashboardView }) {
  const t = await getExpenseTranslations()

  const renderRows = (items: ExpenseGroupSummaryView[]) => (
    <div className="divide-y divide-border border-y border-border">
      {items.map((group) => {
        const balance = firstOpenBalance(group)
        return (
        <Link
          key={group.id}
          href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`}
          className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eef7ea] text-lg">
            {group.emoji || (group.kind === 'group' ? '👥' : '🧾')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{group.name}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('dashboard.expenseCount', { count: group.expenseCount })}
              {balance ? ` · ${t(balance.amountMinor > 0 ? 'dashboard.groupOwedToYou' : 'dashboard.groupYouOwe', { amount: formatExpenseMinor(Math.abs(balance.amountMinor), balance.currency) })}` : ''}
              {group.pendingConfirmationCount > 0 ? ` · ${t('dashboard.pendingCount', { count: group.pendingConfirmationCount })}` : ''}
            </span>
          </span>
          <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
        </Link>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-muted-foreground">{t('dashboard.intro')}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/auth-mvp/utlagt-og-endurgreitt/nytt" className={expensePrimaryButtonClass}>
          <Plus aria-hidden size={18} className="mr-2" />{t('dashboard.addExpense')}
        </Link>
        <Link href="/auth-mvp/utlagt-og-endurgreitt/hopar/nyr" className={expenseSecondaryButtonClass}>
          <Users aria-hidden size={18} className="mr-2" />{t('dashboard.newGroup')}
        </Link>
      </div>

      <section aria-labelledby="expense-summary-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="expense-summary-title" className="text-sm font-semibold">{t('dashboard.summary')}</h2>
            {dashboard.pendingConfirmationCount > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.pendingCount', { count: dashboard.pendingConfirmationCount })}</p> : null}
          </div>
          <Link href="/auth-mvp/utlagt-og-endurgreitt/greidsluleidir" className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            <CreditCard aria-hidden size={16} className="mr-1.5" />{t('dashboard.paymentMethods')}
          </Link>
        </div>
        {dashboard.totals.length === 0 ? (
          <p className="border-y border-border py-4 text-sm text-muted-foreground">{t('dashboard.noBalances')}</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {dashboard.totals.map((total) => (
              <div key={total.currency} className="grid grid-cols-2 gap-4 py-3 text-sm">
                <div><span className="block text-xs text-muted-foreground">{t('dashboard.owedToYou')}</span><strong>{formatExpenseMinor(total.owedToYouMinor, total.currency)}</strong></div>
                <div><span className="block text-xs text-muted-foreground">{t('dashboard.youOwe')}</span><strong>{formatExpenseMinor(total.youOweMinor, total.currency)}</strong></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {dashboard.invitations.length > 0 ? (
        <section aria-labelledby="expense-invitations-title">
          <h2 id="expense-invitations-title" className="mb-3 text-sm font-semibold">{t('dashboard.invitations')}</h2>
          <div className="space-y-4 border-y border-border py-4">
            {dashboard.invitations.map((invitation) => (
              <div key={invitation.groupId} className="space-y-3">
                <div><p className="font-semibold">{invitation.emoji} {invitation.name}</p><p className="text-sm text-muted-foreground">{t('invitation.body', { name: invitation.name })}</p></div>
                <ExpenseInvitationActions invitation={invitation} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {dashboard.groups.length > 0 ? <section><h2 className="mb-2 text-sm font-semibold">{t('dashboard.groups')}</h2>{renderRows(dashboard.groups)}</section> : null}
      {dashboard.oneOffs.length > 0 ? <section><h2 className="mb-2 text-sm font-semibold">{t('dashboard.oneOffs')}</h2>{renderRows(dashboard.oneOffs)}</section> : null}
      {dashboard.groups.length === 0 && dashboard.oneOffs.length === 0 && dashboard.invitations.length === 0 ? (
        <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">{t('dashboard.empty')}</p>
      ) : null}
    </div>
  )
}
