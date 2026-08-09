'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChatMessageRow } from '@/components/chat/ChatMessageRow'
import { ScopedChatComposer } from '@/components/chat/ScopedChatComposer'
import { PlaceSearch, type PlaceResult } from '@/components/weather/PlaceSearch'
import { useFeedLoader } from '@/lib/weather/useFeedLoader'
import type {
  MapNoteAnchor,
  MapNoteDto,
  MapNoteKind,
  MapRouteFeedbackContext,
  PrivateTeskeidFeedbackDto,
} from '@/lib/map-notes/contracts'

type DraftEnvelope = { clientMessageId: string; idempotencyKey: string }
type LocalPreviewStore = {
  community: MapNoteDto[]
  teskeid_feedback: PrivateTeskeidFeedbackDto[]
}

const LOCAL_PREVIEW_KEY = 'teskeid-map-notes-local-preview-v1'

function newEnvelope(): DraftEnvelope {
  return { clientMessageId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }
}

function readLocalPreview(): LocalPreviewStore {
  if (typeof window === 'undefined') return { community: [], teskeid_feedback: [] }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_PREVIEW_KEY) ?? '{}') as Partial<LocalPreviewStore>
    return {
      community: Array.isArray(parsed.community) ? parsed.community : [],
      teskeid_feedback: Array.isArray(parsed.teskeid_feedback) ? parsed.teskeid_feedback : [],
    }
  } catch {
    return { community: [], teskeid_feedback: [] }
  }
}

function writeLocalPreview(store: LocalPreviewStore): void {
  window.localStorage.setItem(LOCAL_PREVIEW_KEY, JSON.stringify(store))
}

async function loadItems<T>(
  url: string,
  kind: MapNoteKind,
  onLocalPreview: () => void,
): Promise<T[]> {
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok) {
    if (process.env.NODE_ENV !== 'production' && (response.status === 404 || response.status === 503)) {
      onLocalPreview()
      return readLocalPreview()[kind] as T[]
    }
    throw new Error('unavailable')
  }
  const payload = await response.json() as { items?: T[] }
  return payload.items ?? []
}

