'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addBookkeepingVatRegistration,
  createBookkeepingEntity,
} from '@/lib/bookkeeping/actions'
import {
  BOOKKEEPING_FILING_METHODS,
  type BookkeepingFilingMethod,
} from '@/lib/bookkeeping/constants'
import { useBookkeepingTranslations } from './i18n.client'
import { useBookkeepingMutationRequestIds } from './request-id'
import {
  bookkeepingInputClass,
  bookkeepingLabelClass,
  bookkeepingPrimaryButtonClass,
} from './ui'

export function BookkeepingEntityForm() {
  const t = useBookkeepingTranslations()
  const router = useRouter()
  const requestIds = useBookkeepingMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [displayName, setDisplayName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [legalIdentifier, setLegalIdentifier] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [vatLabel, setVatLabel] = useState('')
  const [filingMethod, setFilingMethod] = useState<BookkeepingFilingMethod>('general_bimonthly')
  const [detailsConfirmed, setDetailsConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const canSubmit = Boolean(
    displayName.trim()
      && legalIdentifier.trim()
      && vatNumber.trim()
      && detailsConfirmed
      && !saved,
  )

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const payload = {
      display_name: displayName.trim(),
      legal_name: legalName.trim() || null,
      legal_identifier: legalIdentifier.trim(),
      default_currency: 'ISK' as const,
      details_confirmed: detailsConfirmed,
      vat_registration: {
        vat_number: vatNumber.trim(),
        label: vatLabel.trim() || null,
        filing_method: filingMethod,
        details_confirmed: detailsConfirmed,
      },
    }

    startTransition(async () => {
      try {
        const result = await createBookkeepingEntity({
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
        <h2 className="text-base font-semibold">{t('entityForm.title')}</h2>
      </div>

      <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
        {t('workspaceDisclaimer')}
      </p>

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

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="min-w-0 sm:col-span-2">
          <span className={bookkeepingLabelClass}>{t('entityForm.displayName')}</span>
          <input
            className={bookkeepingInputClass}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={160}
            autoComplete="organization"
            placeholder={t('entityForm.displayNamePlaceholder')}
            disabled={isPending || saved}
            required
          />
        </label>

        <label className="min-w-0">
          <span className={bookkeepingLabelClass}>
            {t('entityForm.legalName')}{' '}
            <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
          </span>
          <input
            className={bookkeepingInputClass}
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            maxLength={200}
            autoComplete="organization"
            placeholder={t('entityForm.legalNamePlaceholder')}
            disabled={isPending || saved}
          />
        </label>

        <label className="min-w-0">
          <span className={bookkeepingLabelClass}>{t('entityForm.legalIdentifier')}</span>
          <input
            className={bookkeepingInputClass}
            value={legalIdentifier}
            onChange={(event) => setLegalIdentifier(event.target.value)}
            maxLength={32}
            autoComplete="off"
            placeholder={t('entityForm.legalIdentifierPlaceholder')}
            aria-describedby="bookkeeping-legal-identifier-hint"
            disabled={isPending || saved}
            required
          />
        </label>
      </div>

      <p id="bookkeeping-legal-identifier-hint" className="text-xs leading-5 text-muted-foreground">
        {t('entityForm.privacyHint')}
      </p>

      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-semibold">{t('entityForm.vatTitle')}</h3>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0">
            <span className={bookkeepingLabelClass}>{t('entityForm.vatNumber')}</span>
            <input
              className={bookkeepingInputClass}
              value={vatNumber}
              onChange={(event) => setVatNumber(event.target.value)}
              maxLength={40}
              autoComplete="off"
              placeholder={t('entityForm.vatNumberPlaceholder')}
              disabled={isPending || saved}
              required
            />
          </label>

          <label className="min-w-0">
            <span className={bookkeepingLabelClass}>
              {t('entityForm.vatLabel')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </span>
            <input
              className={bookkeepingInputClass}
              value={vatLabel}
              onChange={(event) => setVatLabel(event.target.value)}
              maxLength={120}
              placeholder={t('entityForm.vatLabelPlaceholder')}
              disabled={isPending || saved}
            />
          </label>

          <label className="min-w-0 sm:col-span-2">
            <span className={bookkeepingLabelClass}>{t('entityForm.filingMethod')}</span>
            <select
              className={bookkeepingInputClass}
              value={filingMethod}
              onChange={(event) => setFilingMethod(event.target.value as BookkeepingFilingMethod)}
              disabled={isPending || saved}
            >
              {BOOKKEEPING_FILING_METHODS.map((method) => (
                <option key={method} value={method}>{t(`filingMethods.${method}`)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-primary"
          checked={detailsConfirmed}
          onChange={(event) => setDetailsConfirmed(event.target.checked)}
          disabled={isPending || saved}
          required
        />
        <span>{t('entityForm.confirmed')}</span>
      </label>

      <button
        type="submit"
        className={`${bookkeepingPrimaryButtonClass} w-full`}
        disabled={isPending || !canSubmit}
      >
        {saved || isPending ? t('entityForm.creating') : t('entityForm.create')}
      </button>
    </form>
  )
}

export function BookkeepingVatRegistrationForm({ entityId }: { entityId: string }) {
  const t = useBookkeepingTranslations()
  const router = useRouter()
  const requestIds = useBookkeepingMutationRequestIds()
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [vatNumber, setVatNumber] = useState('')
  const [vatLabel, setVatLabel] = useState('')
  const [filingMethod, setFilingMethod] = useState<BookkeepingFilingMethod>('general_bimonthly')
  const [detailsConfirmed, setDetailsConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const canSubmit = Boolean(vatNumber.trim() && detailsConfirmed && !saved)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const payload = {
      entity_id: entityId,
      vat_number: vatNumber.trim(),
      label: vatLabel.trim() || null,
      filing_method: filingMethod,
      details_confirmed: detailsConfirmed,
    }

    startTransition(async () => {
      try {
        const result = await addBookkeepingVatRegistration({
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
        router.refresh()
      } catch {
        setError(t('errors.unexpected_error'))
        queueMicrotask(() => alertRef.current?.focus())
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="min-w-0">
          <span className={bookkeepingLabelClass}>{t('entityForm.vatNumber')}</span>
          <input
            className={bookkeepingInputClass}
            value={vatNumber}
            onChange={(event) => setVatNumber(event.target.value)}
            maxLength={40}
            autoComplete="off"
            placeholder={t('entityForm.vatNumberPlaceholder')}
            disabled={isPending || saved}
            required
          />
        </label>

        <label className="min-w-0">
          <span className={bookkeepingLabelClass}>
            {t('entityForm.vatLabel')}{' '}
            <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
          </span>
          <input
            className={bookkeepingInputClass}
            value={vatLabel}
            onChange={(event) => setVatLabel(event.target.value)}
            maxLength={120}
            placeholder={t('entityForm.vatLabelPlaceholder')}
            disabled={isPending || saved}
          />
        </label>

        <label className="min-w-0 sm:col-span-2">
          <span className={bookkeepingLabelClass}>{t('entityForm.filingMethod')}</span>
          <select
            className={bookkeepingInputClass}
            value={filingMethod}
            onChange={(event) => setFilingMethod(event.target.value as BookkeepingFilingMethod)}
            disabled={isPending || saved}
          >
            {BOOKKEEPING_FILING_METHODS.map((method) => (
              <option key={method} value={method}>{t(`filingMethods.${method}`)}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          className="mt-1 size-5 shrink-0 accent-primary"
          checked={detailsConfirmed}
          onChange={(event) => setDetailsConfirmed(event.target.checked)}
          disabled={isPending || saved}
          required
        />
        <span>{t('entityForm.confirmed')}</span>
      </label>

      <button
        type="submit"
        className={`${bookkeepingPrimaryButtonClass} w-full`}
        disabled={isPending || !canSubmit}
      >
        {saved || isPending ? t('common.saving') : t('common.save')}
      </button>
    </form>
  )
}
