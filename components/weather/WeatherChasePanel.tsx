'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ForecastDrawerRow, ResolvedTravelThresholds } from '@/lib/weather/types'
import { formatNum } from '@/components/weather/travelAuditMap.helpers'
import { cn } from '@/lib/utils'

export type WeatherChaseProviderId = 'vedurstofan' | 'metno' | 'vegagerdin'

export type WeatherChaseItem = {
  id: string
  label: string
  providerId: WeatherChaseProviderId
  providerLabel: string
  sourceLabel?: string
  rows: ForecastDrawerRow[]
  lat?: number | null
  lon?: number | null
  needsRowLoad?: boolean
}

export type WeatherChaseCriteria = {
  minTemperatureC: number | null
  maxWindMs: number | null
  maxPrecipitationMmPerHour: number | null
}

export type WeatherChaseSaveStatus = 'idle' | 'saving' | 'saved' | 'local' | 'error'

export type WeatherChasePreferenceItem = {
  id: string
  providerId: WeatherChaseProviderId
  label: string
  lat?: number | null
  lon?: number | null
}

type WeatherChaseColumn = {
  dayLabel: string
  timeLabel: string
  targetIso: string
  rowsByItemId: Map<string, ForecastDrawerRow | null>
}

type WeatherChaseLabels = {
  title: string
  subtitle: string
  loading: string
  emptyData: string
  searchLabel: string
  searchPlaceholder: string
  selectedLabel: string
  suggestionsLabel: string
  noSuggestions: string
  addLabel: string
  removeLabel: string
  moveUpLabel: string
  moveDownLabel: string
  showNearbyStationsLabel: string
  emptySelection: string
  reorderTitle: string
  noRowsLabel: string
  criteriaTitle: string
  criteriaHint: string
  minTemperatureLabel: string
  maxWindLabel: string
  maxPrecipitationLabel: string
  decreasePrecipitationLabel: string
  increasePrecipitationLabel: string
  decreaseTemperatureLabel: string
  increaseTemperatureLabel: string
  decreaseWindLabel: string
  increaseWindLabel: string
  temperatureUnit: string
  windUnit: string
  precipitationUnit: string
  visibleHoursLabel: string
  visibleHourAriaLabel: string
  saveDefaultsLabel: string
  savingDefaultsLabel: string
  savedDefaultsLabel: string
  savedLocalDefaultsLabel: string
  saveDefaultsFailedLabel: string
  settingsLabel: string
}

type Props = {
  items: WeatherChaseItem[]
  initialSelectedIds: string[]
  labels: WeatherChaseLabels
  locale: string
  thresholds?: ResolvedTravelThresholds | null
  loading?: boolean
  onLoadItemRows?: (item: WeatherChaseItem) => Promise<ForecastDrawerRow[]>
  onSelectedItemsChange?: (items: WeatherChaseItem[]) => void
  onShowNearbyStations?: (item: WeatherChaseItem) => void
  criteria?: WeatherChaseCriteria
  onCriteriaChange?: (criteria: WeatherChaseCriteria) => void
  onSaveDefault?: (input: {
    selectedItems: WeatherChasePreferenceItem[]
    criteria: WeatherChaseCriteria
  }) => void
  saveStatus?: WeatherChaseSaveStatus
  nearbyStationItemId?: string | null
  nearbyStationItems?: WeatherChaseItem[]
}

const CMP_IS_WEEKDAY = ['sun', 'mán', 'þri', 'mið', 'fim', 'fös', 'lau']
const CMP_IS_MONTH = ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des']
const CMP_EN_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CMP_EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DEFAULT_WEATHER_CHASE_CRITERIA: WeatherChaseCriteria = {
  minTemperatureC: null,
  maxWindMs: null,
  maxPrecipitationMmPerHour: null,
}
const WEATHER_CHASE_VISIBLE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21] as const
type WeatherChaseVisibleHour = (typeof WEATHER_CHASE_VISIBLE_HOURS)[number]

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('is')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function windMetricClass(
  value: number,
  peerValues: number[],
  thresholds: ResolvedTravelThresholds | undefined | null,
): string {
  if (thresholds) {
    if (value >= thresholds.redWindMs) return 'text-destructive'
    if (value >= thresholds.cautionWindMs) return 'text-amber-600 dark:text-amber-500'
  }
  if (peerValues.length > 0 && value === Math.min(...peerValues, value)) {
    return 'text-emerald-600 dark:text-emerald-500'
  }
  return ''
}

