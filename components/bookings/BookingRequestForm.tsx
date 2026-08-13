'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, LogIn } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { TeskeidTimeField } from '@/components/teskeid/TeskeidTimeField'
import {
  bookingGuestShareUrl,
  type CreateBookingRequestInput,
  type CreateBookingRequestResult,
  type PublicBookingServiceView,
} from '@/lib/bookings/contracts'
import { BookingPendingLink } from './BookingPendingLink'

type FormDraft = Pick<CreateBookingRequestInput,
  'requestedDate' | 'requestedTime' | 'contactName' | 'contactEmail' | 'contactPhone' | 'message'
>

type StoredDraft = FormDraft & { version: 1; expiresAt: number }

const DRAFT_LIFETIME_MS = 30 * 60 * 1000
// The server allows 548 exact days. Keeping the calendar one day inside that
// instant boundary avoids offering a late time that the server must reject.
const FORM_MAX_HORIZON_DAYS = 547

const emptyDraft: FormDraft = {
  requestedDate: '',
  requestedTime: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  message: '',
}

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isoDateInTimeZone(timeZone: string, date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
    if (value.year && value.month && value.day) return `${value.year}-${value.month}-${value.day}`
  } catch {
    // The server rejects unsupported time zones. Keep the form usable meanwhile.
  }
  return date.toISOString().slice(0, 10)
}

function maxDateFrom(minDate: string): string {
  const [year, month, day] = minDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day) + FORM_MAX_HORIZON_DAYS * 86_400_000)
  return date.toISOString().slice(0, 10)
}

function draftStorageKey(slug: string): string {
  return `teskeid:booking-draft:v1:${slug}`
}

