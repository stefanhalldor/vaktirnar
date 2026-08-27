'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ExpenseGroupSummaryView } from '@/lib/expenses/contracts'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'

type LifecycleView = 'active' | 'settled' | 'cancelled'
type DashboardView = 'all' | LifecycleView

function classifyLifecycle(group: ExpenseGroupSummaryView): LifecycleView | null {
  if (group.expenseCount === 0) return null
  if (group.cancelled) return 'cancelled'
  if (
    group.pendingConfirmationCount > 0
    || group.selfBalances.some((balance) => balance.amountMinor !== 0)
  ) return 'active'
  return 'settled'
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value]
}

function intersectValues(values: string[], validValues: Set<string>) {
  return values.filter((value) => validValues.has(value))
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function getValidAuxiliaryValues(items: ExpenseGroupSummaryView[]) {
  const counterpartyKeys = new Set<string>()
  const circleIds = new Set<string>()
  for (const item of items) {
    for (const counterparty of item.counterparties ?? []) counterpartyKeys.add(counterparty.key)
    for (const circle of item.relationshipCircles ?? []) circleIds.add(circle.id)
  }
  return { counterpartyKeys, circleIds }
}

export function ExpenseDashboardDirectory({
  items,
  locale,
}: {
  items: ExpenseGroupSummaryView[]
  locale: string
}) {
  const t = useExpenseTranslations()
  const [view, setView] = useState<DashboardView>('active')
  const [counterpartyKeys, setCounterpartyKeys] = useState<string[]>([])
  const [circleIds, setCircleIds] = useState<string[]>([])

  const confirmedItems = useMemo(
    () => items.filter((item) => classifyLifecycle(item) !== null),
    [items],
  )

  const lifecycleBaseItems = useMemo(
    () => view === 'all'
      ? confirmedItems
      : confirmedItems.filter((item) => classifyLifecycle(item) === view),
    [confirmedItems, view],
  )

  const counterparties = useMemo(() => {
    const labels = new Map<string, string>()
    for (const item of lifecycleBaseItems) {
      for (const counterparty of item.counterparties ?? []) {
        labels.set(counterparty.key, counterparty.label)
      }
    }
    return [...labels].map(([key, label]) => ({ key, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'is'))
  }, [lifecycleBaseItems])

  const circles = useMemo(() => {
    const labels = new Map<string, string>()
    for (const item of lifecycleBaseItems) {
      for (const circle of item.relationshipCircles ?? []) labels.set(circle.id, circle.name)
    }
    return [...labels].map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'is'))
  }, [lifecycleBaseItems])

  const validCounterpartyKeys = useMemo(
    () => new Set(counterparties.map((person) => person.key)),
    [counterparties],
  )
  const validCircleIds = useMemo(
    () => new Set(circles.map((circle) => circle.id)),
    [circles],
  )
  const effectiveCounterpartyKeys = intersectValues(counterpartyKeys, validCounterpartyKeys)
  const effectiveCircleIds = intersectValues(circleIds, validCircleIds)

  useEffect(() => {
    setCounterpartyKeys((current) => {
      const next = intersectValues(current, validCounterpartyKeys)
      return arraysEqual(current, next) ? current : next
    })
    setCircleIds((current) => {
      const next = intersectValues(current, validCircleIds)
      return arraysEqual(current, next) ? current : next
    })
  }, [validCircleIds, validCounterpartyKeys])

  const visibleItems = lifecycleBaseItems.filter((item) => {
    const itemCounterparties = new Set((item.counterparties ?? []).map((person) => person.key))
    const itemCircles = new Set((item.relationshipCircles ?? []).map((circle) => circle.id))
    if (effectiveCounterpartyKeys.some((key) => !itemCounterparties.has(key))) return false
    if (effectiveCircleIds.length > 0 && !effectiveCircleIds.some((id) => itemCircles.has(id))) return false
    return true
  })

  const hasAuxiliaryFilters = effectiveCounterpartyKeys.length > 0 || effectiveCircleIds.length > 0

  function selectView(nextView: DashboardView) {
    const nextBaseItems = nextView === 'all'
      ? confirmedItems
      : confirmedItems.filter((item) => classifyLifecycle(item) === nextView)
    const validValues = getValidAuxiliaryValues(nextBaseItems)
    setCounterpartyKeys((current) => intersectValues(current, validValues.counterpartyKeys))
    setCircleIds((current) => intersectValues(current, validValues.circleIds))
    setView(nextView)
  }

  return (
    <section aria-labelledby="expense-directory-title" className="space-y-4">
      <h2 id="expense-directory-title" className="sr-only">{t('dashboard.entries')}</h2>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('dashboard.viewAriaLabel')}>
        {(['all', 'active', 'settled', 'cancelled'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={view === candidate}
            className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${view === candidate ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
            onClick={() => selectView(candidate)}
          >
            {t(`dashboard.views.${candidate}`)}
          </button>
        ))}
      </div>

      {counterparties.length > 0 || circles.length > 0 ? (
        <div className="space-y-3 rounded-xl bg-muted/60 p-3">
          {counterparties.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold">{t('dashboard.filterPeople')}</legend>
              <div className="flex flex-wrap gap-2">
                {counterparties.map((person) => {
                  const selected = effectiveCounterpartyKeys.includes(person.key)
                  return <button key={person.key} type="button" aria-pressed={selected} className={`min-h-10 rounded-full border px-3 text-sm ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`} onClick={() => setCounterpartyKeys((current) => toggleValue(current, person.key))}>{person.label}</button>
                })}
              </div>
            </fieldset>
          ) : null}
          {circles.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold">{t('dashboard.filterCircles')}</legend>
              <div className="flex flex-wrap gap-2">
                {circles.map((circle) => {
                  const selected = effectiveCircleIds.includes(circle.id)
                  return <button key={circle.id} type="button" aria-pressed={selected} className={`min-h-10 rounded-full border px-3 text-sm ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`} onClick={() => setCircleIds((current) => toggleValue(current, circle.id))}>{circle.name}</button>
                })}
              </div>
            </fieldset>
          ) : null}
          {hasAuxiliaryFilters ? (
            <button type="button" className="min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setCounterpartyKeys([]); setCircleIds([]) }}>{t('dashboard.clearFilters')}</button>
          ) : null}
        </div>
      ) : null}

      {visibleItems.length > 0 ? (
        <div className="divide-y divide-border border-y border-border">
          {visibleItems.map((group) => {
            const balanceLabels = group.selfBalances
              .filter((balance) => balance.amountMinor !== 0)
              .map((balance) => t(
                balance.amountMinor > 0 ? 'dashboard.groupOwedToYou' : 'dashboard.groupYouOwe',
                { amount: formatExpenseMinor(Math.abs(balance.amountMinor), balance.currency, locale) },
              ))
            const statusLabels = [
              ...(group.cancelled
                ? [t('dashboard.cancelled')]
                : balanceLabels.length > 0
                  ? balanceLabels
                  : group.pendingConfirmationCount === 0
                    ? [t('dashboard.settled')]
                    : []),
              ...(group.pendingConfirmationCount > 0
                ? [t('dashboard.pendingCount', { count: group.pendingConfirmationCount })]
                : []),
            ]
            return (
              <Link key={group.id} href={`/auth-mvp/utlagt-og-endurgreitt/hopar/${group.id}`} className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eef7ea] text-lg">{group.emoji || '🧾'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{group.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {statusLabels.join(' · ')}
                  </span>
                  {(group.relationshipCircles ?? []).length > 0 ? <span className="mt-1 block truncate text-xs text-muted-foreground">{group.relationshipCircles!.map((circle) => circle.name).join(' · ')}</span> : null}
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="border-y border-border py-6 text-center text-sm text-muted-foreground">
          {t(lifecycleBaseItems.length === 0
            ? `dashboard.no${view[0]!.toUpperCase()}${view.slice(1)}`
            : 'dashboard.noFilterResults')}
        </p>
      )}
    </section>
  )
}
