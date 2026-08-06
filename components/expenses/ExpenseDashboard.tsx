import Link from 'next/link'
import { Plus, Users, CreditCard } from 'lucide-react'
import type { ExpenseDashboardView, ExpensePaymentProfileV2View } from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { formatExpenseBankAccount, formatExpenseNationalIdDraft } from '@/lib/expenses/payment-profile'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseInvitationActions } from './ExpenseInvitationActions'
import { ExpenseMemberInvitationActions } from './ExpenseMemberInvitationActions'
import { ExpenseDashboardDirectory } from './ExpenseDashboardDirectory'
import { expensePrimaryButtonClass, expenseSecondaryButtonClass } from './ui'

export async function ExpenseDashboard({
  dashboard,
  paymentProfile,
  canUseCircles,
}: {
  dashboard: ExpenseDashboardView
  paymentProfile: ExpensePaymentProfileV2View
  canUseCircles: boolean
}) {
  const t = await getExpenseTranslations()
  const memberInvitations = dashboard.memberInvitations ?? []
  const allItems = [...dashboard.groups, ...dashboard.oneOffs]
  const paymentDetails = paymentProfile.details
  const bankAccount = paymentDetails ? formatExpenseBankAccount(paymentDetails) : null

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-muted-foreground">{t('dashboard.intro')}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/auth-mvp/utlagt-og-endurgreitt/nytt" className={expensePrimaryButtonClass}>
          <Plus aria-hidden size={18} className="mr-2" />{t('dashboard.addExpense')}
        </Link>
        {canUseCircles ? <Link href="/stillingar/tengsl/hringir" className={expenseSecondaryButtonClass}>
          <Users aria-hidden size={18} className="mr-2" />{t('dashboard.relationshipCircles')}
        </Link> : null}
      </div>

      <section aria-labelledby="expense-summary-title">
        <div className="mb-3">
          <div>
            <h2 id="expense-summary-title" className="text-sm font-semibold">{t('dashboard.summary')}</h2>
            {dashboard.pendingConfirmationCount > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.pendingCount', { count: dashboard.pendingConfirmationCount })}</p> : null}
          </div>
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

      {memberInvitations.length > 0 ? (
        <section aria-labelledby="expense-member-invitations-title">
          <h2 id="expense-member-invitations-title" className="mb-3 text-sm font-semibold">
            {t('memberInvitation.inboxTitle')}
          </h2>
          <div className="space-y-5 border-y border-border py-4">
            {memberInvitations.map((invitation) => (
              <div key={invitation.invitationId} className="space-y-3">
                <Link
                  href={`/auth-mvp/utlagt-og-endurgreitt/bod/adili/${invitation.invitationId}`}
                  className="block min-h-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block font-semibold">{invitation.contextTitle}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {t('memberInvitation.inboxBody', {
                      inviter: invitation.inviterDisplayName ?? t('memberInvitation.unknownInviter'),
                    })}
                  </span>
                </Link>
                <ExpenseMemberInvitationActions invitationId={invitation.invitationId} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {allItems.length > 0 ? <ExpenseDashboardDirectory items={allItems} /> : null}
      {allItems.length === 0 && dashboard.invitations.length === 0 && memberInvitations.length === 0 ? (
        <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">{t('dashboard.empty')}</p>
      ) : null}

      <section aria-labelledby="expense-payment-profile-title" className="space-y-3 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="expense-payment-profile-title" className="text-sm font-semibold">{t('dashboard.paymentProfile')}</h2>
          <Link href="/auth-mvp/utlagt-og-endurgreitt/greidsluleidir" className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
            <CreditCard aria-hidden size={16} className="mr-1.5" />{t(paymentDetails ? 'dashboard.editPaymentMethods' : 'dashboard.paymentMethods')}
          </Link>
        </div>
        {paymentDetails ? (
          <dl className="space-y-2 text-sm">
            {bankAccount ? <div><dt className="text-xs text-muted-foreground">{t('preferences.bankAccount')}</dt><dd>{bankAccount}</dd></div> : null}
            {paymentDetails.nationalId ? <div><dt className="text-xs text-muted-foreground">{t('preferences.nationalId')}</dt><dd>{formatExpenseNationalIdDraft(paymentDetails.nationalId)}</dd></div> : null}
            {paymentDetails.other ? <div><dt className="text-xs text-muted-foreground">{t('preferences.other')}</dt><dd className="whitespace-pre-wrap break-words">{paymentDetails.other}</dd></div> : null}
          </dl>
        ) : <p className="text-sm text-muted-foreground">{t('dashboard.noPaymentProfile')}</p>}
      </section>
    </div>
  )
}
