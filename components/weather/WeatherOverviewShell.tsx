'use client'

import { useEffect, useRef, useState, Fragment } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronLeft, Car } from 'lucide-react'
import type { ProviderMapLayer, SelectedProviderMarker } from '@/lib/weather/types'
import {
  parseOverviewSelection,
  overviewSelectionUrl,
  overviewSelectionKey,
} from '@/lib/weather/overviewSelectionUrl'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { IcelandOverviewMap } from '@/components/weather/IcelandOverviewMap'

// ── Public contract ─────────────────────────────────────────────────────────

/** Context passed to provider render functions, scoped to that provider's markers. */
export interface ProviderContentCtx {
  /** The marker ID currently selected within this provider's layer, or null. */
  selectedMarkerId: string | null
  /** Select or deselect a marker within this provider. Null = deselect. */
  onSelectMarker: (markerId: string | null) => void
}

/**
 * Provider-neutral configuration for one weather data source on the overview screen.
 * New providers (e.g. Vegagerðin) implement this interface to plug into the shell
 * without requiring a separate overview screen.
 */
export interface WeatherOverviewProviderConfig {
  /** Stable identifier for this provider (e.g. 'vedurstofan', 'vegagerdin'). */
  providerId: string
  /** Human-readable provider name shown in the provider strip (e.g. 'Veðurstofan'). */
  label: string
  /** Shorter label for narrow contexts. Falls back to label if absent. */
  shortLabel?: string
  /** True while the provider is fetching its initial data. */
  loading: boolean
  /** True if a real (non-restricted) fetch error occurred (5xx / network). */
  loadError: boolean
  /**
   * True if the provider layer is access-restricted (401/403) or disabled (404).
   * Layer is omitted silently — no error state shown.
   */
  providerRestricted: boolean
  /**
   * Why the provider is not contributing data. Null/undefined if the provider is active.
   * - 'restricted' — access-gated for this user
   * - 'disabled'   — feature flag off
   * - 'upcoming'   — provider exists but data is not yet live
   * - 'error'      — fetch failed
   * - 'empty'      — successfully fetched but returned no usable data
   */
  unavailableReason?: 'restricted' | 'disabled' | 'upcoming' | 'error' | 'empty'
  /** Whether the user can toggle this provider's visibility on/off in the shell. */
  canToggle: boolean
  /** Whether this provider's content and map layer should be rendered. */
  isVisible: boolean
  /** Called when the user toggles provider visibility. Only called when canToggle=true. */
  onToggle?: (nextVisible: boolean) => void
  /** Text shown inside the pill while provider data is loading, e.g. "Sæki Vegagerðargögn..." */
  loadingLabel?: string
  /** Map markers for this provider. Null while loading, restricted, or unavailable. */
  mapLayer: ProviderMapLayer | null
  /**
   * Feed content rendered above the map, shown whenever the provider is not
   * access-restricted and has no load error — even when unavailableReason is set
   * (e.g. 'empty'). Use this for feeds like ConditionsFeedPreview that should always
   * be visible to the user even when no station data is loaded.
   */
  renderFeedPreMap?: (ctx: ProviderContentCtx) => React.ReactNode
  /**
   * Provider-specific content rendered BEFORE the map
   * (e.g. aggregated pulse feed, summary strip).
   * Only called when isVisible=true and provider has no unavailableReason.
   */
  renderPreMap?: (ctx: ProviderContentCtx) => React.ReactNode
  /**
   * Provider-specific content rendered AFTER the map
   * (e.g. filter tabs, selected marker detail, item list).
   * Only called when isVisible=true and provider has no unavailableReason.
   */
  renderPostMap?: (ctx: ProviderContentCtx) => React.ReactNode
  /**
   * Content rendered below the map, always visible regardless of provider state.
   * Use for cross-provider UI elements like WindStatusFilterPills that reflect
   * aggregated status across all visible providers.
   */
  renderBelowMap?: () => React.ReactNode
}

// ── Shell component ─────────────────────────────────────────────────────────

interface WeatherOverviewShellProps {
  backHref?: string
  backLabel?: string
  title: string
  subtitle: string
  menuVariant?: 'public' | 'authenticated'
  tripHref?: string
  providers: WeatherOverviewProviderConfig[]
  /**
   * When provided, replaces the default provider filter pills with a custom
   * source/time selector (e.g. WeatherSourceTimeSelector).
   */
  renderProviderSelector?: () => React.ReactNode
  /**
   * When provided, renders a compact informational banner after the page header
   * and before the main controls. Intended for first-version context copy.
   */
  renderBanner?: () => React.ReactNode
  /**
   * When provided, renders content between the source/time selector and the
   * route lens (Frá/Til). Intended for the weather threshold bar.
   */
  renderBelowSelector?: () => React.ReactNode
  /**
   * When provided, renders the route lens panel (Frá/Til inputs) below the
   * threshold bar, above the bottom CTA.
   */
  renderRouteLens?: () => React.ReactNode
  /**
   * When provided and non-null, programmatically selects the given provider marker.
   * Applied via useEffect when the key (layerId + markerId) changes.
   * Does not override the user's own in-session selection — only fires when the
   * identity changes (e.g. a new from-place is picked in the route lens).
   * Setting to null makes no change (does not deselect the current marker).
   */
  requestedSelection?: SelectedProviderMarker | null
}

