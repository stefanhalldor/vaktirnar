'use client'

import type { ExpenseCreationDraftDeleteCapabilityView } from '@/lib/expenses/contracts'
import { ExpenseDeleteControl } from './ExpenseDeleteControl'
import { useExpenseTranslations } from './i18n.client'

export function ExpenseDraftDeleteOnly({
  capability,
  statusHref,
  successHref,
}: {
  capability: Extract<ExpenseCreationDraftDeleteCapabilityView, { status: 'ready' }>
  statusHref: string
  successHref: string
}) {
  const t = useExpenseTranslations()

  return (
    <section
      aria-labelledby="expense-draft-delete-only-heading"
      className="space-y-5 border-y border-border py-6"
    >
      <div className="space-y-2">
        <h2 id="expense-draft-delete-only-heading" className="text-base font-semibold">
          {t('deleteControl.deleteOnly.heading')}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('deleteControl.deleteOnly.body')}
        </p>
      </div>
      <ExpenseDeleteControl
        target={{ kind: 'creation_draft', capability }}
        creatorKnown
        statusHref={statusHref}
        successHref={successHref}
      />
    </section>
  )
}
