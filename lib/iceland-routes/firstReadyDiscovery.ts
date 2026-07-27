import type {
  FirstReadyCoordinatorEvent,
  FirstReadyRunId,
  NonEmptyRoutes,
} from './firstReadyCoordinator'

export type FirstReadyDiscoveryResult<TRoute> =
  | {
      readonly status: 'ready'
      readonly routes: NonEmptyRoutes<TRoute>
      readonly preferredRoute?: TRoute
    }
  | {
      readonly status: 'no_route'
    }
  | {
      readonly status: 'failed'
      readonly reason?: string
    }

export type FirstReadyDiscovery<TProvider extends string, TRoute> = {
  readonly provider: TProvider
  readonly discover: () =>
    | FirstReadyDiscoveryResult<TRoute>
    | PromiseLike<FirstReadyDiscoveryResult<TRoute>>
}

export type FirstReadyDiscoveryHandle<TProvider extends string, TRoute> = {
  readonly provider: TProvider
  /** Resolves after the provider's terminal event has been delivered. */
  readonly promise: Promise<FirstReadyCoordinatorEvent<TProvider, TRoute>>
}

export type FirstReadyDiscoveryLaunch<TProvider extends string, TRoute> = {
  readonly handles: readonly FirstReadyDiscoveryHandle<TProvider, TRoute>[]
  /**
   * Already observes every handle, so callers may safely fire-and-forget the
   * launch or await all provider callbacks without creating unhandled rejects.
   */
  readonly allSettled: Promise<
    readonly PromiseSettledResult<FirstReadyCoordinatorEvent<TProvider, TRoute>>[]
  >
}

function errorReason(error: unknown): string | undefined {
  if (error instanceof Error) return error.message || undefined
  return typeof error === 'string' && error.length > 0 ? error : undefined
}

function resultToEvent<TProvider extends string, TRoute>(
  runId: FirstReadyRunId,
  provider: TProvider,
  result: FirstReadyDiscoveryResult<TRoute>,
): FirstReadyCoordinatorEvent<TProvider, TRoute> {
  if (result.status === 'ready') {
    return {
      type: 'provider_ready',
      runId,
      provider,
      routes: result.routes,
      ...(result.preferredRoute !== undefined
        ? { preferredRoute: result.preferredRoute }
        : {}),
    }
  }

  if (result.status === 'no_route') {
    return {
      type: 'provider_no_route',
      runId,
      provider,
    }
  }

  return {
    type: 'provider_failed',
    runId,
    provider,
    reason: result.reason,
  }
}

/**
 * Starts every provider before observing any provider result. This preserves a
 * genuine first-ready race even when a discover function resolves immediately.
 */
export function launchFirstReadyDiscovery<TProvider extends string, TRoute>(
  runId: FirstReadyRunId,
  discoveries: readonly FirstReadyDiscovery<TProvider, TRoute>[],
  onEvent: (event: FirstReadyCoordinatorEvent<TProvider, TRoute>) => void,
): FirstReadyDiscoveryLaunch<TProvider, TRoute> {
  // This first pass is deliberately synchronous. Do not attach result handlers
  // until every provider has been invoked.
  const started = discoveries.map(({ provider, discover }) => {
    let promise: Promise<FirstReadyDiscoveryResult<TRoute>>

    try {
      promise = Promise.resolve(discover())
    } catch (error) {
      promise = Promise.reject(error)
    }

    return { provider, promise }
  })

  const handles = started.map(({ provider, promise }) => {
    const eventPromise = promise.then(
      (result) => {
        const event = resultToEvent(runId, provider, result)
        onEvent(event)
        return event
      },
      (error: unknown) => {
        const event: FirstReadyCoordinatorEvent<TProvider, TRoute> = {
          type: 'provider_failed',
          runId,
          provider,
          reason: errorReason(error),
        }
        onEvent(event)
        return event
      },
    )

    return {
      provider,
      promise: eventPromise,
    }
  })

  return {
    handles,
    allSettled: Promise.allSettled(handles.map(({ promise }) => promise)),
  }
}
