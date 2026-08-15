'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type {
  BookingActionResult,
  ProviderBookingServiceView,
  ProviderBookingWorkspaceView,
} from '@/lib/bookings/contracts'
import { BookingPendingLink } from './BookingPendingLink'
import { formatRequestedBookingTime } from './format'
import {
  resolveBookingWorkflowAttention,
  resolveBookingWorkflowLabel,
} from './workflow-label'

function bpsToInput(value: number | null): string {
  if (value === null) return ''
  const whole = Math.floor(value / 100)
  const fraction = value % 100
  return fraction ? `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}` : String(whole)
}

function percentInputToBps(value: string): number | null | undefined {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return undefined
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (bps === 0) return null
  return bps <= 10_000 ? bps : undefined
}

function newRequestKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const values = new Uint8Array(16)
  globalThis.crypto.getRandomValues(values)
  values[6] = (values[6] & 0x0f) | 0x40
  values[8] = (values[8] & 0x3f) | 0x80
  const hex = Array.from(values, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function unwrapWorkspace(value: unknown): ProviderBookingWorkspaceView | null {
  if (!value || typeof value !== 'object') return null
  if ('profiles' in value && 'services' in value && 'requests' in value) {
    return value as ProviderBookingWorkspaceView
  }
  if ('ok' in value && value.ok === true && 'data' in value) {
    const data = value.data
    if (data && typeof data === 'object' && 'profiles' in data && 'services' in data && 'requests' in data) {
      return data as ProviderBookingWorkspaceView
    }
  }
  return null
}

function providerWorkspaceUrl(stateFilter: string, attentionFilter: string): string {
  const params = new URLSearchParams()
  if (stateFilter !== 'all') {
    const separator = stateFilter.indexOf(':')
    if (separator > 0) {
      params.set('workflowId', stateFilter.slice(0, separator))
      params.set('stateLogicalKey', stateFilter.slice(separator + 1))
    }
  }
  if (attentionFilter !== 'all') params.set('attentionSide', attentionFilter)
  const query = params.toString()
  return query ? `/api/bookings/provider?${query}` : '/api/bookings/provider'
}

async function requestProviderWorkspace(url: string): Promise<ProviderBookingWorkspaceView> {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) throw new Error('workspace load failed')
  const next = unwrapWorkspace(await response.json().catch(() => null))
  if (!next) throw new Error('workspace response invalid')
  return next
}

