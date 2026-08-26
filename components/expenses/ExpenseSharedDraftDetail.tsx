import { getLocale } from 'next-intl/server'

import type { ExpenseSharedDraftDetailView } from '@/lib/expenses/unconfirmed-publication'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { getExpenseTranslations } from './i18n.server'

type ReadySharedDraft = Extract<ExpenseSharedDraftDetailView, { status: 'ready' }>

function formatDraftDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export async function ExpenseSharedDraftDetail({ draft }: { draft: ReadySharedDraft }) {
  const [t, locale] = await Promise.all([getExpenseTranslations(), getLocale()])
  const allocationReady = draft.allocationState === 'balanced_unconfirmed'
  const author = draft.parties.find((party) => party.isAuthor)!
  const authorFirstName = author.displayName.split(/\s+/)[0]!

  return (
    <div className="space-y-8">
      <section aria-labelledby="shared-draft-summary" className="space-y-4 border-y border-border py-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary">{t('sharedDraftDetail.lifecycle')}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t('sharedDraftDetail.helper')}</p>
        </div>
        <h2 id="shared-draft-summary" className="sr-only">{t('sharedDraftDetail.summary')}</h2>
        <dl className="divide-y divide-border">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3 first:pt-0">
            <dt className="text-sm text-muted-foreground">{t('sharedDraftDetail.total')}</dt>
            <dd className="min-w-0 text-sm font-semibold">
              {formatExpenseMinor(draft.totalMinor, draft.currency, locale)}
            </dd>
          </div>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3">
            <dt className="text-sm text-muted-foreground">{t('common.date')}</dt>
            <dd className="min-w-0 text-sm font-medium">
              <time dateTime={draft.incurredOn}>{formatDraftDate(draft.incurredOn, locale)}</time>
            </dd>
          </div>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 pt-3">
            <dt className="text-sm text-muted-foreground">{t('common.status')}</dt>
            <dd className="min-w-0 text-sm font-medium">
              {allocationReady
                ? t('sharedDraftDetail.balancedStatus', { firstName: authorFirstName })
                : t('sharedDraftDetail.incompleteStatus')}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="shared-draft-allocation" className="space-y-3">
        <div className="space-y-1">
          <h2 id="shared-draft-allocation" className="text-base font-semibold">
            {t('sharedDraftDetail.allocationTitle')}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('sharedDraftDetail.participantHelper')}
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {draft.parties.map((party, index) => {
            const roles = [
              party.isAuthor ? t('sharedDraftDetail.authorRole') : null,
              party.isPayer ? t('sharedDraftDetail.payerRole') : null,
              party.isParticipant ? t('sharedDraftDetail.participantRole') : null,
            ].filter((role): role is string => role !== null)
            return (
              <div key={`${index}:${party.displayName}`} className="space-y-2 py-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{party.displayName}</p>
                  <p className="text-xs text-muted-foreground">{roles.join(' · ')}</p>
                </div>
                {allocationReady ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t('sharedDraftDetail.proposedPaid')}
                      </dt>
                      <dd className="mt-0.5 font-medium">
                        {formatExpenseMinor(party.proposedPaidMinor ?? 0, draft.currency, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        {t('sharedDraftDetail.proposedShare')}
                      </dt>
                      <dd className="mt-0.5 font-medium">
                        {formatExpenseMinor(party.proposedShareMinor ?? 0, draft.currency, locale)}
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
