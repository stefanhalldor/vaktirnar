/**
 * Provider-neutral weather pulse target model.
 *
 * "Pulse" (Veðurpúls) is the product branding for reusable Teskeid chat
 * scoped to weather station targets. This module keeps the target identity
 * contract provider-neutral so Veðurstofan and Vegagerðin can share the
 * same chat repository, feed loader, and UI patterns.
 *
 * href helpers are centralised here so no UI component hand-builds
 * provider-specific URLs in multiple places.
 */

import type { ChatTargetType } from '@/lib/chat/types'

// ── Provider types ─────────────────────────────────────────────────────────────

export type WeatherPulseProvider = 'vedurstofan' | 'vegagerdin'

/** The chat target_type value for each weather pulse provider. */
export type WeatherPulseTargetType = Extract<
  ChatTargetType,
  'vedurstofan_station' | 'vegagerdin_station'
>

// ── Target model ───────────────────────────────────────────────────────────────

/**
 * Provider-neutral weather pulse target.
 * Carries the stable identity of a station target for chat, feed, and navigation.
 * Maps 1:1 to a teskeid_chat_threads row via (domain='weather', targetType, targetId).
 */
export interface WeatherPulseTarget {
  provider: WeatherPulseProvider
  targetType: WeatherPulseTargetType
  targetId: string
  targetName: string
  lat?: number | null
  lon?: number | null
}

// ── Adapter helpers ────────────────────────────────────────────────────────────

/**
 * Builds a WeatherPulseTarget for a Veðurstofan Íslands station.
 * stationId must be a non-empty numeric string from the station registry.
 */
export function vedurstofanStationTarget(
  stationId: string,
  stationName: string,
  opts?: { lat?: number | null; lon?: number | null }
): WeatherPulseTarget {
  return {
    provider: 'vedurstofan',
    targetType: 'vedurstofan_station',
    targetId: stationId,
    targetName: stationName,
    lat: opts?.lat ?? null,
    lon: opts?.lon ?? null,
  }
}

/**
 * Builds a WeatherPulseTarget for a Vegagerðin current-measurement station.
 *
 * NOTE: Vegagerðin write-side chat requires SQL migration 81
 * (sql/81_teskeid_chat_target_type_vegagerdin_station.sql) to be run before
 * threads or messages can be created for this target type.
 * This adapter is intentionally read-only until that migration is applied.
 */
export function vegagerdinStationTarget(
  stationId: string,
  stationName: string,
  opts?: { lat?: number | null; lon?: number | null }
): WeatherPulseTarget {
  return {
    provider: 'vegagerdin',
    targetType: 'vegagerdin_station',
    targetId: stationId,
    targetName: stationName,
    lat: opts?.lat ?? null,
    lon: opts?.lon ?? null,
  }
}

// ── href / returnTo helpers ────────────────────────────────────────────────────

/**
 * Builds the full pulse station page href for a Veðurstofan station.
 * Route: /auth-mvp/vedrid/puls/stod/[stationId]
 *
 * If returnTo is provided it is appended as a query param so the pulse page
 * can render a "Til baka" link back to the caller's context.
 */
export function vedurstofanPulseHref(stationId: string, returnTo?: string): string {
  const base = `/auth-mvp/vedrid/puls/stod/${stationId}`
  if (returnTo) return `${base}?returnTo=${encodeURIComponent(returnTo)}`
  return base
}

/**
 * Builds the full pulse station page href for a Vegagerðin station.
 * Route: /auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]
 *
 * If returnTo is provided it is appended as a query param so the pulse page
 * can render a "Til baka" link back to the caller's context.
 */
export function vegagerdinPulseHref(stationId: string, returnTo?: string): string {
  const base = `/auth-mvp/vedrid/puls/vegagerdin/stod/${stationId}`
  if (returnTo) return `${base}?returnTo=${encodeURIComponent(returnTo)}`
  return base
}

/**
 * Builds the pulse href for a provider-neutral weather target.
 *
 * - Veðurstofan: /auth-mvp/vedrid/puls/stod/[stationId]
 * - Vegagerðin: /auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]
 */
export function weatherPulseTargetHref(
  target: Pick<WeatherPulseTarget, 'provider' | 'targetId'>,
  returnTo?: string
): string {
  if (target.provider === 'vedurstofan') return vedurstofanPulseHref(target.targetId, returnTo)
  if (target.provider === 'vegagerdin') return vegagerdinPulseHref(target.targetId, returnTo)
  // Fallback: unknown provider — should not occur in production
  return '#'
}