export function ProviderBookingWorkspaceClient({
  initialWorkspace,
}: {
  initialWorkspace: ProviderBookingWorkspaceView
}) {
  const t = useTranslations('bookings')
  const locale = useLocale()
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [profileId, setProfileId] = useState(initialWorkspace.profiles[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [timeZone, setTimeZone] = useState('Atlantic/Reykjavik')
  const [discount, setDiscount] = useState('')
  const [pendingAction, setPendingAction] = useState<'save' | 'publish' | 'pause' | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [saveSuccessKey, setSaveSuccessKey] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState('all')
  const [attentionFilter, setAttentionFilter] = useState('all')
  const [filterPending, setFilterPending] = useState(false)
  const [filterError, setFilterError] = useState(false)
  const [filterRetry, setFilterRetry] = useState(0)
  const filterMounted = useRef(false)
  const transitionEnvelope = useRef<{ fingerprint: string; key: string } | null>(null)
  const pending = pendingAction !== null || filterPending

  const selectedService = useMemo(
    () => workspace.services.find(service => service.businessProfileId === profileId) ?? null,
    [profileId, workspace.services],
  )
  const parsedDiscount = percentInputToBps(discount)
  const settingsDirty = Boolean(selectedService && (
    title.trim() !== selectedService.title
    || summary.trim() !== (selectedService.summary ?? '')
    || timeZone.trim() !== selectedService.timezone
    || parsedDiscount !== selectedService.signedInDiscountBps
  ))
  const filtersActive = stateFilter !== 'all' || attentionFilter !== 'all'
  const hasFilterChoices = filtersActive
    || workspace.requests.length > 0
    || workspace.facets.states.length > 0
    || workspace.facets.attention.length > 0

  const fillFields = useCallback((service: ProviderBookingServiceView | null) => {
    setTitle(service?.title ?? '')
    setSummary(service?.summary ?? '')
    setTimeZone(service?.timezone ?? 'Atlantic/Reykjavik')
    setDiscount(bpsToInput(service?.signedInDiscountBps ?? null))
    transitionEnvelope.current = null
  }, [])

  useEffect(() => {
    setWorkspace(initialWorkspace)
    setProfileId(current => initialWorkspace.profiles.some(profile => profile.id === current)
      ? current
      : initialWorkspace.profiles[0]?.id ?? '')
  }, [initialWorkspace])

  useEffect(() => {
    fillFields(selectedService)
  }, [fillFields, selectedService])

  useEffect(() => {
    if (!filterMounted.current) {
      filterMounted.current = true
      return
    }
    let current = true
    setFilterPending(true)
    setFilterError(false)
    void requestProviderWorkspace(providerWorkspaceUrl(stateFilter, attentionFilter))
      .then((next) => {
        if (current) setWorkspace(next)
      })
      .catch(() => {
        if (current) setFilterError(true)
      })
      .finally(() => {
        if (current) setFilterPending(false)
      })
    return () => { current = false }
  }, [attentionFilter, filterRetry, stateFilter])

  async function reload() {
    const next = await requestProviderWorkspace(providerWorkspaceUrl(stateFilter, attentionFilter))
    setWorkspace(next)
    return next
  }

  async function mutate(payload: Record<string, unknown>) {
    const response = await fetch('/api/bookings/provider', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null) as BookingActionResult<unknown> | null
    if (!response.ok || !result?.ok) {
      const error = result && !result.ok ? result.error : null
      throw new Error(error ?? 'save_failed')
    }
    return reload()
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !profileId) return
    const signedInDiscountBps = percentInputToBps(discount)
    if (signedInDiscountBps === undefined) {
      setErrorKey('provider.invalidDiscount')
      return
    }
    setPendingAction('save')
    setErrorKey(null)
    setSaveSuccessKey(null)
    try {
      const next = await mutate({
        action: 'upsertService',
        id: selectedService?.id ?? null,
        expectedRevision: selectedService?.revision ?? null,
        businessProfileId: profileId,
        title: title.trim(),
        summary: summary.trim(),
        timezone: timeZone.trim(),
        signedInDiscountBps,
      })
      const savedService = next.services.find(service => service.businessProfileId === profileId) ?? null
      fillFields(savedService)
      setSaveSuccessKey(savedService?.status === 'published'
        ? 'provider.publishedChangesSaved'
        : savedService?.status === 'paused'
          ? 'provider.pausedChangesSaved'
          : savedService
            ? 'provider.draftSaved'
            : null)
    } catch (error) {
      setErrorKey(error instanceof Error && error.message === 'conflict'
        ? 'errors.conflict'
        : error instanceof Error && error.message === 'invalid_input'
          ? 'errors.invalidInput'
          : 'errors.saveFailed')
    } finally {
      setPendingAction(null)
    }
  }

  async function transition(transitionName: 'publish' | 'pause') {
    if (!selectedService || pending) return
    const fingerprint = `${selectedService.id}:${selectedService.revision}:${transitionName}`
    if (!transitionEnvelope.current || transitionEnvelope.current.fingerprint !== fingerprint) {
      transitionEnvelope.current = { fingerprint, key: newRequestKey() }
    }
    setPendingAction(transitionName)
    setErrorKey(null)
    setSaveSuccessKey(null)
    try {
      await mutate({
        action: 'transitionService',
        serviceId: selectedService.id,
        expectedRevision: selectedService.revision,
        transition: transitionName,
        idempotencyKey: transitionEnvelope.current.key,
      })
      transitionEnvelope.current = null
    } catch (error) {
      setErrorKey(error instanceof Error && error.message === 'conflict'
        ? 'errors.conflict'
        : 'errors.saveFailed')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-7">
      {errorKey ? <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t(errorKey)}</p> : null}

      <section aria-labelledby="booking-provider-settings" className="space-y-4 border-y border-border py-5">
        <div>
          <h2 id="booking-provider-settings" className="text-lg font-semibold text-primary">{t('provider.settingsTitle')}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('provider.settingsDescription')}</p>
        </div>

        {workspace.profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('provider.noProfiles')}</p>
        ) : (
          <>
          <form onSubmit={save} className="grid gap-4">
            <label className="grid gap-1 text-sm font-medium">
              {t('provider.profile')}
              <select
                value={profileId}
                onChange={event => { setSaveSuccessKey(null); setProfileId(event.target.value) }}
                disabled={pending}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              >
                {workspace.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('provider.serviceTitle')}
              <input
                value={title}
                onChange={event => { transitionEnvelope.current = null; setSaveSuccessKey(null); setTitle(event.target.value) }}
                maxLength={120}
                required
                disabled={pending}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              />
            </label>
            <div className="grid gap-1 text-sm font-medium">
              <span className="flex flex-wrap gap-x-1">
                <label htmlFor="booking-provider-summary">{t('provider.summary')}</label>
                <span className="font-normal text-muted-foreground">{t('form.optional')}</span>
              </span>
              <textarea
                id="booking-provider-summary"
                aria-describedby="booking-provider-summary-hint"
                value={summary}
                onChange={event => { transitionEnvelope.current = null; setSaveSuccessKey(null); setSummary(event.target.value) }}
                maxLength={500}
                rows={4}
                disabled={pending}
                className="min-h-28 resize-y rounded-xl border border-input bg-background p-3 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              />
              <span id="booking-provider-summary-hint" className="text-xs font-normal leading-5 text-muted-foreground">{t('provider.summaryHint')}</span>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              {t('provider.timezone')}
              <input
                value={timeZone}
                onChange={event => { transitionEnvelope.current = null; setSaveSuccessKey(null); setTimeZone(event.target.value) }}
                list="booking-timezones"
                maxLength={64}
                required
                disabled={pending}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              />
              <datalist id="booking-timezones">
                <option value="Atlantic/Reykjavik" />
                <option value="Europe/London" />
                <option value="Europe/Copenhagen" />
                <option value="UTC" />
              </datalist>
              <span className="text-xs font-normal leading-5 text-muted-foreground">{t('provider.timezoneHint')}</span>
            </label>
            <div className="grid gap-1 text-sm font-medium">
              <label htmlFor="booking-provider-discount">{t('provider.discount')}</label>
              <span className="relative">
                <input
                  id="booking-provider-discount"
                  value={discount}
                  onChange={event => { transitionEnvelope.current = null; setSaveSuccessKey(null); setDiscount(event.target.value) }}
                  inputMode="decimal"
                  placeholder="10"
                  disabled={pending}
                  className="min-h-11 w-full rounded-xl border border-input bg-background px-3 pr-10 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
                />
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-muted-foreground">%</span>
              </span>
              <span className="text-xs font-normal leading-5 text-muted-foreground">{t('provider.discountHint')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending || !title.trim()}
                className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
              >
                {pendingAction === 'save' ? t('provider.saving') : t('provider.save')}
              </button>
              {selectedService && selectedService.status !== 'published' ? (
                <button
                  type="button"
                  disabled={pending || settingsDirty}
                  onClick={() => void transition('publish')}
                  className="min-h-11 rounded-xl border border-primary/20 px-4 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
                >
                  {pendingAction === 'publish' ? t('provider.publishing') : t('provider.publish')}
                </button>
              ) : null}
              {selectedService?.status === 'published' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void transition('pause')}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
                >
                  {pendingAction === 'pause' ? t('provider.pausing') : t('provider.pause')}
                </button>
              ) : null}
            </div>
            {saveSuccessKey ? (
              <p role="status" aria-live="polite" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6 text-foreground">
                {t(saveSuccessKey)}
              </p>
            ) : null}
            {selectedService && selectedService.status !== 'published' && settingsDirty ? (
              <p className="text-xs text-muted-foreground">{t('provider.saveBeforePublish')}</p>
            ) : null}
            {selectedService ? (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{t('provider.state', { state: t(`provider.serviceStatus.${selectedService.status}`) })}</span>
                {selectedService.status === 'published' ? (
                  <Link
                    href={`/bokanir/${encodeURIComponent(workspace.profiles.find(profile => profile.id === profileId)?.slug ?? '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex min-h-10 items-center gap-1 font-medium text-primary underline underline-offset-4"
                  >
                    {t('provider.openBookingPage')}
                    <ExternalLink aria-hidden size={14} />
                  </Link>
                ) : null}
                <BookingPendingLink
                  href={`/auth-mvp/bokanir/flaedi/${encodeURIComponent(selectedService.id)}`}
                  pendingLabel={t('workflow.openingEditor')}
                  className="inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4"
                >
                  {t('workflow.editFlow')}
                </BookingPendingLink>
              </div>
            ) : null}
          </form>
          <aside aria-labelledby="booking-provider-guide" className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 id="booking-provider-guide" className="text-base font-semibold text-primary">{t('provider.guideTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t(selectedService?.status === 'published'
                ? 'provider.guidePublishedIntro'
                : selectedService?.status === 'paused'
                  ? 'provider.guidePausedIntro'
                  : selectedService
                    ? 'provider.guideDraftIntro'
                    : 'provider.guideNewIntro')}
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground marker:font-semibold marker:text-primary">
              {selectedService?.status !== 'published' ? (
                <li>{t(selectedService ? 'provider.guidePublishStep' : 'provider.guideCreateStep')}</li>
              ) : null}
              <li>{t('provider.guideShareStep')}</li>
              <li>{t('provider.guideInboxStep')}</li>
            </ol>
          </aside>
          </>
        )}
      </section>

      <section aria-labelledby="booking-provider-inbox" className="space-y-4">
        <div>
          <h2 id="booking-provider-inbox" className="text-lg font-semibold text-primary">{t('provider.inboxTitle')}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('provider.inboxDescription')}</p>
        </div>
        {hasFilterChoices ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              {t('provider.filters.state')}
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                disabled={pending}
                className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              >
                <option value="all">{t('provider.filters.allStates')}</option>
                {workspace.facets.states.map((facet) => {
                  const serviceTitle = workspace.services.find(
                    (service) => service.workflow.id === facet.workflowId,
                  )?.title
                  const label = resolveBookingWorkflowLabel(
                    (key) => t(key),
                    facet,
                    'provider',
                  )
                  return (
                    <option key={facet.key} value={facet.key}>
                      {serviceTitle ? `${label} · ${serviceTitle}` : label} ({facet.count})
                    </option>
                  )
                })}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t('provider.filters.attention')}
              <select
                value={attentionFilter}
                onChange={(event) => setAttentionFilter(event.target.value)}
                disabled={pending}
                className="min-h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60"
              >
                <option value="all">{t('provider.filters.allAttention')}</option>
                {(['provider', 'customer', 'none'] as const).map((side) => (
                  <option key={side} value={side}>
                    {resolveBookingWorkflowAttention((key) => t(key), side, 'provider')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {filterPending ? (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {t('provider.filters.loading')}
          </p>
        ) : null}
        {filterError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{t('provider.filters.error')}</p>
            <button
              type="button"
              disabled={filterPending}
              onClick={() => setFilterRetry(current => current + 1)}
              className="min-h-11 rounded-xl border border-destructive/30 px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
            >
              {t('provider.filters.retry')}
            </button>
          </div>
        ) : workspace.requests.length === 0 && !filtersActive ? (
          <p className="border-y border-border py-6 text-sm text-muted-foreground">{t('provider.emptyInbox')}</p>
        ) : workspace.requests.length === 0 ? (
          <div className="space-y-3 border-y border-border py-6">
            <p className="text-sm text-muted-foreground">{t('provider.filters.empty')}</p>
            <button
              type="button"
              onClick={() => { setStateFilter('all'); setAttentionFilter('all') }}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t('provider.filters.clear')}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {workspace.requests.map(request => (
              <li key={request.publicId}>
                <BookingPendingLink
                  href={`/auth-mvp/bokanir/fyrirspurn/${encodeURIComponent(request.publicId)}`}
                  pendingLabel={t('provider.opening')}
                  className="block min-h-11 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{request.contactName}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {formatRequestedBookingTime(request.requestedDate, request.requestedTime, locale, request.timezone)}
                      </span>
                      <span className="mt-1 block break-words text-xs text-muted-foreground">{request.serviceTitle}</span>
                    </span>
                    <span className="min-w-0 sm:max-w-48 sm:text-right">
                      <span className="inline-flex max-w-full rounded-full border border-border px-2 py-1 text-left text-xs leading-5">
                        <span className="min-w-0 break-words">
                          {request.lifecycleStatus === 'cancelled'
                            ? t('workflow.statusPanel.cancelled.provider')
                            : request.workflowState
                              ? resolveBookingWorkflowLabel(
                                (key) => t(key),
                                request.workflowState,
                                'provider',
                              )
                              : t('workflow.statusPanel.unavailable')}
                        </span>
                      </span>
                      {request.lifecycleStatus === 'requested' && request.workflowState ? (
                        <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">
                          {resolveBookingWorkflowAttention(
                            (key) => t(key),
                            request.workflowState.attentionSide,
                            'provider',
                          )}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </BookingPendingLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
