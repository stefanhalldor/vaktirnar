'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { createBookkeepingPeriod } from '@/lib/bookkeeping/actions'
import type { BookkeepingFilingMethod } from '@/lib/bookkeeping/constants'
import { useBookkeepingTranslations } from './i18n.client'
import { useBookkeepingMutationRequestIds } from './request-id'
import {
  bookkeepingInputClass,
  bookkeepingLabelClass,
  bookkeepingPrimaryButtonClass,
} from './ui'

export interface BookkeepingPeriodRegistrationOption {
  id: string
  entityId: string
  entityName: string
  vatNumber: string
  label: string | null
  filingMethod: BookkeepingFilingMethod
  detailsConfirmed: boolean
}

interface PeriodDateDefaults {
  startsOn: string
  endsOn: string
  dueOn: string
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Returns the last fully completed standard two-month VAT period. */
export function getPreviousCompletedBimonthlyPeriod(referenceDate: string): PeriodDateDefaults {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate)
  if (!match) throw new TypeError('referenceDate must use YYYY-MM-DD')

  const referenceYear = Number(match[1])
  const referenceMonth = Number(match[2])
  const referenceDay = Number(match[3])
  const parsedReferenceDate = new Date(Date.UTC(
    referenceYear,
    referenceMonth - 1,
    referenceDay,
  ))
  if (
    !Number.isInteger(referenceYear)
    || parsedReferenceDate.getUTCFullYear() !== referenceYear
    || parsedReferenceDate.getUTCMonth() !== referenceMonth - 1
    || parsedReferenceDate.getUTCDate() !== referenceDay
  ) {
    throw new TypeError('referenceDate must be a valid calendar date')
  }

  const currentPeriodStartMonth = Math.floor((referenceMonth - 1) / 2) * 2 + 1
  let startYear = referenceYear
  let startMonth = currentPeriodStartMonth - 2
  if (startMonth < 1) {
    startMonth += 12
    startYear -= 1
  }

  const endYear = startMonth === 12 ? startYear + 1 : startYear
  const endMonth = startMonth === 12 ? 1 : startMonth + 1
  const endDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()

  let dueYear = endYear
  let dueMonth = endMonth + 2
  if (dueMonth > 12) {
    dueMonth -= 12
    dueYear += 1
  }

  return {
    startsOn: isoDate(startYear, startMonth, 1),
    endsOn: isoDate(endYear, endMonth, endDay),
    dueOn: isoDate(dueYear, dueMonth, 5),
  }
}

function defaultsForRegistration(
  registration: BookkeepingPeriodRegistrationOption | undefined,
  referenceDate: string,
): PeriodDateDefaults {
  if (registration?.filingMethod !== 'general_bimonthly') {
    return { startsOn: '', endsOn: '', dueOn: '' }
  }
  return getPreviousCompletedBimonthlyPeriod(referenceDate)
}

