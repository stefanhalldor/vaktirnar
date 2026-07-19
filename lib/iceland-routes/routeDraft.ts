/**
 * Overview route draft — a short-lived sessionStorage contract between
 * the /vedrid overview screen and /ferdalagid (trip weather).
 *
 * When a user selects Frá and Til on /vedrid, we write the full place
 * data to sessionStorage. When /ferdalagid mounts, it reads and consumes
 * the draft to pre-fill origin and destination before loading route options.
 *
 * Privacy: place data is tab-scoped (sessionStorage) and expires after 5 minutes.
 * Coordinates and place IDs are not written to URL params.
 */

const DRAFT_KEY = 'vaktirnar:overview-route-draft'
const DRAFT_SCHEMA_VERSION = 1
const DRAFT_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Minimal place representation stored in the draft. Structurally identical to PlaceResult. */
export interface RouteDraftPlace {
  name: string
  formattedAddress: string
  lat: number
  lon: number
  placeId?: string
}

export interface OverviewRouteDraft {
  from: RouteDraftPlace
  to: RouteDraftPlace
  savedAtIso: string
}

export function writeOverviewRouteDraft(from: RouteDraftPlace, to: RouteDraftPlace): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        schemaVersion: DRAFT_SCHEMA_VERSION,
        from,
        to,
        savedAtIso: new Date().toISOString(),
      }),
    )
  } catch {
    // sessionStorage may be blocked (private browsing, quota exceeded) — ignore
  }
}

export function readOverviewRouteDraft(): OverviewRouteDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Record<string, unknown>
    if (d.schemaVersion !== DRAFT_SCHEMA_VERSION) return null
    if (typeof d.savedAtIso !== 'string') return null
    const age = Date.now() - Date.parse(d.savedAtIso)
    if (!Number.isFinite(age) || age > DRAFT_TTL_MS) return null
    const from = d.from as Record<string, unknown>
    const to = d.to as Record<string, unknown>
    if (!from || typeof from.name !== 'string' || typeof from.lat !== 'number' || typeof from.lon !== 'number') return null
    if (!to || typeof to.name !== 'string' || typeof to.lat !== 'number' || typeof to.lon !== 'number') return null
    return {
      from: {
        name: from.name,
        formattedAddress: typeof from.formattedAddress === 'string' ? from.formattedAddress : '',
        lat: from.lat,
        lon: from.lon,
        placeId: typeof from.placeId === 'string' ? from.placeId : undefined,
      },
      to: {
        name: to.name,
        formattedAddress: typeof to.formattedAddress === 'string' ? to.formattedAddress : '',
        lat: to.lat,
        lon: to.lon,
        placeId: typeof to.placeId === 'string' ? to.placeId : undefined,
      },
      savedAtIso: d.savedAtIso,
    }
  } catch {
    return null
  }
}

export function clearOverviewRouteDraft(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {}
}
