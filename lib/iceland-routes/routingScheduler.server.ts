import 'server-only'

import { after } from 'next/server'
import type { LatLon } from './types'
import type { IcelandRoutingVehicleProfile } from './routingProvider'
import { isTeskeidRoutingShadowEnabled, runIcelandRoutingShadow } from './routingShadow.server'
import { TeskeidRoutingProvider } from './teskeidRoutingProvider.server'

/**
 * Maps a trailerKind string from the travel request body to a routing vehicle profile.
 *
 * Only 'caravan' is mapped to 'caravan'; everything else (including 'none', unknown
 * values, or undefined) falls back to 'car'. This is intentionally conservative —
 * horse trailers, tent trailers, and generic trailers use the same road network as cars.
 */
export function trailerKindToVehicleProfile(
  trailerKind: string | null | undefined,
): IcelandRoutingVehicleProfile {
  if (trailerKind === 'caravan') return 'caravan'
  return 'car'
}

export interface ScheduleShadowRunOptions {
  origin: LatLon
  destination: LatLon
  /** Value of trailerKind from the travel request body; null/undefined → 'car'. */
  trailerKind?: string | null
}

/**
 * Schedules a Teskeid shadow run via Next.js after(), which extends the serverless
 * invocation lifetime until the promise settles — unlike a bare void promise, which
 * may be abandoned when the response is flushed.
 *
 * The flag is checked before any provider or request object is constructed.
 * When the flag is off this function is a no-op and after() is never called.
 */
export function scheduleTeskeidShadowRun(options: ScheduleShadowRunOptions): void {
  if (!isTeskeidRoutingShadowEnabled()) return

  const { origin, destination, trailerKind } = options
  const vehicleProfile = trailerKindToVehicleProfile(trailerKind)

  after(() =>
    runIcelandRoutingShadow({
      provider: new TeskeidRoutingProvider(),
      request: {
        origin: { point: origin },
        destination: { point: destination },
        vehicleProfile,
      },
      onOutcome: (outcome) => {
        if (outcome.status === 'disabled') return
        // Privacy-safe diagnostic — no coordinates, labels, addresses, place IDs,
        // raw error messages, or geometry. errorCode is allowlisted to the stable
        // provider error codes defined in teskeidRoutingProvider.server.ts.
        const summary =
          outcome.status === 'completed'
            ? {
                status: 'completed' as const,
                provider: outcome.result.provider,
                routeFamilyId: outcome.result.paths[0]?.routeFamilyId ?? null,
                resultKind: outcome.result.paths[0]?.resultKind ?? null,
                durationMs: outcome.durationMs,
              }
            : {
                status: 'failed' as const,
                errorCode:
                  outcome.error instanceof Error ? outcome.error.message : 'unknown_error',
                durationMs: outcome.durationMs,
              }
        console.info('[teskeid-shadow]', JSON.stringify(summary))
      },
    }),
  )
}
