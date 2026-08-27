'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { attachExpenseToEvent } from '@/lib/expenses/actions'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import type {
  EventAttachableExpenseDirectoryView,
  EventExpenseVisibility,
} from '@/lib/events/contracts'
import { useExpenseTranslations } from './i18n.client'

export function EventAttachExistingExpense({
  eventId,
  rosterRevision,
  directory,
}: {
  eventId: string
  rosterRevision: number
  directory: EventAttachableExpenseDirectoryView
}) {
  const t = useExpenseTranslations()
  const router = useRouter()
  const [selectedExpenseId, setSelectedExpenseId] = useState('')
  const [visibility, setVisibility] = useState<EventExpenseVisibility>('participants_only')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const requestIds = useRef(new Map<string, string>())
  const selectedExpense = directory.expenses.find((expense) => expense.id === selectedExpenseId) ?? null

  if (directory.status === 'unavailable') {
    return (
      <section className="border-t border-border py-5">
        <h2 className="text-base font-semibold">{t('expense.attachExistingTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('expense.attachExistingUnavailable')}</p>
      </section>
    )
  }
  if (directory.status === 'none') return null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedExpense || isPending) return
    setError(null)
    setStatus(null)
    const requestKey = JSON.stringify([
      eventId,
      rosterRevision,
      selectedExpense.id,
      selectedExpense.financialVersion,
      visibility,
    ])
    const requestId = requestIds.current.get(requestKey) ?? globalThis.crypto.randomUUID()
    requestIds.current.set(requestKey, requestId)
    startTransition(async () => {
      let result
      try {
        result = await attachExpenseToEvent({
          expense_id: selectedExpense.id,
          event_id: eventId,
          expected_financial_version: selectedExpense.financialVersion,
          expected_event_roster_revision: rosterRevision,
          visibility,
          request_id: requestId,
        })
      } catch {
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        return
      }
      requestIds.current.delete(requestKey)
      setSelectedExpenseId('')
      setVisibility('participants_only')
      setStatus(t('expense.eventLinkUpdated'))
      router.refresh()
    })
  }

  return (
    <section className="border-t border-border py-5">
      <h2 className="text-base font-semibold">{t('expense.attachExistingTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('expense.attachExistingDescription')}</p>
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <fieldset disabled={isPending} className="space-y-2">
          <legend className="text-sm font-medium">{t('expense.attachExistingChoose')}</legend>
          {directory.expenses.map((expense) => (
            <label key={expense.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2">
              <input
                type="radio"
                name="existing-expense"
                value={expense.id}
                checked={selectedExpenseId === expense.id}
                onChange={() => setSelectedExpenseId(expense.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{expense.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatExpenseMinor(expense.totalMinor, expense.currency)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset disabled={isPending} className="space-y-2">
          <legend className="text-sm font-medium">{t('eventVisibility.legend')}</legend>
          {(['participants_only', 'all_event'] as const).map((value) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-3">
              <input
                type="radio"
                name="existing-expense-visibility"
                value={value}
                checked={visibility === value}
                onChange={() => setVisibility(value)}
              />
              <span className="text-sm">
                {value === 'participants_only'
                  ? t('eventVisibility.participantsOnly')
                  : t('eventVisibility.allEvent')}
              </span>
            </label>
          ))}
        </fieldset>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}
        <button
          type="submit"
          disabled={!selectedExpense || isPending}
          className="min-h-11 w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isPending ? t('expense.attachExistingPending') : t('expense.attachExistingAction')}
        </button>
      </form>
    </section>
  )
}
