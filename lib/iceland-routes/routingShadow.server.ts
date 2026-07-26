import 'server-only'

import type {
  IcelandRoutingProvider,
  IcelandRoutingRequest,
  IcelandRoutingResult,
} from './routingProvider'

export const TESKEID_ROUTING_SHADOW_FLAG = 'TESKEID_ROUTING_SHADOW_ENABLED'

export function isTeskeidRoutingShadowEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[TESKEID_ROUTING_SHADOW_FLAG] === 'true'
}

export type IcelandRoutingShadowOutcome =
  | { status: 'disabled' }
  | { status: 'completed'; result: IcelandRoutingResult; durationMs: number }
  | { status: 'failed'; error: unknown; durationMs: number }

export interface RunIcelandRoutingShadowOptions {
  provider: IcelandRoutingProvider
  request: IcelandRoutingRequest
  enabled?: boolean
  onOutcome?: (outcome: IcelandRoutingShadowOutcome) => void
}

/**
 * Calls the outcome callback exactly once, swallowing any errors it throws.
 * Callback errors must never reclassify a completed outcome as failed or vice versa.
 */
function safeCallback(
  onOutcome: ((outcome: IcelandRoutingShadowOutcome) => void) | undefined,
  outcome: IcelandRoutingShadowOutcome,
): void {
  try {
    onOutcome?.(outcome)
  } catch {
    // Intentionally ignored — callback errors cannot affect shadow runner outcome.
  }
}

/**
 * Runs Teskeid routing out of band from the primary provider result.
 *
 * The caller must never await this function in the primary response path. The
 * helper absorbs provider failures into a typed outcome so experimental routing
 * cannot change, delay, or fail the current Google-backed user experience.
 */
export async function runIcelandRoutingShadow({
  provider,
  request,
  enabled = isTeskeidRoutingShadowEnabled(),
  onOutcome,
}: RunIcelandRoutingShadowOptions): Promise<IcelandRoutingShadowOutcome> {
  if (!enabled) {
    const outcome = { status: 'disabled' } as const
    safeCallback(onOutcome, outcome)
    return outcome
  }

  const startMs = Date.now()
  try {
    const result = await provider.calculateRoutes(request)
    const outcome = { status: 'completed', result, durationMs: Date.now() - startMs } as const
    safeCallback(onOutcome, outcome)
    return outcome
  } catch (error) {
    const outcome = { status: 'failed', error, durationMs: Date.now() - startMs } as const
    safeCallback(onOutcome, outcome)
    return outcome
  }
}