function precipMetricClass(
  value: number,
  peerValues: number[],
  thresholds: ResolvedTravelThresholds | undefined | null,
): string {
  if (thresholds && value >= thresholds.cautionPrecipMmPerHour) {
    return 'text-amber-600 dark:text-amber-500'
  }
  if (value > 0 && peerValues.length > 0 && value === Math.min(...peerValues, value)) {
    return 'text-emerald-600 dark:text-emerald-500'
  }
  return ''
}

function tempMetricClass(value: number, peerValues: number[]): string {
  if (peerValues.length > 0 && value === Math.max(...peerValues, value)) {
    return 'text-emerald-600 dark:text-emerald-500'
  }
  return ''
}

function criteriaInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

function criteriaNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function criteriaStepInputValue(value: number, locale: string): string {
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return locale.startsWith('is') ? text.replace('.', ',') : text
}

function metricFailsCriteria(
  metric: 'temperature' | 'wind' | 'precipitation',
  value: number,
  criteria: WeatherChaseCriteria,
): boolean {
  if (metric === 'temperature') {
    return criteria.minTemperatureC !== null && value < criteria.minTemperatureC
  }
  if (metric === 'wind') {
    return criteria.maxWindMs !== null && value > criteria.maxWindMs
  }
  return criteria.maxPrecipitationMmPerHour !== null && value > criteria.maxPrecipitationMmPerHour
}

function preferenceItemFromWeatherChaseItem(item: WeatherChaseItem): WeatherChasePreferenceItem {
  return {
    id: item.id,
    providerId: item.providerId,
    label: item.label,
    ...(typeof item.lat === 'number' && Number.isFinite(item.lat) ? { lat: item.lat } : {}),
    ...(typeof item.lon === 'number' && Number.isFinite(item.lon) ? { lon: item.lon } : {}),
  }
}

function buildWeatherChaseColumns(
  items: WeatherChaseItem[],
  targetHoursUtc: number[],
  locale: string,
): WeatherChaseColumn[] {
  const toleranceMs = 90 * 60 * 1000
  const isIs = locale === 'is' || locale.startsWith('is')
  const dateSet = new Set<string>()

  for (const item of items) {
    for (const row of item.rows) {
      const d = new Date(row.timeIso)
      dateSet.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
    }
  }

  const findNearest = (rows: ForecastDrawerRow[], targetMs: number): ForecastDrawerRow | null => {
    let best: ForecastDrawerRow | null = null
    let bestDiff = Infinity
    for (const row of rows) {
      const diff = Math.abs(new Date(row.timeIso).getTime() - targetMs)
      if (diff <= toleranceMs && diff < bestDiff) {
        best = row
        bestDiff = diff
      }
    }
    return best
  }

  const cols: WeatherChaseColumn[] = []
  const dates = Array.from(dateSet).sort()
  for (const dateStr of dates) {
    for (const hour of targetHoursUtc) {
      const hh = String(hour).padStart(2, '0')
      const targetIso = `${dateStr}T${hh}:00:00.000Z`
      const targetMs = new Date(targetIso).getTime()
      const rowsByItemId = new Map<string, ForecastDrawerRow | null>()
      let hasAny = false
      for (const item of items) {
        const row = findNearest(item.rows, targetMs)
        rowsByItemId.set(item.id, row)
        if (row) hasAny = true
      }
      if (!hasAny) continue
      const d = new Date(targetIso)
      const dayLabel = isIs
        ? `${CMP_IS_WEEKDAY[d.getUTCDay()]}. ${d.getUTCDate()}. ${CMP_IS_MONTH[d.getUTCMonth()]}`
        : `${CMP_EN_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${CMP_EN_MONTH[d.getUTCMonth()]}`
      const timeLabel = isIs ? `kl. ${hh}:00` : `${hh}:00`
      cols.push({ dayLabel, timeLabel, targetIso, rowsByItemId })
    }
  }

  return cols
}

