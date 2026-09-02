'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, CircleDollarSign, FilePenLine, UsersRound } from 'lucide-react'
import type {
  ExpenseDashboardCircleFacetView,
  ExpenseDashboardPersonFacetView,
  ExpenseDashboardPresentationResult,
  ExpenseDashboardPresentationState,
  ExpenseDashboardPresentationView,
} from '@/lib/expenses/dashboard-presentations'
import { formatExpenseMinor } from '@/lib/expenses/input-money'
import { useExpenseTranslations } from './i18n.client'

type DashboardView = 'active' | 'closed'

const SECTION_STATES: Record<DashboardView, ExpenseDashboardPresentationState[]> = {
  active: ['private_draft', 'shared_draft', 'confirmed'],
  closed: ['settled', 'cancelled'],
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value]
}

function orderedFacets<T extends { key: string; label: string }>(facets: T[], locale: string) {
  return [...facets].sort((left, right) =>
    left.label.localeCompare(right.label, locale, { sensitivity: 'base' })
    || left.key.localeCompare(right.key))
}

function iconFor(state: ExpenseDashboardPresentationState) {
  if (state === 'private_draft') return FilePenLine
  if (state === 'shared_draft') return UsersRound
  return CircleDollarSign
}

function DashboardRow({
  row,
  locale,
}: {
  row: ExpenseDashboardPresentationView
  locale: string
}) {
  const t = useExpenseTranslations()
  const Icon = row.needsAttention ? AlertTriangle : iconFor(row.presentationState)
  const amount = row.totalMinor !== null && row.currency
    ? formatExpenseMinor(row.totalMinor, row.currency, locale)
    : null
  const content = (
    <>
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${row.needsAttention ? 'bg-amber-50 text-amber-700' : 'bg-[#eef7ea] text-primary'}`}
      >
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {row.title ?? t('dashboard.untitledDraft')}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {[
            amount,
            row.needsAttention
              ? t('dashboard.needsAttention')
              : t(`dashboard.sections.${row.presentationState}`),
          ].filter(Boolean).join(' · ')}
        </span>
      </span>
      {row.href ? <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" /> : null}
    </>
  )

  return row.href ? (
    <Link
      href={row.href}
      className="flex min-h-14 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  ) : (
    <div className="flex min-h-14 items-center gap-3 py-3">{content}</div>
  )
}

export function ExpenseDashboardDirectory({
  result,
  locale,
}: {
  result: ExpenseDashboardPresentationResult
  locale: string
}) {
  const t = useExpenseTranslations()
  const [view, setView] = useState<DashboardView>('active')
  const [personKeys, setPersonKeys] = useState<string[]>([])
  const [circleKeys, setCircleKeys] = useState<string[]>([])

  const rows = result.status === 'ready' ? result.rows : []
  const personOptions = useMemo(() => {
    const options = new Map<string, ExpenseDashboardPersonFacetView>()
    for (const row of rows) {
      for (const facet of row.personFacets) options.set(facet.key, facet)
    }
    return orderedFacets([...options.values()], locale)
  }, [locale, rows])
  const durablePeople = personOptions.filter((facet) => facet.kind === 'durable')
  const manualPeople = personOptions.filter((facet) => facet.kind === 'manual')
  const circleOptions = useMemo(() => {
    const options = new Map<string, ExpenseDashboardCircleFacetView>()
    for (const row of rows) {
      for (const facet of row.circleFacets) options.set(facet.key, facet)
    }
    return orderedFacets([...options.values()], locale)
  }, [locale, rows])

  const filteredRows = rows.filter((row) => {
    const rowPeople = new Set(row.personFacets.map((facet) => facet.key))
    const rowCircles = new Set(row.circleFacets.map((facet) => facet.key))
    if (personKeys.some((key) => !rowPeople.has(key))) return false
    if (circleKeys.length > 0 && !circleKeys.some((key) => rowCircles.has(key))) return false
    return true
  })
  const hasFilters = personKeys.length > 0 || circleKeys.length > 0
  const viewRows = filteredRows.filter((row) => SECTION_STATES[view].includes(row.presentationState))

  function facetButton(facet: { key: string; label: string }, kind: 'person' | 'circle') {
    const selected = kind === 'person'
      ? personKeys.includes(facet.key)
      : circleKeys.includes(facet.key)
    return (
      <button
        key={facet.key}
        type="button"
        aria-pressed={selected}
        className={`min-h-10 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
        onClick={() => kind === 'person'
          ? setPersonKeys((current) => toggleValue(current, facet.key))
          : setCircleKeys((current) => toggleValue(current, facet.key))}
      >
        {facet.label}
      </button>
    )
  }

  return (
    <section aria-labelledby="expense-directory-title" className="space-y-4">
      <h2 id="expense-directory-title" className="text-sm font-semibold">{t('dashboard.entries')}</h2>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('dashboard.viewAriaLabel')}>
        {(['active', 'closed'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={view === candidate}
            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${view === candidate ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}
            onClick={() => setView(candidate)}
          >
            {t(`dashboard.views.${candidate}`)}
          </button>
        ))}
      </div>

      {personOptions.length > 0 || circleOptions.length > 0 ? (
        <details className="rounded-xl border border-border bg-background px-3 py-2">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-sm font-semibold">
            <span>{t('dashboard.filters')}</span>
            {hasFilters ? <span className="text-xs font-medium text-primary">{t('dashboard.filtersActive')}</span> : null}
          </summary>
          <div className="space-y-4 border-t border-border pb-2 pt-3">
            {durablePeople.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold">{t('dashboard.filterPeople')}</legend>
                <div className="flex flex-wrap gap-2">{durablePeople.map((facet) => facetButton(facet, 'person'))}</div>
              </fieldset>
            ) : null}

            {manualPeople.length > 0 ? (
              <details className="rounded-lg bg-muted/60 px-3 py-2">
                <summary className="min-h-10 cursor-pointer list-none py-2 text-xs font-semibold">
                  {t('dashboard.filterManualPeople', { count: manualPeople.length })}
                </summary>
                <div className="flex flex-wrap gap-2 pb-1">{manualPeople.map((facet) => facetButton(facet, 'person'))}</div>
              </details>
            ) : null}

            {circleOptions.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold">{t('dashboard.filterCircles')}</legend>
                <div className="flex flex-wrap gap-2">{circleOptions.map((facet) => facetButton(facet, 'circle'))}</div>
              </fieldset>
            ) : null}

            {hasFilters ? (
              <button
                type="button"
                className="min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => { setPersonKeys([]); setCircleKeys([]) }}
              >
                {t('dashboard.clearFilters')}
              </button>
            ) : null}
          </div>
        </details>
      ) : null}

      {result.status === 'unavailable' ? (
        <p className="rounded-xl bg-muted px-3 py-4 text-sm text-muted-foreground">{t('dashboard.entriesUnavailable')}</p>
      ) : null}

      {result.status !== 'unavailable' && viewRows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {hasFilters
            ? t('dashboard.noFilterMatches')
            : t(view === 'active' ? 'dashboard.noActive' : 'dashboard.noClosed')}
        </p>
      ) : null}

      {SECTION_STATES[view].map((state) => {
        const sectionRows = viewRows.filter((row) => row.presentationState === state)
        if (sectionRows.length === 0) return null
        return (
          <section key={state} aria-labelledby={`expense-section-${state}`}>
            <h3 id={`expense-section-${state}`} className="pb-2 text-sm font-semibold">
              {t(`dashboard.sections.${state}`)}
            </h3>
            <div className="divide-y divide-border border-y border-border">
              {sectionRows.map((row) => <DashboardRow key={row.presentationKey} row={row} locale={locale} />)}
            </div>
          </section>
        )
      })}
    </section>
  )
}
