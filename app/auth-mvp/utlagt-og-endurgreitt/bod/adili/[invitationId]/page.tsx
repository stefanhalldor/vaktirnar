import { notFound } from 'next/navigation'
import { ExpenseMemberInvitationActions } from '@/components/expenses/ExpenseMemberInvitationActions'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { ClosedTestingAccessRequest } from '@/components/teskeid/ClosedTestingAccessRequest'
import { guardExpenseSession } from '@/lib/expenses/guard'
import { getExpenseMemberInvitationPreview } from '@/lib/expenses/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { formatDateOnly } from '@/lib/date-format'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getLocale } from 'next-intl/server'

export default async function ExpenseMemberInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  const [{ invitationId }, { user }, t, locale] = await Promise.all([
    params,
    guardExpenseSession(),
    getExpenseTranslations(),
    getLocale(),
  ])
  const [invitation, hasExpenseAccess] = await Promise.all([
    getExpenseMemberInvitationPreview(user.id, invitationId),
    checkFeatureAccess(user.id, user.email!, 'utlagt-og-endurgreitt'),
  ])
  if (!invitation) notFound()

  return (
    <ExpenseShell
      title={t('memberInvitation.title')}
      homeLabel={t('homeLabel')}
      backHref={hasExpenseAccess ? '/auth-mvp/utlagt-og-endurgreitt' : '/auth-mvp/heim'}
      backLabel={t('back')}
    >
      <div className="space-y-5">
        <section className="space-y-4 border-y border-border py-5">
          <div>
            <p className="text-lg font-semibold">{invitation.expenseTitle}</p>
            {invitation.description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{invitation.description}</p> : null}
            <p className="mt-2 text-sm font-semibold">{formatExpenseMinor(invitation.totalMinor, invitation.currency, locale)}</p>
            <p className="text-xs text-muted-foreground">{formatDateOnly(invitation.incurredOn, locale)}</p>
          </div>
          <dl className="space-y-2 text-sm">
            {invitation.inviterDisplayName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t('memberInvitation.from')}</dt>
                <dd className="text-right font-medium">{invitation.inviterDisplayName}</dd>
              </div>
            ) : null}
          </dl>
          <div>
            <h2 className="text-sm font-semibold">{t('memberInvitation.payers')}</h2>
            <ul className="mt-2 divide-y divide-border">
              {invitation.payers.map((party, index) => (
                <li key={`${party.displayName}:${index}`} className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 break-words">{party.displayName}</span>
                  <strong className="shrink-0">{formatExpenseMinor(party.amountMinor, invitation.currency, locale)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold">{t('memberInvitation.participants')}</h2>
            <ul className="mt-2 divide-y divide-border">
              {invitation.participants.map((party, index) => (
                <li key={`${party.displayName}:${index}`} className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 break-words">{party.displayName}</span>
                  <strong className="shrink-0">{formatExpenseMinor(party.amountMinor, invitation.currency, locale)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {!hasExpenseAccess ? (
          <ClosedTestingAccessRequest
            featureId="utlagt-og-endurgreitt"
            reason="participant"
          />
        ) : null}
        <p className="text-sm leading-6 text-muted-foreground">{t('memberInvitation.claimHint')}</p>
        <ExpenseMemberInvitationActions
          invitationId={invitation.invitationId}
          expenseId={invitation.expenseId}
          hasExpenseAccess={hasExpenseAccess}
        />
      </div>
    </ExpenseShell>
  )
}
