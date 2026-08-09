export const MAP_NOTE_BODY_MAX = 500
export const MAP_NOTE_SEARCH_MAX = 80
export const MAP_NOTE_DEFAULT_HOURS = 72
export const MAP_NOTE_MAX_HOURS = 24 * 30

export type MapNoteKind = 'community' | 'teskeid_feedback'
export type MapNoteSourceContext = 'map' | 'route_choice' | 'free_drive'
export type MapNoteLocationMode = 'anchored' | 'general'

export interface MapNoteAnchor {
  lat: number
  lon: number
  label?: string
}

export interface MapRouteFeedbackContext {
  from: string
  to: string
  routeId: string | null
  provider: 'google' | 'teskeid' | 'unknown'
  distanceKm: number | null
  durationMinutes: number | null
}

export interface MapNoteDto {
  id: string
  body: string
  createdAt: string
  latestAt: string
  authorName: string | null
  anchor: MapNoteAnchor | null
  locationMode: MapNoteLocationMode
  sourceContext: MapNoteSourceContext
}

export interface PrivateTeskeidFeedbackDto extends MapNoteDto {
  routeContext: MapRouteFeedbackContext | null
}

export interface CreateMapNoteInput {
  kind: MapNoteKind
  body: string
  anchor: MapNoteAnchor | null
  locationMode: MapNoteLocationMode
  sourceContext: MapNoteSourceContext
  routeContext: MapRouteFeedbackContext | null
  clientMessageId: string
  idempotencyKey: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function finiteBounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned.length > 0 && cleaned.length <= max ? cleaned : null
}

export function parseMapNoteAnchor(value: unknown): MapNoteAnchor | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (!finiteBounded(row.lat, 63, 67) || !finiteBounded(row.lon, -25, -12)) return null
  const label = cleanLabel(row.label, 120)
  return { lat: row.lat, lon: row.lon, ...(label ? { label } : {}) }
}

export function parseRouteFeedbackContext(value: unknown): MapRouteFeedbackContext | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const from = cleanLabel(row.from, 120)
  const to = cleanLabel(row.to, 120)
  if (!from || !to) return null
  const provider = row.provider === 'google' || row.provider === 'teskeid' ? row.provider : 'unknown'
  const routeId = row.routeId === null ? null : cleanLabel(row.routeId, 200)
  const distanceKm = row.distanceKm === null
    ? null
    : finiteBounded(row.distanceKm, 0, 3_000) ? row.distanceKm : null
  const durationMinutes = row.durationMinutes === null
    ? null
    : finiteBounded(row.durationMinutes, 0, 10_000) ? row.durationMinutes : null
  return { from, to, routeId, provider, distanceKm, durationMinutes }
}

export function parseCreateMapNoteInput(value: unknown): CreateMapNoteInput | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (row.kind !== 'community' && row.kind !== 'teskeid_feedback') return null
  const body = cleanLabel(row.body, MAP_NOTE_BODY_MAX)
  if (!body || !UUID_RE.test(String(row.clientMessageId)) || !UUID_RE.test(String(row.idempotencyKey))) return null
  const anchor = row.anchor === null ? null : parseMapNoteAnchor(row.anchor)
  if (row.anchor !== null && !anchor) return null
  const locationMode: MapNoteLocationMode = row.locationMode === 'general' ? 'general' : 'anchored'
  if (row.kind === 'community' && locationMode === 'anchored' && !anchor) return null
  const sourceContext: MapNoteSourceContext =
    row.sourceContext === 'route_choice' || row.sourceContext === 'free_drive'
      ? row.sourceContext
      : 'map'
  const routeContext = row.routeContext === null ? null : parseRouteFeedbackContext(row.routeContext)
  if (row.routeContext !== null && !routeContext) return null
  if (row.kind === 'community' && routeContext) return null
  return {
    kind: row.kind,
    body,
    anchor: row.kind === 'community' && locationMode === 'general' ? null : anchor,
    locationMode,
    sourceContext,
    routeContext,
    clientMessageId: String(row.clientMessageId),
    idempotencyKey: String(row.idempotencyKey),
  }
}

export function sanitizeMapNoteSearch(value: string | null): string {
  return (value ?? '').trim().slice(0, MAP_NOTE_SEARCH_MAX)
}

export function parseMapNoteHours(value: string | null): number | null {
  if (value === 'all') return null
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 10 / 60), MAP_NOTE_MAX_HOURS)
    : MAP_NOTE_DEFAULT_HOURS
}
