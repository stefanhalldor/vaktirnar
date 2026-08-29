import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { AlertTriangle, ChevronRight, FilePenLine, Plus, CreditCard, UsersRound, WalletCards } from 'lucide-react'
import type {
  ExpenseDashboardSharedDraftSummaryView,
  ExpenseDashboardView,
  ExpenseIncompleteDraftSummaryView,
  ExpensePaymentProfileV2View,
} from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { formatExpenseBankAccount, formatExpenseNationalIdDraft } from '@/lib/expenses/payment-profile'
import { getExpenseTranslations } from './i18n.server'
import { ExpenseInvitationActions } from './ExpenseInvitationActions'
import { ExpenseDashboardDirectory } from './ExpenseDashboardDirectory'
import { expensePrimaryButtonClass } from './ui'

function incompleteDraftHref(draft: ExpenseIncompleteDraftSummaryView): string {
  if (draft.contextType === 'edit' && draft.expenseId) {
    return `/auth-mvp/utlagt-og-endurgreitt/utgjold/${draft.expenseId}/breyta?step=split&draft=${draft.id}`
  }
  if (draft.contextType === 'group' && draft.groupId) {
    return `/auth-mvp/utlagt-og-endurgreitt/hopar/${draft.groupId}/nytt-utgjald?draft=${draft.id}`
  }
  return `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${draft.id}`
}

function sharedDraftHref(draft: ExpenseDashboardSharedDraftSummaryView): string | null {
  if (draft.viewerRole === 'participant') {
    return draft.detailTarget.kind === 'shared_draft'
      && draft.detailTarget.publicationId === draft.publicationId
      ? `/auth-mvp/utlagt-og-endurgreitt/drog/${draft.publicationId}`
      : null
  }
  if (
    draft.detailTarget.kind !== 'private_draft'
    || draft.authorDraft === null
  ) {
    return null
  }

  if (draft.authorDraft.contextType === 'group') {
    return draft.authorDraft.groupId
      ? `/auth-mvp/utlagt-og-endurgreitt/hopar/${draft.authorDraft.groupId}/nytt-utgjald?draft=${draft.detailTarget.draftId}`
      : null
  }

  return draft.authorDraft.groupId === null
    ? `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${draft.detailTarget.draftId}`
    : null
}