function normalizeShareUrl(value: string): string {
  if (typeof window === 'undefined' || /^https?:\/\//i.test(value)) return value
  return new URL(value, window.location.origin).toString()
}

export function BookingRequestForm({ view }: { view: PublicBookingServiceView }) {
  const t = useTranslations('bookings')
  const [draft, setDraft] = useState<FormDraft>(emptyDraft)
  const [website, setWebsite] = useState('')
  const [pending, setPending] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [result, setResult] = useState<CreateBookingRequestResult | null>(null)
  const [copied, setCopied] = useState(false)
  const requestEnvelope = useRef<{ fingerprint: string; id: string } | null>(null)
  const submitInFlight = useRef(false)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const minDate = useMemo(() => isoDateInTimeZone(view.service.timezone), [view.service.timezone])
  const maxDate = useMemo(() => maxDateFrom(minDate), [minDate])
  const signInNext = `/bokanir/${encodeURIComponent(view.businessProfile.slug)}`

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftStorageKey(view.businessProfile.slug))
      if (!raw) return
      const stored = JSON.parse(raw) as Partial<StoredDraft>
      if (stored.version !== 1 || typeof stored.expiresAt !== 'number' || stored.expiresAt < Date.now()) {
        sessionStorage.removeItem(draftStorageKey(view.businessProfile.slug))
        return
      }
      setDraft({
        requestedDate: typeof stored.requestedDate === 'string' ? stored.requestedDate : '',
        requestedTime: typeof stored.requestedTime === 'string' ? stored.requestedTime : '',
        contactName: typeof stored.contactName === 'string' ? stored.contactName : '',
        contactEmail: typeof stored.contactEmail === 'string' ? stored.contactEmail : '',
        contactPhone: typeof stored.contactPhone === 'string' ? stored.contactPhone : '',
        message: typeof stored.message === 'string' ? stored.message : '',
      })
    } catch {
      sessionStorage.removeItem(draftStorageKey(view.businessProfile.slug))
    }
  }, [view.businessProfile.slug])

  useEffect(() => {
    if (result) resultHeadingRef.current?.focus({ preventScroll: true })
  }, [result])

  function updateDraft<K extends keyof FormDraft>(key: K, value: FormDraft[K]) {
    requestEnvelope.current = null
    setErrorKey(null)
    setDraft(current => ({ ...current, [key]: value }))
  }

  function saveDraftForLogin() {
    try {
      const stored: StoredDraft = { ...draft, version: 1, expiresAt: Date.now() + DRAFT_LIFETIME_MS }
      sessionStorage.setItem(draftStorageKey(view.businessProfile.slug), JSON.stringify(stored))
    } catch {
      // Login still works if storage is unavailable; no PII is moved into the URL.
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitInFlight.current) return
    submitInFlight.current = true
    setPending(true)
    setErrorKey(null)

    const semanticPayload = {
      businessProfileSlug: view.businessProfile.slug,
      requestedDate: draft.requestedDate,
      requestedTime: draft.requestedTime,
      contactName: draft.contactName.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone.trim(),
      message: draft.message.trim(),
      website,
    }
    const fingerprint = JSON.stringify(semanticPayload)
    if (!requestEnvelope.current || requestEnvelope.current.fingerprint !== fingerprint) {
      try {
        requestEnvelope.current = { fingerprint, id: requestId() }
      } catch {
        setErrorKey('errors.unavailable')
        setPending(false)
        submitInFlight.current = false
        return
      }
    }
    const payload: CreateBookingRequestInput = {
      ...semanticPayload,
      requestId: requestEnvelope.current.id,
    }

    let navigatingToBooking = false
    try {
      const response = await fetch('/api/bookings/public/requests', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => null) as CreateBookingRequestResult | { error?: string } | null
      if (!response.ok || !body || typeof body !== 'object' || !('publicId' in body)) {
        const error = body && typeof body === 'object' && 'error' in body ? body.error : null
        setErrorKey(error === 'rate_limited'
          ? 'errors.rateLimited'
          : error === 'conflict'
            ? 'errors.conflict'
            : error === 'invalid_input'
              ? 'errors.invalidInput'
              : 'errors.submitFailed')
        return
      }
      try { sessionStorage.removeItem(draftStorageKey(view.businessProfile.slug)) } catch { /* no-op */ }
      if (body.accessMode === 'members') {
        navigatingToBooking = true
        window.requestAnimationFrame(() => {
          window.setTimeout(() => window.location.assign(body.bookingPath), 0)
        })
        return
      }
      setResult(body)
    } catch {
      setErrorKey('errors.submitFailed')
    } finally {
      if (!navigatingToBooking) {
        setPending(false)
        submitInFlight.current = false
      }
    }
  }

  if (result) {
    const shareValue = result.accessMode === 'link' && result.guestCapability
      ? normalizeShareUrl(bookingGuestShareUrl(result.bookingPath, result.guestCapability))
      : result.bookingPath
    return (
      <section
        aria-labelledby="booking-request-sent"
        className="space-y-5 border-y border-border py-6"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check aria-hidden size={20} />
          </span>
          <div>
            <h2
              ref={resultHeadingRef}
              id="booking-request-sent"
              tabIndex={-1}
              className="text-lg font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('request.sentTitle')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('request.sentBody')}</p>
          </div>
        </div>

        {result.accessMode === 'link' ? (
          <div className="space-y-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-950">
            <h3 className="font-semibold">{t('guestLink.title')}</h3>
            <p className="text-sm leading-6">{t('guestLink.body')}</p>
            <label className="grid gap-1 text-sm font-medium">
              {t('guestLink.valueLabel')}
              <input
                readOnly
                value={shareValue}
                onFocus={event => event.currentTarget.select()}
                className="min-h-11 min-w-0 rounded-xl border border-amber-300 bg-white px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  if (!navigator.clipboard?.writeText) {
                    setCopied(false)
                    return
                  }
                  void navigator.clipboard.writeText(shareValue).then(() => setCopied(true)).catch(() => setCopied(false))
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Copy aria-hidden size={17} />
                {copied ? t('guestLink.copied') : t('guestLink.copy')}
              </button>
              <BookingPendingLink
                href={shareValue}
                pendingLabel={t('request.opening')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('request.open')}
              </BookingPendingLink>
            </div>
          </div>
        ) : (
          <BookingPendingLink
            href={result.bookingPath}
            pendingLabel={t('request.opening')}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('request.open')}
          </BookingPendingLink>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="booking-request-heading" className="border-t border-border pt-6">
      <h2 id="booking-request-heading" className="text-lg font-semibold text-primary">{t('request.title')}</h2>

      {!view.signedIn ? (
        <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="font-medium text-primary">{t('discount.trackOffer')}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('discount.trackScope')}
          </p>
          {!view.signedIn ? (
            <BookingPendingLink
              href={`/innskraning?next=${encodeURIComponent(signInNext)}`}
              onNavigate={saveDraftForLogin}
              pendingLabel={t('access.openingSignIn')}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-background px-4 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogIn aria-hidden size={17} />
              {t('discount.signIn')}
            </BookingPendingLink>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TeskeidDateField
            label={t('form.date')}
            placeholder={t('form.datePlaceholder')}
            value={draft.requestedDate}
            onChange={value => updateDraft('requestedDate', value)}
            min={minDate}
            max={maxDate}
            required
            disabled={pending}
          />
          <TeskeidTimeField
            label={t('form.time')}
            hourLabel={t('form.hour')}
            minuteLabel={t('form.minute')}
            value={draft.requestedTime}
            onChange={value => updateDraft('requestedTime', value)}
            step={900}
            required
            disabled={pending}
          />
        </div>
        <p className="-mt-2 text-xs leading-5 text-muted-foreground">{t('form.timeOptionalHint')}</p>
        <p className="-mt-3 text-xs text-muted-foreground">{t('form.timezone', { timezone: view.service.timezone })}</p>

        <label className="grid gap-1 text-sm font-medium">
          {t('form.name')}
          <input
            value={draft.contactName}
            onChange={event => updateDraft('contactName', event.target.value)}
            autoComplete="name"
            maxLength={120}
            required
            disabled={pending}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('form.email')}
          <input
            type="email"
            value={draft.contactEmail}
            onChange={event => updateDraft('contactEmail', event.target.value)}
            autoComplete="email"
            maxLength={254}
            required
            disabled={pending}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('form.phone')}
          <input
            type="tel"
            value={draft.contactPhone}
            onChange={event => updateDraft('contactPhone', event.target.value)}
            autoComplete="tel"
            inputMode="tel"
            maxLength={40}
            required
            disabled={pending}
            className="min-h-11 rounded-xl border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t('form.message')}
          <textarea
            value={draft.message}
            onChange={event => updateDraft('message', event.target.value)}
            rows={4}
            maxLength={1000}
            required
            disabled={pending}
            className="min-h-28 resize-y rounded-xl border border-input bg-background p-3 text-base leading-6 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
          />
        </label>
        <label aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={event => setWebsite(event.target.value)}
          />
        </label>

        {errorKey ? <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
        >
          {pending ? t('form.sending') : t('form.submit')}
        </button>
        {!view.signedIn ? <p className="text-center text-xs leading-5 text-muted-foreground">{t('form.guestEqual')}</p> : null}
      </form>
    </section>
  )
}

export function PublicBookingService({ view }: { view: PublicBookingServiceView }) {
  const t = useTranslations('bookings')
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {view.service.summary ? <p className="whitespace-pre-wrap text-sm leading-6">{view.service.summary}</p> : null}
        {view.businessProfile.description ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{view.businessProfile.description}</p>
        ) : null}
        {view.businessProfile.websiteUrl ? (
          <a
            href={view.businessProfile.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('providerWebsite')}
            <ExternalLink aria-hidden size={16} />
          </a>
        ) : null}
      </section>
      <BookingRequestForm view={view} />
    </div>
  )
}