function MetricStack({
  row,
  peerRows,
  thresholds,
  locale,
  criteria,
  labels,
}: {
  row: ForecastDrawerRow | null
  peerRows: ForecastDrawerRow[]
  thresholds?: ResolvedTravelThresholds | null
  locale: string
  criteria: WeatherChaseCriteria
  labels: Pick<WeatherChaseLabels, 'temperatureUnit' | 'windUnit' | 'precipitationUnit'>
}) {
  if (!row) {
    return <span className="text-[11px] text-muted-foreground/40">–</span>
  }

  const peerTemps = peerRows.map(peer => peer.temperature.value)
  const peerWinds = peerRows.map(peer => peer.wind.value)
  const peerPrecip = peerRows.map(peer => peer.precipitation.value)
  const temperatureFailsCriteria = metricFailsCriteria('temperature', row.temperature.value, criteria)
  const windFailsCriteria = metricFailsCriteria('wind', row.wind.value, criteria)
  const precipitationFailsCriteria = metricFailsCriteria('precipitation', row.precipitation.value, criteria)

  return (
    <div className="space-y-0.5 rounded-md">
      <p
        className={cn(
          'text-sm font-semibold text-foreground transition-opacity',
          tempMetricClass(row.temperature.value, peerTemps),
          temperatureFailsCriteria && 'opacity-35 grayscale',
        )}
      >
        {formatNum(row.temperature.value, locale)}{labels.temperatureUnit}
      </p>
      <p
        className={cn(
          'text-xs font-medium text-foreground transition-opacity',
          windMetricClass(row.wind.value, peerWinds, thresholds),
          windFailsCriteria && 'opacity-35 grayscale',
        )}
      >
        {formatNum(row.wind.value, locale)} {labels.windUnit}
      </p>
      <p
        className={cn(
          'text-[11px] text-muted-foreground transition-opacity',
          precipMetricClass(row.precipitation.value, peerPrecip, thresholds),
          precipitationFailsCriteria && 'opacity-35 grayscale',
        )}
      >
        {formatNum(row.precipitation.value, locale)} {labels.precipitationUnit}
      </p>
    </div>
  )
}

function ProviderBadge({ item }: { item: WeatherChaseItem }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
      <span className="truncate">{item.providerLabel}</span>
    </span>
  )
}

function findPeers(
  items: WeatherChaseItem[],
  col: WeatherChaseColumn,
  currentItemId: string,
): ForecastDrawerRow[] {
  return items
    .filter(peer => peer.id !== currentItemId)
    .map(peer => col.rowsByItemId.get(peer.id))
    .filter((peer): peer is ForecastDrawerRow => !!peer)
}