export function BookkeepingPeriodForm({
  registrations,
  referenceDate,
}: {
  registrations: readonly BookkeepingPeriodRegistrationOption[]
  referenceDate: string
}) {
  const t = useBookkeepingTranslations()
  const router = useRouter()
  const requestIds = useBookkeepingMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const firstRegistration = registrations[0]
  const initialDates = defaultsForRegistration(firstRegistration, referenceDate)
  const [registrationId, setRegistrationId] = useState(firstRegistration?.id ?? '')
  const [startsOn, setStartsOn] = useState(initialDates.startsOn)
  const [endsOn, setEndsOn] = useState(initialDates.endsOn)
  const [dueOn, setDueOn] = useState(initialDates.dueOn)
  const [periodDatesConfirmed, setPeriodDatesConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const selectedRegistration = registrations.find((registration) => registration.id === registrationId)
  const canSubmit = Boolean(
    selectedRegistration
      && startsOn
      && endsOn
      && periodDatesConfirmed
      && !saved,
  )

  function selectRegistration(nextRegistrationId: string) {
    const nextRegistration = registrations.find((registration) => registration.id === nextRegistrationId)
    const defaults = defaultsForRegistration(nextRegistration, referenceDate)
    setRegistrationId(nextRegistrationId)
    setStartsOn(defaults.startsOn)
    setEndsOn(defaults.endsOn)
    setDueOn(defaults.dueOn)
    setPeriodDatesConfirmed(false)
    setError(null)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!selectedRegistration) return

    const payload = {
      entity_id: selectedRegistration.entityId,
      vat_registration_id: selectedRegistration.id,
      filing_method: selectedRegistration.filingMethod,
      starts_on: startsOn,
      ends_on: endsOn,
      due_on: dueOn || null,
      period_dates_confirmed: periodDatesConfirmed,
    }

    startTransition(async () => {
      try {
        const result = await createBookkeepingPeriod({
          ...payload,
          request_id: requestIds.forPayload(payload),
        })
        if (!result.ok) {
          setError(t(`errors.${result.error.code}`))
          queueMicrotask(() => alertRef.current?.focus())
          return
        }

        requestIds.succeeded(payload)
        setSaved(true)
        router.push(`/auth-mvp/bokhaldid/timabil/${result.data.periodId}`)
        router.refresh()
      } catch {
        setError(t('errors.unexpected_error'))
        queueMicrotask(() => alertRef.current?.focus())
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 id="bookkeeping-new-period-title" className="text-base font-semibold">
          {t('periodForm.title')}
        </h2>
      </div>

      {error ? (
        <p
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <label className="block min-w-0">
        <span className={bookkeepingLabelClass}>{t('periodForm.registration')}</span>
        <select
          className={bookkeepingInputClass}
          value={registrationId}
          onChange={(event) => selectRegistration(event.target.value)}
          disabled={isPending || saved}
          required
        >
          {registrations.map((registration) => (
            <option key={registration.id} value={registration.id}>
              {registration.label
                ? t('periodForm.registrationOptionWithLabel', {
                    entity: registration.entityName,
                    vatNumber: registration.vatNumber,
                    label: registration.label,
                  })
                : t('periodForm.registrationOption', {
                    entity: registration.entityName,
                    vatNumber: registration.vatNumber,
                  })}
            </option>
          ))}
        </select>
      </label>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TeskeidDateField
          label={t('periodForm.startsOn')}
          value={startsOn}
          onChange={(value) => {
            setStartsOn(value)
            setPeriodDatesConfirmed(false)
          }}
          placeholder={t('common.datePlaceholder')}
          max={endsOn || undefined}
          disabled={isPending || saved}
          required
        />
        <TeskeidDateField
          label={t('periodForm.endsOn')}
          value={endsOn}
          onChange={(value) => {
            setEndsOn(value)
            setPeriodDatesConfirmed(false)
          }}
          placeholder={t('common.datePlaceholder')}
          min={startsOn || undefined}
          disabled={isPending || saved}
          required
        />
        <TeskeidDateField
          label={t('periodForm.dueOn')}
          value={dueOn}
          onChange={(value) => {
            setDueOn(value)
            setPeriodDatesConfirmed(false)
          }}
          placeholder={t('common.datePlaceholder')}
          min={endsOn || undefined}
          disabled={isPending || saved}
          className="sm:col-span-2"
        />
      </div>

      {selectedRegistration?.filingMethod === 'general_bimonthly' ? (
        <p className="text-xs leading-5 text-muted-foreground">{t('periodForm.suggested')}</p>
      ) : null}

      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-primary"
          checked={periodDatesConfirmed}
          onChange={(event) => setPeriodDatesConfirmed(event.target.checked)}
          disabled={isPending || saved}
          required
        />
        <span>{t('periodForm.confirmed')}</span>
      </label>

      <button
        type="submit"
        className={`${bookkeepingPrimaryButtonClass} w-full`}
        disabled={isPending || !canSubmit}
      >
        {saved || isPending ? t('periodForm.creating') : t('periodForm.create')}
      </button>
    </form>
  )
}