export function WeatherOverviewShell({
  backHref,
  backLabel,
  title,
  subtitle,
  menuVariant,
  tripHref,
  providers,
  renderProviderSelector,
  renderBelowSelector,
  renderBanner,
  renderRouteLens,
  requestedSelection,
}: WeatherOverviewShellProps) {
  const t = useTranslations('teskeid.vedrid.overview')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedProvider, setSelectedProvider] = useState<SelectedProviderMarker | null>(null)
  // Tracks the last url selection key that was successfully applied (or '' if none/given-up).
  // Reset to '' whenever the url selection changes so that navigation between stations works.
  const lastRestoredKeyRef = useRef('')

  // Apply external selection requests (e.g. nearest station from route-memory picker).
  // Uses a primitive string dep to fire only when the identity actually changes.
  // Does not fire when requestedSelection is null — null means "no request", not "deselect".
  const requestedKey = requestedSelection
    ? `${requestedSelection.layerId}:${requestedSelection.markerId}`
    : null
  useEffect(() => {
    if (!requestedSelection) return
    setSelectedProvider(requestedSelection)
    const selection = { provider: requestedSelection.layerId, stationId: requestedSelection.markerId }
    const next = overviewSelectionUrl(window.location.href, selection)
    router.replace(next, { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedKey])

  // Only visible providers contribute layers to the map.
  const mapLayers = providers
    .filter(p => p.isVisible && !p.unavailableReason)
    .map(p => p.mapLayer)
    .filter((l): l is ProviderMapLayer => l !== null)

  const hasMapData = mapLayers.length > 0
  const layerCount = mapLayers.length
  const allSettled = providers.every(p => !p.loading)
  const urlSelection = parseOverviewSelection(searchParams)
  const urlSelectionKey = overviewSelectionKey(urlSelection)

  // Restore selected marker from URL whenever urlSelection or available layers change.
  // Retries each time a new provider layer loads (layerCount changes).
  // Only marks done (lastRestoredKeyRef = key) when the marker is found OR all providers settle.
  // Resets automatically when urlSelection changes (browser back/forward or link navigation).
  useEffect(() => {
    if (lastRestoredKeyRef.current === urlSelectionKey) return
    if (!urlSelection) {
      lastRestoredKeyRef.current = ''
      return
    }
    // If a provider is specified, only search that provider's layer.
    // For legacy URLs (provider = 'vedurstofan' fallback), search all layers.
    const candidateLayers = urlSelection.provider !== 'vedurstofan'
      ? mapLayers.filter(l => l.layerId === urlSelection.provider)
      : mapLayers
    for (const layer of candidateLayers) {
      if (layer.markers.some(m => m.id === urlSelection.stationId)) {
        setSelectedProvider({ layerId: layer.layerId, markerId: urlSelection.stationId })
        lastRestoredKeyRef.current = urlSelectionKey
        return
      }
    }
    // Marker not found yet. If all providers have settled, give up gracefully.
    if (allSettled) {
      lastRestoredKeyRef.current = urlSelectionKey
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSelectionKey, layerCount, allSettled])

  // Clear selected marker when its provider layer is toggled off or becomes unavailable.
  // Runs whenever the set of visible layer IDs changes.
  const mapLayerIdKey = mapLayers.map(l => l.layerId).join(',')
  useEffect(() => {
    if (!selectedProvider) return
    if (!mapLayers.some(l => l.layerId === selectedProvider.layerId)) {
      setSelectedProvider(null)
      syncUrl(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLayerIdKey])

  function handleMapSelect(s: SelectedProviderMarker | null) {
    if (!s) {
      setSelectedProvider(null)
      syncUrl(null)
      return
    }
    const isSame =
      selectedProvider?.layerId === s.layerId && selectedProvider?.markerId === s.markerId
    const next = isSame ? null : s
    setSelectedProvider(next)
    syncUrl(next)
  }

  function handleProviderSelect(providerId: string, markerId: string | null) {
    if (!markerId) {
      setSelectedProvider(null)
      syncUrl(null)
      return
    }
    const isSame =
      selectedProvider?.layerId === providerId && selectedProvider?.markerId === markerId
    const next = isSame ? null : { layerId: providerId, markerId }
    setSelectedProvider(next)
    syncUrl(next)
  }

  function syncUrl(s: SelectedProviderMarker | null) {
    const selection = s ? { provider: s.layerId, stationId: s.markerId } : null
    const next = overviewSelectionUrl(window.location.href, selection)
    router.replace(next, { scroll: false })
  }

  function makeCtx(providerId: string): ProviderContentCtx {
    return {
      selectedMarkerId:
        selectedProvider?.layerId === providerId ? selectedProvider.markerId : null,
      onSelectMarker: (markerId) => handleProviderSelect(providerId, markerId),
    }
  }

  const anyLoading = providers.some(p => p.loading && !p.providerRestricted && !p.unavailableReason)
  const anyLoadError = providers.some(p => p.loadError)

  // Active providers: visible, no unavailableReason, and have data or are loading.
  const activeProviders = providers.filter(p => p.isVisible && !p.unavailableReason)

  // Show provider strip whenever multiple providers are registered (upcoming or active).
  const showProviderStrip = providers.length > 1

  // Show a degraded empty state when all active providers are unavailable/restricted/errored.
  const allUnavailable =
    providers.length > 0 &&
    providers.every(p => p.providerRestricted || p.unavailableReason != null || p.loadError)

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col gap-1">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ChevronLeft className="w-3 h-3" />
            {backLabel ?? t('back')}
          </Link>
        )}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {menuVariant && <TeskeidMenu variant={menuVariant} />}
        </div>
      </div>

      {renderBanner?.()}

      {anyLoadError && <p className="text-sm text-destructive">{t('loadError')}</p>}

      {/* 1. Conditions drawer — always visible at the top, even when provider is restricted.
          renderFeedPreMap is unconditional so public feeds (e.g. ConditionsFeedPreview)
          remain visible regardless of provider access. */}
      {providers.map(provider => (
        <Fragment key={`${provider.providerId}-feed`}>
          {provider.renderFeedPreMap?.(makeCtx(provider.providerId))}
        </Fragment>
      ))}

      {/* 2. Map — rendered when at least one visible provider layer is available */}
      {hasMapData && (
        <IcelandOverviewMap
          layers={mapLayers}
          selected={selectedProvider}
          onSelect={handleMapSelect}
          loadingLabel={t('loading')}
          errorLabel={t('mapUnavailable')}
        />
      )}

      {/* 3. Status pills — below map, always visible cross-provider */}
      {providers.map(provider => (
        <Fragment key={`${provider.providerId}-below`}>
          {provider.renderBelowMap?.()}
        </Fragment>
      ))}

      {/* Station detail cards — contextual to map marker selection */}
      {activeProviders.map(provider => (
        <Fragment key={`${provider.providerId}-post`}>
          {provider.renderPostMap?.(makeCtx(provider.providerId))}
        </Fragment>
      ))}

      {/* Degraded state: all providers unavailable */}
      {allUnavailable && !anyLoading && (
        <p className="text-xs text-muted-foreground">
          {t('allProvidersUnavailable')}
        </p>
      )}

      {/* 4. Source/time selector — below map */}
      {renderProviderSelector ? renderProviderSelector() : showProviderStrip && (
        <div className="flex flex-wrap gap-2">
          {providers.map(p => {
            const isUnavailable = p.providerRestricted || p.unavailableReason != null
            const canInteract = p.canToggle && !isUnavailable && !p.loading
            const pillLabel = p.loading
              ? (p.loadingLabel ?? `${p.shortLabel ?? p.label}…`)
              : (p.shortLabel ?? p.label)
            return (
              <button
                key={p.providerId}
                type="button"
                disabled={!canInteract}
                onClick={() => { if (canInteract) p.onToggle?.(!p.isVisible) }}
                aria-pressed={!isUnavailable && !p.loading && p.isVisible}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isUnavailable
                    ? 'border-border/40 text-muted-foreground/40 cursor-default'
                    : p.loading
                      ? 'border-border text-muted-foreground bg-transparent cursor-default'
                      : p.isVisible
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border text-muted-foreground bg-transparent hover:border-foreground/50 hover:text-foreground'
                }`}
              >
                {pillLabel}
              </button>
            )
          })}
        </div>
      )}

      {/* Provider inline states (e.g. empty cache message) — only for active providers */}
      {activeProviders.map(provider => (
        <Fragment key={`${provider.providerId}-pre`}>
          {provider.renderPreMap?.(makeCtx(provider.providerId))}
        </Fragment>
      ))}

      {/* 5. Thresholds — between source selector and Frá/Til */}
      {renderBelowSelector?.()}

      {/* 6. Frá/Til route inputs — above the bottom CTA */}
      {renderRouteLens?.()}

      {/* 7. Ferðalagið CTA — single bottom CTA */}
      {tripHref && (
        <div className="flex justify-center pt-2">
          <Link
            href={tripHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 min-h-[44px] hover:bg-primary/90 transition-colors"
          >
            <Car className="w-4 h-4" aria-hidden />
            {t('tripCta')}
          </Link>
        </div>
      )}

    </div>
  )
}