export function WeatherChasePanel({
  items,
  initialSelectedIds,
  labels,
  locale,
  thresholds,
  loading = false,
  onLoadItemRows,
  onSelectedItemsChange,
  onShowNearbyStations,
  criteria,
  onCriteriaChange,
  onSaveDefault,
  saveStatus = 'idle',
  nearbyStationItemId = null,
  nearbyStationItems = [],
}: Props) {
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [internalCriteria, setInternalCriteria] = useState<WeatherChaseCriteria>(DEFAULT_WEATHER_CHASE_CRITERIA)
  const [loadedRowsById, setLoadedRowsById] = useState<Map<string, ForecastDrawerRow[]>>(new Map())
  const [loadingRowIds, setLoadingRowIds] = useState<Set<string>>(new Set())
  const [failedRowIds, setFailedRowIds] = useState<Set<string>>(new Set())
  const [visibleHours, setVisibleHours] = useState<WeatherChaseVisibleHour[]>([12])
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchBlurTimerRef = useRef<number | null>(null)
  const appliedDefaultsKeyRef = useRef<string | null>(null)
  const inFlightLoadIdsRef = useRef<Set<string>>(new Set())
  const activeCriteria = criteria ?? internalCriteria
  const precipitationCriteriaValueRef = useRef<number | null>(activeCriteria.maxPrecipitationMmPerHour)
  const [precipitationDraft, setPrecipitationDraft] = useState(
    criteriaInputValue(activeCriteria.maxPrecipitationMmPerHour),
  )
  const temperatureCriteriaValueRef = useRef<number | null>(activeCriteria.minTemperatureC)
  const [temperatureDraft, setTemperatureDraft] = useState(criteriaInputValue(activeCriteria.minTemperatureC))
  const windCriteriaValueRef = useRef<number | null>(activeCriteria.maxWindMs)
  const [windDraft, setWindDraft] = useState(criteriaInputValue(activeCriteria.maxWindMs))

  const itemById = useMemo(() => {
    return new Map(items.map(item => {
      const loadedRows = loadedRowsById.get(item.id)
      return [item.id, loadedRows ? { ...item, rows: loadedRows } : item] as const
    }))
  }, [items, loadedRowsById])

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    if (items.length === 0) return
    const defaultsKey = initialSelectedIds.length > 0 ? initialSelectedIds.join('|') : '__fallback__'
    if (appliedDefaultsKeyRef.current === defaultsKey) return
    const selected = initialSelectedIds
      .map(id => itemById.get(id))
      .filter((item): item is WeatherChaseItem => !!item)
      .slice(0, 7)

    if (initialSelectedIds.length > 0) {
      const waitingForSavedVedurstofanItems =
        initialSelectedIds.some(id => id.startsWith('vedurstofan:') && !itemById.has(id)) &&
        !items.some(item => item.providerId === 'vedurstofan')
      if (waitingForSavedVedurstofanItems) return
      if (selected.length === 0) return
      setSelectedIds(selected.map(item => item.id))
      appliedDefaultsKeyRef.current = defaultsKey
      return
    }

    setSelectedIds(items.slice(0, 3).map(item => item.id))
    appliedDefaultsKeyRef.current = defaultsKey
  }, [initialSelectedIds, itemById, items])

  const selectedItems = useMemo(
    () => selectedIds.map(id => itemById.get(id)).filter((item): item is WeatherChaseItem => !!item),
    [itemById, selectedIds],
  )

  useEffect(() => {
    onSelectedItemsChange?.(selectedItems)
  }, [onSelectedItemsChange, selectedItems])

  useEffect(() => {
    if (!onLoadItemRows) return
    const toLoad = selectedItems.filter(item =>
      item.needsRowLoad &&
      item.rows.length === 0 &&
      !loadingRowIds.has(item.id) &&
      !inFlightLoadIdsRef.current.has(item.id) &&
      !failedRowIds.has(item.id),
    )
    if (toLoad.length === 0) return

    setLoadingRowIds(prev => new Set([...prev, ...toLoad.map(item => item.id)]))

    for (const item of toLoad) {
      inFlightLoadIdsRef.current.add(item.id)
      onLoadItemRows(item)
        .then(rows => {
          setLoadedRowsById(prev => {
            const next = new Map(prev)
            next.set(item.id, rows)
            return next
          })
        })
        .catch(() => {
          setFailedRowIds(prev => new Set([...prev, item.id]))
        })
        .finally(() => {
          inFlightLoadIdsRef.current.delete(item.id)
          setLoadingRowIds(prev => {
            const next = new Set(prev)
            next.delete(item.id)
            return next
          })
        })
    }
  }, [failedRowIds, loadingRowIds, onLoadItemRows, selectedItems])

  const normalizedQuery = normalizeSearch(query)
  const suggestions = useMemo(() => {
    if (normalizedQuery.length === 0) return []
    return items
      .filter(item => {
        if (selectedIdSet.has(item.id)) return false
        const haystack = normalizeSearch(`${item.label} ${item.providerLabel} ${item.sourceLabel ?? ''}`)
        return haystack.includes(normalizedQuery)
      })
      .sort((a, b) => {
        const aLabel = normalizeSearch(a.label)
        const bLabel = normalizeSearch(b.label)
        const aStarts = aLabel.startsWith(normalizedQuery) ? 0 : 1
        const bStarts = bLabel.startsWith(normalizedQuery) ? 0 : 1
        return aStarts - bStarts || a.label.localeCompare(b.label, 'is') || a.providerLabel.localeCompare(b.providerLabel, 'is')
      })
      .slice(0, 10)
  }, [items, normalizedQuery, selectedIdSet])

  const showSuggestions = searchFocused && normalizedQuery.length > 0

  const compactCols = useMemo(
    () => buildWeatherChaseColumns(selectedItems, visibleHours, locale),
    [locale, selectedItems, visibleHours],
  )

  function clearSearchBlurTimer() {
    if (searchBlurTimerRef.current) {
      window.clearTimeout(searchBlurTimerRef.current)
      searchBlurTimerRef.current = null
    }
  }

  function addItem(id: string) {
    clearSearchBlurTimer()
    setSelectedIds(prev => (prev.includes(id) ? prev : [...prev, id]))
    setQuery('')
    setSearchFocused(true)
    window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 0)
  }

  function toggleVisibleHour(hour: WeatherChaseVisibleHour) {
    setVisibleHours(prev => {
      if (prev.includes(hour)) {
        const next = prev.filter(currentHour => currentHour !== hour)
        return next.length > 0 ? next : prev
      }
      return [...prev, hour].sort((a, b) => a - b)
    })
  }

  function updateCriteria(patch: Partial<WeatherChaseCriteria>) {
    const next = { ...activeCriteria, ...patch }
    if (onCriteriaChange) {
      onCriteriaChange(next)
    } else {
      setInternalCriteria(next)
    }
  }

  useEffect(() => {
    if (precipitationCriteriaValueRef.current === activeCriteria.maxPrecipitationMmPerHour) return
    precipitationCriteriaValueRef.current = activeCriteria.maxPrecipitationMmPerHour
    setPrecipitationDraft(criteriaInputValue(activeCriteria.maxPrecipitationMmPerHour))
  }, [activeCriteria.maxPrecipitationMmPerHour])

  useEffect(() => {
    if (temperatureCriteriaValueRef.current === activeCriteria.minTemperatureC) return
    temperatureCriteriaValueRef.current = activeCriteria.minTemperatureC
    setTemperatureDraft(criteriaInputValue(activeCriteria.minTemperatureC))
  }, [activeCriteria.minTemperatureC])

  useEffect(() => {
    if (windCriteriaValueRef.current === activeCriteria.maxWindMs) return
    windCriteriaValueRef.current = activeCriteria.maxWindMs
    setWindDraft(criteriaInputValue(activeCriteria.maxWindMs))
  }, [activeCriteria.maxWindMs])

  useEffect(() => {
    return () => clearSearchBlurTimer()
  }, [])

  function updatePrecipitationCriteriaFromText(value: string) {
    const parsed = criteriaNumber(value)
    precipitationCriteriaValueRef.current = parsed
    setPrecipitationDraft(value)
    updateCriteria({ maxPrecipitationMmPerHour: parsed })
  }

  function stepPrecipitationCriteria(delta: -1 | 1) {
    const current = activeCriteria.maxPrecipitationMmPerHour ?? 0
    const next = Math.max(0, Math.round((current + delta * 0.1) * 10) / 10)
    precipitationCriteriaValueRef.current = next
    setPrecipitationDraft(criteriaStepInputValue(next, locale))
    updateCriteria({ maxPrecipitationMmPerHour: next })
  }

  function updateTemperatureCriteriaFromText(value: string) {
    const parsed = criteriaNumber(value)
    temperatureCriteriaValueRef.current = parsed
    setTemperatureDraft(value)
    updateCriteria({ minTemperatureC: parsed })
  }

  function stepTemperatureCriteria(delta: -1 | 1) {
    const current = activeCriteria.minTemperatureC ?? 0
    const next = Math.round(current + delta)
    temperatureCriteriaValueRef.current = next
    setTemperatureDraft(criteriaStepInputValue(next, locale))
    updateCriteria({ minTemperatureC: next })
  }

  function updateWindCriteriaFromText(value: string) {
    const parsed = criteriaNumber(value)
    windCriteriaValueRef.current = parsed
    setWindDraft(value)
    updateCriteria({ maxWindMs: parsed })
  }

  function stepWindCriteria(delta: -1 | 1) {
    const current = activeCriteria.maxWindMs ?? 0
    const next = Math.max(0, Math.round(current + delta))
    windCriteriaValueRef.current = next
    setWindDraft(criteriaStepInputValue(next, locale))
    updateCriteria({ maxWindMs: next })
  }

  function handleSaveDefault() {
    onSaveDefault?.({
      selectedItems: selectedItems.map(preferenceItemFromWeatherChaseItem),
      criteria: activeCriteria,
    })
  }

  function removeItem(id: string) {
    setSelectedIds(prev => prev.filter(itemId => itemId !== id))
  }

  function moveItem(id: string, delta: -1 | 1) {
    setSelectedIds(prev => {
      const index = prev.indexOf(id)
      const nextIndex = index + delta
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const swap = next[nextIndex]
      next[nextIndex] = next[index]
      next[index] = swap
      return next
    })
  }

  function renderReorderList() {
    if (selectedItems.length === 0) return null
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{labels.reorderTitle}</p>
        <div className="divide-y divide-border/50 rounded-lg border border-border/70 bg-background/75">
          {selectedItems.map((item, index) => (
            <div key={item.id}>
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-foreground">{item.label}</span>
                  <ProviderBadge item={item} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(item.id, -1)}
                    disabled={index === 0}
                    aria-label={`${labels.moveUpLabel}: ${item.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveItem(item.id, 1)}
                    disabled={index === selectedItems.length - 1}
                    aria-label={`${labels.moveDownLabel}: ${item.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                  >↓</button>
                  {item.providerId === 'metno' && onShowNearbyStations && (
                    <button
                      type="button"
                      onClick={() => onShowNearbyStations(item)}
                      aria-label={`${labels.showNearbyStationsLabel}: ${item.label}`}
                      className={cn(
                        'h-7 rounded-full border px-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        nearbyStationItemId === item.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary',
                      )}
                    >{labels.showNearbyStationsLabel}</button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`${labels.removeLabel}: ${item.label}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-[12px] font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  >×</button>
                </div>
              </div>
              {nearbyStationItemId === item.id && nearbyStationItems.length > 0 && (
                <div className="border-t border-border/40 bg-muted/30 px-3 py-2 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">{labels.showNearbyStationsLabel}</p>
                  {nearbyStationItems.map(nearbyItem => (
                    <div key={nearbyItem.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{nearbyItem.label}</span>
                      <button
                        type="button"
                        onClick={() => addItem(nearbyItem.id)}
                        disabled={selectedIdSet.has(nearbyItem.id)}
                        className="shrink-0 h-6 rounded-full border border-border bg-background px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                      >{selectedIdSet.has(nearbyItem.id) ? '✓' : labels.addLabel}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderComparison(cols: WeatherChaseColumn[]) {
    if (selectedItems.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-border bg-background/70 px-3 py-4 text-sm text-muted-foreground">
          {labels.emptySelection}
        </p>
      )
    }
    if (cols.length === 0) {
      const isLoadingRows = selectedItems.some(item => loadingRowIds.has(item.id))
      return (
        <p className="rounded-lg border border-dashed border-border bg-background/70 px-3 py-4 text-sm text-muted-foreground">
          {isLoadingRows ? labels.loading : labels.noRowsLabel}
        </p>
      )
    }

    if (selectedItems.length <= 3) {
      return (
        <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-background/75">
          {cols.map(col => (
            <section key={col.targetIso} className="px-3 py-3">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                {col.dayLabel} · {col.timeLabel}
              </p>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${selectedItems.length}, minmax(0, 1fr))` }}>
                {selectedItems.map((item, index) => {
                  const row = col.rowsByItemId.get(item.id) ?? null
                  const peers = findPeers(selectedItems, col, item.id)
                  return (
                    <div key={item.id} className="min-w-0 space-y-1">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-foreground">{item.label}</p>
                        <ProviderBadge item={item} />
                      </div>
                      <MetricStack
                        row={row}
                        peerRows={peers}
                        thresholds={thresholds}
                        locale={locale}
                        criteria={activeCriteria}
                        labels={labels}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-border/70 bg-background/75">
        <div
          className="inline-grid min-w-full"
          style={{ gridTemplateColumns: `minmax(8.5rem, 9.75rem) repeat(${cols.length}, 4.85rem)` }}
        >
          <div className="sticky left-0 top-0 z-30 border-b border-r border-border/60 bg-background/95 p-2 text-[10px] font-semibold text-muted-foreground shadow-[4px_0_8px_rgba(15,23,42,0.06)]" />
          {cols.map(col => (
            <div key={col.targetIso} className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-2 py-2 text-[10px] text-muted-foreground">
              <div className="truncate font-semibold">{col.dayLabel}</div>
              <div className="text-muted-foreground/65">{col.timeLabel}</div>
            </div>
          ))}
          {selectedItems.map((item) => (
            <div key={item.id} className="contents">
              <div className="sticky left-0 z-10 min-w-0 border-r border-border/60 bg-background/95 p-2 shadow-[4px_0_8px_rgba(15,23,42,0.06)]">
                <p className="truncate text-[11px] font-semibold text-foreground">{item.label}</p>
                <div className="mt-1">
                  <ProviderBadge item={item} />
                </div>
                {loadingRowIds.has(item.id) && (
                  <p className="mt-1 text-[10px] text-muted-foreground">{labels.loading}</p>
                )}
              </div>
              {cols.map(col => {
                const row = col.rowsByItemId.get(item.id) ?? null
                const peers = findPeers(selectedItems, col, item.id)
                return (
                  <div key={`${item.id}:${col.targetIso}`} className="border-b border-border/40 px-2 py-2">
                    <MetricStack
                      row={row}
                      peerRows={peers}
                      thresholds={thresholds}
                      locale={locale}
                      criteria={activeCriteria}
                      labels={labels}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {loading ? (
          <p className="rounded-lg border border-border bg-background/80 px-3 py-3 text-sm text-muted-foreground">
            {labels.loading}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-border bg-background/80 px-3 py-3 text-sm text-muted-foreground">
            {labels.emptyData}
          </p>
        ) : null}

        {renderComparison(compactCols)}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{labels.visibleHoursLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {WEATHER_CHASE_VISIBLE_HOURS.map(hour => {
              const selected = visibleHours.includes(hour)
              const hourLabel = String(hour)
              return (
                <button
                  key={hour}
                  type="button"
                  onClick={() => toggleVisibleHour(hour)}
                  aria-pressed={selected}
                  aria-label={`${labels.visibleHourAriaLabel} ${hourLabel}`}
                  className={cn(
                    'min-h-8 min-w-8 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background/85 text-muted-foreground hover:border-primary/40 hover:text-primary',
                  )}
                >
                  {hourLabel}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(v => !v)}
          className="flex min-h-9 w-full items-center justify-between rounded-lg border border-border bg-background/80 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span>{labels.settingsLabel}</span>
          <span>{settingsOpen ? '▲' : '▼'}</span>
        </button>

        {settingsOpen && (
          <div className="flex flex-col gap-4">
            <div className="relative space-y-1">
              <label htmlFor="weather-chase-search" className="text-xs font-medium text-foreground">
                {labels.searchLabel}
              </label>
              <input
                ref={searchInputRef}
                id="weather-chase-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onFocus={() => {
                  clearSearchBlurTimer()
                  setSearchFocused(true)
                }}
                onBlur={() => {
                  clearSearchBlurTimer()
                  searchBlurTimerRef.current = window.setTimeout(() => {
                    setSearchFocused(false)
                    searchBlurTimerRef.current = null
                  }, 120)
                }}
                placeholder={labels.searchPlaceholder}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
              {showSuggestions && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg">
                  {suggestions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{labels.noSuggestions}</p>
                  ) : suggestions.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => addItem(item.id)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
                        {item.sourceLabel && (
                          <span className="block truncate text-[11px] text-muted-foreground">{item.sourceLabel}</span>
                        )}
                      </span>
                      <ProviderBadge item={item} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/60 bg-muted/20 p-1.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>{labels.minTemperatureLabel}</span>
                  <div className="flex min-h-10 items-center rounded-md border border-border bg-background focus-within:border-primary">
                    <button
                      type="button"
                      onClick={() => stepTemperatureCriteria(-1)}
                      aria-label={labels.decreaseTemperatureLabel}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-base text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={temperatureDraft}
                      onChange={event => updateTemperatureCriteriaFromText(event.target.value)}
                      className="h-10 min-w-0 flex-1 bg-transparent text-center text-base font-medium text-foreground outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => stepTemperatureCriteria(1)}
                      aria-label={labels.increaseTemperatureLabel}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-base text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      +
                    </button>
                    <span className="shrink-0 pr-2 text-xs text-muted-foreground">{labels.temperatureUnit}</span>
                  </div>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>{labels.maxWindLabel}</span>
                  <div className="flex min-h-10 items-center rounded-md border border-border bg-background focus-within:border-primary">
                    <button
                      type="button"
                      onClick={() => stepWindCriteria(-1)}
                      aria-label={labels.decreaseWindLabel}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-base text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={windDraft}
                      onChange={event => updateWindCriteriaFromText(event.target.value)}
                      className="h-10 min-w-0 flex-1 bg-transparent text-center text-base font-medium text-foreground outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => stepWindCriteria(1)}
                      aria-label={labels.increaseWindLabel}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-base text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      +
                    </button>
                    <span className="shrink-0 pr-2 text-xs text-muted-foreground">{labels.windUnit}</span>
                  </div>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>{labels.maxPrecipitationLabel}</span>
                  <div className="flex min-h-10 items-center rounded-md border border-border bg-background focus-within:border-primary">
                    <button
                      type="button"
                      onClick={() => stepPrecipitationCriteria(-1)}
                      aria-label={labels.decreasePrecipitationLabel}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-base text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={precipitationDraft}
                      onChange={event => updatePrecipitationCriteriaFromText(event.target.value)}
                      className="h-10 min-w-0 flex-1 bg-transparent text-center text-base font-medium text-foreground outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => stepPrecipitationCriteria(1)}
                      aria-label={labels.increasePrecipitationLabel}
                      className="flex h-10 w-10 shrink-0 items-center justify-center text-base text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      +
                    </button>
                    <span className="shrink-0 pr-2 text-xs text-muted-foreground">{labels.precipitationUnit}</span>
                  </div>
                </label>
              </div>
              {onSaveDefault && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDefault}
                    disabled={saveStatus === 'saving' || selectedItems.length === 0}
                    className="min-h-10 rounded-full border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {saveStatus === 'saving' ? labels.savingDefaultsLabel : labels.saveDefaultsLabel}
                  </button>
                  {saveStatus === 'saved' && (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">{labels.savedDefaultsLabel}</span>
                  )}
                  {saveStatus === 'local' && (
                    <span className="text-xs text-amber-700 dark:text-amber-400">{labels.savedLocalDefaultsLabel}</span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="text-xs text-destructive">{labels.saveDefaultsFailedLabel}</span>
                  )}
                </div>
              )}
            </div>

            {renderReorderList()}
          </div>
        )}
      </section>
    </>
  )
}
