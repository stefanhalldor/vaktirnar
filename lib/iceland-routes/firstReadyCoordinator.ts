/**
 * Provider-neutral state machine for progressively resolving route providers.
 *
 * A `provider_ready` event means the routes have already passed the provider's
 * own validity checks. The coordinator deliberately knows nothing about route
 * shape, auth, networking, or rendering.
 */

export type FirstReadyRunId = string | number

export type NonEmptyRoutes<TRoute> = readonly [TRoute, ...TRoute[]]

export type FirstReadyProviderState<TRoute> =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly routes: NonEmptyRoutes<TRoute> }
  | { readonly status: 'failed'; readonly reason?: string }
  | { readonly status: 'no_route' }

export type FirstReadySelection<TProvider extends string, TRoute> = {
  readonly source: 'first_ready' | 'manual'
  readonly provider: TProvider
  readonly route: TRoute
}

export type FirstReadyCoordinatorState<TProvider extends string, TRoute> = {
  readonly runId: FirstReadyRunId
  readonly providerOrder: readonly TProvider[]
  readonly providers: Readonly<Record<TProvider, FirstReadyProviderState<TRoute>>>
  readonly status: 'pending' | 'ready' | 'failed'
  /** The provider that first produced at least one valid route. */
  readonly winner: TProvider | null
  /** Automatic first route, or the latest explicit user selection. */
  readonly selection: FirstReadySelection<TProvider, TRoute> | null
}

export type FirstReadyCoordinatorEvent<TProvider extends string, TRoute> =
  | {
      readonly type: 'provider_ready'
      readonly runId: FirstReadyRunId
      readonly provider: TProvider
      readonly routes: NonEmptyRoutes<TRoute>
      /** Route to apply first; defaults to routes[0] when omitted. */
      readonly preferredRoute?: TRoute
    }
  | {
      readonly type: 'provider_failed'
      readonly runId: FirstReadyRunId
      readonly provider: TProvider
      readonly reason?: string
    }
  | {
      readonly type: 'provider_no_route'
      readonly runId: FirstReadyRunId
      readonly provider: TProvider
    }
  | {
      readonly type: 'manual_select'
      readonly runId: FirstReadyRunId
      readonly provider: TProvider
      readonly route: TRoute
    }

const PENDING_PROVIDER_STATE = { status: 'pending' } as const

export function createFirstReadyCoordinator<TProvider extends string, TRoute>(
  runId: FirstReadyRunId,
  providers: readonly TProvider[],
): FirstReadyCoordinatorState<TProvider, TRoute> {
  if (providers.length === 0) {
    throw new Error('first_ready_requires_provider')
  }

  const providerStates = {} as Record<TProvider, FirstReadyProviderState<TRoute>>
  const providerOrder: TProvider[] = []

  for (const provider of providers) {
    if (Object.prototype.hasOwnProperty.call(providerStates, provider)) {
      throw new Error('first_ready_duplicate_provider')
    }
    providerStates[provider] = PENDING_PROVIDER_STATE
    providerOrder.push(provider)
  }

  return {
    runId,
    providerOrder,
    providers: providerStates,
    status: 'pending',
    winner: null,
    selection: null,
  }
}

function hasProvider<TProvider extends string, TRoute>(
  state: FirstReadyCoordinatorState<TProvider, TRoute>,
  provider: TProvider,
): boolean {
  return Object.prototype.hasOwnProperty.call(state.providers, provider)
}

function deriveStatus<TProvider extends string, TRoute>(
  providerOrder: readonly TProvider[],
  providers: Readonly<Record<TProvider, FirstReadyProviderState<TRoute>>>,
): FirstReadyCoordinatorState<TProvider, TRoute>['status'] {
  const states = providerOrder.map((provider) => providers[provider])
  if (states.some((provider) => provider.status === 'ready')) return 'ready'
  if (states.every((provider) => provider.status !== 'pending')) return 'failed'
  return 'pending'
}

export function reduceFirstReadyCoordinator<TProvider extends string, TRoute>(
  state: FirstReadyCoordinatorState<TProvider, TRoute>,
  event: FirstReadyCoordinatorEvent<TProvider, TRoute>,
): FirstReadyCoordinatorState<TProvider, TRoute> {
  // Async work from an older search must never mutate the current run.
  if (event.runId !== state.runId || !hasProvider(state, event.provider)) {
    return state
  }

  if (event.type === 'manual_select') {
    if (state.providers[event.provider].status !== 'ready') return state

    return {
      ...state,
      selection: {
        source: 'manual',
        provider: event.provider,
        route: event.route,
      },
    }
  }

  // Each provider has one terminal result per run. Duplicate/retry events for
  // that provider are ignored so races cannot rewrite a settled result.
  if (state.providers[event.provider].status !== 'pending') return state

  let providerState: FirstReadyProviderState<TRoute>
  if (event.type === 'provider_ready') {
    providerState = { status: 'ready', routes: [...event.routes] as NonEmptyRoutes<TRoute> }
  } else if (event.type === 'provider_failed') {
    providerState = { status: 'failed', reason: event.reason }
  } else {
    providerState = { status: 'no_route' }
  }

  const nextProviders = {
    ...state.providers,
    [event.provider]: providerState,
  }

  const isFirstReady = event.type === 'provider_ready' && state.winner === null
  const winner = isFirstReady ? event.provider : state.winner
  const preferredRoute = event.type === 'provider_ready'
    && event.preferredRoute !== undefined
    && event.routes.includes(event.preferredRoute)
    ? event.preferredRoute
    : event.type === 'provider_ready'
      ? event.routes[0]
      : null
  const selection = isFirstReady && state.selection?.source !== 'manual'
    ? {
        source: 'first_ready' as const,
        provider: event.provider,
        route: preferredRoute!,
      }
    : state.selection

  return {
    ...state,
    providers: nextProviders,
    status: deriveStatus(state.providerOrder, nextProviders),
    winner,
    selection,
  }
}