export function MapNotesPanel({
  isAuthenticated,
  anchor,
  routeFeedbackContext,
  routeFeedbackRequestId,
  onAnchorSelected,
  onClearAnchor,
  onClearRouteContext,
  onCommunityItemsChange,
  onFocusAnchor,
  onSelectCommunityItem,
}: {
  isAuthenticated: boolean
  anchor: MapNoteAnchor | null
  routeFeedbackContext: MapRouteFeedbackContext | null
  routeFeedbackRequestId: number
  onAnchorSelected: (anchor: MapNoteAnchor) => void
  onClearAnchor: () => void
  onClearRouteContext: () => void
  onCommunityItemsChange: (items: MapNoteDto[]) => void
  onFocusAnchor: (anchor: MapNoteAnchor) => void
  onSelectCommunityItem: (item: MapNoteDto) => void
}) {
  const t = useTranslations('teskeid.vedrid.overview')
  const locale = useLocale()
  const [kind, setKind] = useState<MapNoteKind>('community')
  const [locationMode, setLocationMode] = useState<'anchored' | 'general'>('anchored')
  const [body, setBody] = useState('')
  const [search, setSearch] = useState('')
  const [hours, setHours] = useState('all')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<MapNoteKind | null>(null)
  const [view, setView] = useState<'actions' | 'composer' | 'list'>('actions')
  const [localPreviewOnly, setLocalPreviewOnly] = useState(false)
  const envelopeRef = useRef<DraftEnvelope | null>(null)
  const ageMenuRef = useRef<HTMLDetailsElement | null>(null)

  useEffect(() => {
    if (routeFeedbackRequestId > 0) {
      setKind('teskeid_feedback')
      setView('composer')
      setSendSuccess(null)
    }
  }, [routeFeedbackRequestId])

  useEffect(() => {
    envelopeRef.current = null
  }, [anchor, kind, locationMode, routeFeedbackContext])

  const communityFetcher = useMemo(() => async () => loadItems<MapNoteDto>(
    `/api/auth-mvp/map-notes?kind=community&hours=${encodeURIComponent(hours)}&q=${encodeURIComponent(search)}`,
    'community',
    () => setLocalPreviewOnly(true),
  ).then(items => {
    const cutoff = hours === 'all' ? null : Date.now() - Number(hours) * 60 * 60 * 1000
    const needle = search.trim().toLocaleLowerCase('is')
    return items.filter(item => cutoff === null || Date.parse(item.createdAt) >= cutoff).filter(item => (
      !needle || `${item.body} ${item.anchor?.label ?? ''}`.toLocaleLowerCase('is').includes(needle)
    ))
  }), [hours, search])
  const community = useFeedLoader<MapNoteDto>({
    fetcher: communityFetcher,
    cacheKey: `${hours}:${search}`,
    pollIntervalMs: 30_000,
    isOpen: kind === 'community',
  })
  const feedbackFetcher = useMemo(() => async () => loadItems<PrivateTeskeidFeedbackDto>(
    '/api/auth-mvp/map-notes?kind=teskeid_feedback',
    'teskeid_feedback',
    () => setLocalPreviewOnly(true),
  ), [])
  const feedback = useFeedLoader<PrivateTeskeidFeedbackDto>({
    fetcher: feedbackFetcher,
    cacheKey: isAuthenticated ? 'signed-in' : 'signed-out',
    disabled: !isAuthenticated,
    pollIntervalMs: 60_000,
    isOpen: kind === 'teskeid_feedback',
  })

  useEffect(() => onCommunityItemsChange(community.items), [community.items, onCommunityItemsChange])

  const submit = useCallback(async () => {
    const clean = body.trim()
    const submittedAnchor = kind === 'community' && locationMode === 'general' ? null : anchor
    const submittedLocationMode = kind === 'community'
      ? locationMode
      : submittedAnchor ? 'anchored' : 'general'
    if (!clean || sending || !isAuthenticated || (kind === 'community' && locationMode === 'anchored' && !anchor)) return
    const envelope = envelopeRef.current ?? newEnvelope()
    envelopeRef.current = envelope
    setSending(true)
    setSendError(false)
    setSendSuccess(null)
    try {
      const response = await fetch('/api/auth-mvp/map-notes', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          body: clean,
          anchor: submittedAnchor,
          locationMode: submittedLocationMode,
          sourceContext: routeFeedbackContext ? 'route_choice' : 'map',
          routeContext: kind === 'teskeid_feedback' ? routeFeedbackContext : null,
          ...envelope,
        }),
      })
      let createdItem: MapNoteDto | PrivateTeskeidFeedbackDto | null = null
      if (!response.ok) {
        if (process.env.NODE_ENV !== 'production' && (response.status === 404 || response.status === 503)) {
          const createdAt = new Date().toISOString()
          const localItem: PrivateTeskeidFeedbackDto = {
            id: envelope.clientMessageId,
            body: clean,
            createdAt,
            latestAt: createdAt,
            authorName: null,
            anchor: submittedAnchor,
            locationMode: submittedLocationMode,
            sourceContext: routeFeedbackContext ? 'route_choice' : 'map',
            routeContext: kind === 'teskeid_feedback' ? routeFeedbackContext : null,
          }
          const store = readLocalPreview()
          if (kind === 'community') store.community = [localItem, ...store.community]
          else store.teskeid_feedback = [localItem, ...store.teskeid_feedback]
          writeLocalPreview(store)
          setLocalPreviewOnly(true)
        } else {
          throw new Error('send failed')
        }
      } else {
        const payload = await response.json() as { item?: MapNoteDto | PrivateTeskeidFeedbackDto }
        createdItem = payload.item ?? null
      }
      setBody('')
      envelopeRef.current = null
      setSendSuccess(kind)
      setView('actions')
      if (createdItem?.anchor) onFocusAnchor(createdItem.anchor)
      if (kind === 'community') community.refresh()
      else feedback.refresh()
    } catch {
      setSendError(true)
    } finally {
      setSending(false)
    }
  }, [anchor, body, community, feedback, isAuthenticated, kind, locationMode, onFocusAnchor, routeFeedbackContext, sending])

  const canSend = isAuthenticated && (
    kind === 'teskeid_feedback' || locationMode === 'general' || anchor !== null
  )
  const selectedPlace = anchor ? {
    name: anchor.label ?? `${anchor.lat.toFixed(5)}, ${anchor.lon.toFixed(5)}`,
    lat: anchor.lat,
    lon: anchor.lon,
    source: 'map' as const,
  } : null
  const ageOptions = [
    ['0.1666666667', t('mapNotesTimeTenMinutes')],
    ['0.5', t('mapNotesTimeThirtyMinutes')],
    ['1', t('mapNotesTimeSixtyMinutes')],
    ['24', t('mapNotesTimeDay')],
    ['72', t('mapNotesTimeThreeDays')],
    ['168', t('mapNotesTimeWeek')],
    ['720', t('mapNotesTimeMonth')],
    ['all', t('mapNotesTimeAll')],
  ] as const
  const selectedAgeLabel = ageOptions.find(([value]) => value === hours)?.[1] ?? t('mapNotesTimeAll')

  return (
    <section aria-labelledby="map-notes-title" className="space-y-3">
      <div>
        <h2 id="map-notes-title" className="text-base font-semibold text-foreground">{t('mapNotesTitle')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('mapNotesDescription')}</p>
      </div>

      {localPreviewOnly && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t('mapNotesLocalPreview')}
        </p>
      )}

      {sendSuccess && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm font-medium text-primary">
          {sendSuccess === 'community' ? t('mapNotesCommunitySent') : t('mapNotesFeedbackSent')}
        </p>
      )}

      {view === 'actions' && <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{t('mapNotesActions')}</h3>
        <div className="space-y-2 rounded-xl border border-border/70 bg-background p-3">
          <button type="button" onClick={() => { setKind('community'); setView('composer'); setSendSuccess(null) }} className="min-h-11 w-full rounded-lg bg-primary px-3 text-left text-sm font-semibold text-primary-foreground">{t('mapNotesOpenComposer')}</button>
          <button type="button" onClick={() => setView('list')} className="min-h-11 w-full rounded-lg border border-border px-3 text-left text-sm font-semibold">{t('mapNotesViewAll')}</button>
          <div className="min-w-0 space-y-1 text-xs font-medium text-foreground">
            <span>{t('mapNotesAge')}</span>
            <details ref={ageMenuRef} className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-base font-normal marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="min-w-0 truncate">{selectedAgeLabel}</span>
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">⌄</span>
              </summary>
              <div className="max-h-[min(16rem,40dvh)] min-w-0 space-y-1 overflow-y-auto border-t border-border p-1">
                {ageOptions.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={hours === value} onClick={() => { setHours(value); if (ageMenuRef.current) ageMenuRef.current.open = false }} className={`min-h-10 w-full min-w-0 rounded-md px-2 text-left text-sm font-normal ${hours === value ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted'}`}>
                    <span className="block truncate">{label}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>}

      {view === 'composer' && isAuthenticated ? (
        <div className="space-y-2 rounded-xl border border-border/70 bg-background p-3">
          <div role="group" aria-label={t('mapNotesKindLabel')} className="grid grid-cols-2 rounded-full bg-muted p-1">
            {(['community', 'teskeid_feedback'] as const).map(option => <button key={option} type="button" aria-pressed={kind === option} onClick={() => setKind(option)} className={`min-h-10 rounded-full px-2 text-xs font-semibold ${kind === option ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}>{option === 'community' ? t('mapNotesCommunityTab') : t('mapNotesFeedbackTab')}</button>)}
          </div>
          <p className="text-xs font-semibold text-foreground">
            {kind === 'community' ? t('mapNotesCommunityComposerTitle') : t('mapNotesFeedbackComposerTitle')}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {kind === 'community' ? t('mapNotesCommunityPrivacy') : t('mapNotesFeedbackPrivacy')}
          </p>

          {routeFeedbackContext && kind === 'teskeid_feedback' && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t('mapNotesAttachedRoute')}</p>
                  <p className="mt-0.5 break-words text-muted-foreground">
                    {routeFeedbackContext.from} → {routeFeedbackContext.to}
                  </p>
                </div>
                <button type="button" onClick={onClearRouteContext} className="min-h-10 shrink-0 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted">
                  {t('mapNotesRemoveRoute')}
                </button>
              </div>
            </div>
          )}

          {kind === 'community' && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-foreground">{t('mapNotesLocationModeLabel')}</legend>
              <div className="grid gap-2 min-[420px]:grid-cols-2">
                {(['anchored', 'general'] as const).map(mode => (
                  <label
                    key={mode}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      locationMode === mode ? 'border-primary bg-primary/5 text-primary' : 'border-border text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="map-note-location-mode"
                      value={mode}
                      checked={locationMode === mode}
                      onChange={() => {
                        setLocationMode(mode)
                        if (mode === 'general') onClearAnchor()
                      }}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span>{mode === 'anchored' ? t('mapNotesLocationAnchored') : t('mapNotesLocationGeneral')}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {(kind === 'teskeid_feedback' || locationMode === 'anchored') && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">{t('mapNotesPlaceLabel')}</p>
              <PlaceSearch
                onPlaceSelected={(place: PlaceResult) => onAnchorSelected({
                  lat: place.lat,
                  lon: place.lon,
                  label: place.formattedAddress ?? place.name,
                })}
                selectedPlace={selectedPlace}
                onClearSelectedPlace={onClearAnchor}
              allowCurrentLocation
              showCurrentLocationOnAllViewports
              allowMapSelection
              autoFocus={false}
                variant="compact"
                ariaLabel={t('mapNotesPlaceLabel')}
                placeholder={t('mapNotesPlacePlaceholder')}
              />
              {anchor && (
                <button
                  type="button"
                  onClick={() => onFocusAnchor(anchor)}
                  className="min-h-10 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/5"
                >
                  {t('mapNotesShowPlaceOnMap')}
                </button>
              )}
            </div>
          )}
          {kind === 'community' && locationMode === 'anchored' && !anchor && <p className="text-xs text-destructive">{t('mapNotesLocationRequired')}</p>}
          {kind === 'community' && locationMode === 'general' && (
            <p className="rounded-lg bg-muted/60 p-2 text-xs leading-relaxed text-muted-foreground">{t('mapNotesLocationGeneralHint')}</p>
          )}
          <ScopedChatComposer
            value={body}
            onChange={(value) => { setBody(value); setSendError(false); envelopeRef.current = null }}
            onSend={() => void submit()}
            disabled={sending}
            sendDisabled={!canSend}
            placeholder={kind === 'community' ? t('mapNotesCommunityPlaceholder') : t('mapNotesFeedbackPlaceholder')}
            sendLabel={sending ? t('mapNotesSending') : t('mapNotesSend')}
            maxLength={500}
            multiline
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('mapNotesDrivingSafety')}</p>
          {sendError && <p role="alert" className="text-xs text-destructive">{t('mapNotesSendError')}</p>}
          <button type="button" onClick={() => { setView('actions'); setSendError(false) }} className="min-h-10 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted">{t('mapNotesComposerCancel')}</button>
        </div>
      ) : view === 'composer' ? (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t('mapNotesSignInToWrite')}</p>
      ) : null}

      {view === 'list' && <div className="space-y-3" aria-live="polite">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t('mapNotesViewAll')}</h3><button type="button" onClick={() => setView('actions')} className="min-h-10 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted">{t('mapNotesBack')}</button></div>
        <label className="space-y-1 text-xs font-medium"><span>{t('mapNotesSearchLabel')}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={80} placeholder={t('mapNotesSearchPlaceholder')} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" /></label>
        {community.loading ? (
          <p className="text-xs text-muted-foreground">{t('mapNotesLoading')}</p>
        ) : community.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('mapNotesEmpty')}</p>
        ) : community.items.map(item => (
          <button
            key={item.id}
            type="button"
            disabled={!item.anchor}
            onClick={() => item.anchor && onSelectCommunityItem(item)}
            className="block min-h-10 w-full rounded-lg border-b border-border/70 px-1 py-2 text-left disabled:cursor-default"
          >
            <ChatMessageRow
              msg={{
                id: item.id,
                threadId: 'map',
                body: item.body,
                messageKind: 'map_note',
                createdAt: item.createdAt,
                isDeleted: false,
                isHidden: false,
                authorName: item.authorName,
              }}
              deletedLabel={t('mapNotesDeleted')}
              kindLabels={{ map_note: t('mapNotesCommunityBadge'), teskeid_feedback: t('mapNotesFeedbackBadge') }}
              targetName={item.anchor?.label ?? (item.locationMode === 'general' ? t('mapNotesLocationGeneral') : undefined)}
              locale={locale}
            />
          </button>
        ))}
      </div>}
    </section>
  )
}