export async function ExpenseDashboard({
  dashboard,
  paymentProfile,
}: {
  dashboard: ExpenseDashboardView
  paymentProfile: ExpensePaymentProfileV2View
}) {
  const [t, locale] = await Promise.all([
    getExpenseTranslations(),
    getLocale(),
  ])
  const memberInvitations = dashboard.memberInvitations ?? []
  const allItems = [...dashboard.groups, ...dashboard.oneOffs]
  const paymentDetails = paymentProfile.details
  const bankAccount = paymentDetails ? formatExpenseBankAccount(paymentDetails) : null
  const sharedDrafts = dashboard.sharedDrafts.status === 'ready'
    ? dashboard.sharedDrafts.items
    : []
  const sharedAuthorDraftIds = new Set(sharedDrafts.flatMap((draft) => (
    draft.viewerRole === 'author' && draft.detailTarget.kind === 'private_draft'
      ? [draft.detailTarget.draftId]
      : []
  )))
  const privateDrafts = dashboard.privateDrafts.status === 'ready'
    ? dashboard.privateDrafts.items.filter((draft) => (
        draft.contextType !== 'edit' && !sharedAuthorDraftIds.has(draft.id)
      ))
    : []
  const renderPrivateDraftRows = (items: typeof privateDrafts) => (
    <div className="divide-y divide-border border-y border-border">
      {items.map((draft) => (
        <Link key={draft.id} href={incompleteDraftHref(draft)} className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full ${draft.needsAttention ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>
            {draft.needsAttention ? <AlertTriangle size={18} /> : <FilePenLine size={18} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{draft.title || t('dashboard.untitledDraft')}</span>
            <span className={`mt-0.5 block text-xs ${draft.needsAttention ? 'text-amber-800' : 'text-muted-foreground'}`}>
              {t(draft.needsAttention ? 'dashboard.splitNeedsAttention' : 'dashboard.draftContinue')}
            </span>
            {draft.totalMinor !== null ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatExpenseMinor(draft.totalMinor, draft.currency, locale)}
                {draft.differenceMinor !== null && draft.differenceMinor > 0
                  ? ` · ${t('dashboard.unallocated', { amount: formatExpenseMinor(draft.differenceMinor, draft.currency, locale) })}`
                  : draft.differenceMinor !== null && draft.differenceMinor < 0
                    ? ` · ${t('dashboard.overallocated', { amount: formatExpenseMinor(Math.abs(draft.differenceMinor), draft.currency, locale) })}`
                    : ''}
              </span>
            ) : null}
          </span>
          <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  )
  const renderSharedDraftRow = (draft: ExpenseDashboardSharedDraftSummaryView) => {
    const href = sharedDraftHref(draft)
    const content = (
      <>
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UsersRound size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{draft.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {draft.hasUnsharedChanges === true
              ? t('dashboard.unsharedChanges')
              : draft.allocationState === 'incomplete'
                ? t('dashboard.sharedDraftIncomplete')
                : t('dashboard.sharedDraftInProgress')}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {formatExpenseMinor(draft.totalMinor, draft.currency, locale)}
          </span>
        </span>
        {href ? <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" /> : null}
      </>
    )

    return href ? (
      <Link
        key={draft.publicationId}
        href={href}
        className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    ) : (
      <div key={draft.publicationId} className="flex min-h-16 items-center gap-3 py-3">
        {content}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-6 text-muted-foreground">{t('dashboard.intro')}</p>

      <div>
        <Link href="/auth-mvp/utlagt-og-endurgreitt/nytt" className={expensePrimaryButtonClass}>
          <Plus aria-hidden size={18} className="mr-2" />{t('dashboard.addExpense')}
        </Link>
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
                <div><span className="block text-xs text-muted-foreground">{t('dashboard.owedToYou')}</span><strong>{formatExpenseMinor(total.owedToYouMinor, total.currency, locale)}</strong></div>
                <div><span className="block text-xs text-muted-foreground">{t('dashboard.youOwe')}</span><strong>{formatExpenseMinor(total.youOweMinor, total.currency, locale)}</strong></div>
              </div>
            ))}
          </div>
        )}
        {dashboard.hasPayAllItems ? (
          <Link
            href="/auth-mvp/utlagt-og-endurgreitt/gera-upp"
            className={`${expensePrimaryButtonClass} mt-4 w-full`}
          >
            <WalletCards aria-hidden size={18} className="mr-2" />
            {t('dashboard.settleAll')}
          </Link>
        ) : null}
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
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {privateDrafts.length > 0 || dashboard.privateDrafts.status === 'unavailable' ? (
        <section aria-labelledby="expense-private-drafts-title" className="space-y-3">
          <div>
            <h2 id="expense-private-drafts-title" className="text-sm font-semibold">
              {t('dashboard.privateDrafts')}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('dashboard.privateDraftsHelper')}
            </p>
          </div>
          {dashboard.privateDrafts.status === 'unavailable' ? (
            <p role="status" className="border-y border-border py-4 text-sm text-muted-foreground">
              {t('dashboard.privateDraftsUnavailable')}
            </p>
          ) : renderPrivateDraftRows(privateDrafts)}
        </section>
      ) : null}

      {sharedDrafts.length > 0 || dashboard.sharedDrafts.status === 'unavailable' ? (
        <section aria-labelledby="expense-shared-drafts-title" className="space-y-3">
          <div>
            <h2 id="expense-shared-drafts-title" className="text-sm font-semibold">
              {t('dashboard.sharedDrafts')}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('dashboard.sharedDraftsHelper')}
            </p>
          </div>
          {dashboard.sharedDrafts.status === 'unavailable' ? (
            <p role="status" className="border-y border-border py-4 text-sm text-muted-foreground">
              {t('dashboard.sharedDraftsUnavailable')}
            </p>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {sharedDrafts.map(renderSharedDraftRow)}
            </div>
          )}
        </section>
      ) : null}

      {allItems.length > 0 ? (
        <ExpenseDashboardDirectory items={allItems} locale={locale} />
      ) : null}
      {allItems.length === 0
        && dashboard.invitations.length === 0
        && memberInvitations.length === 0
        && privateDrafts.length === 0
        && sharedDrafts.length === 0
        && dashboard.privateDrafts.status === 'ready'
        && dashboard.sharedDrafts.status === 'ready' ? (
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
