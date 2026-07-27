import { describe, expect, it } from 'vitest'
import {
  launchFirstReadyDiscovery,
  type FirstReadyDiscoveryResult,
} from '@/lib/iceland-routes/firstReadyDiscovery'
import type { FirstReadyCoordinatorEvent } from '@/lib/iceland-routes/firstReadyCoordinator'

type Provider = 'google' | 'teskeid'
type Route = { id: string }

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

const ready = (id: string): FirstReadyDiscoveryResult<Route> => ({
  status: 'ready',
  routes: [{ id }],
})

describe('first-ready discovery launcher', () => {
  it('starts every provider synchronously and emits Teskeid first when it resolves first', async () => {
    const google = deferred<FirstReadyDiscoveryResult<Route>>()
    const teskeid = deferred<FirstReadyDiscoveryResult<Route>>()
    const started: Provider[] = []
    const events: FirstReadyCoordinatorEvent<Provider, Route>[] = []

    const launch = launchFirstReadyDiscovery<Provider, Route>(
      'run-teskeid-first',
      [
        {
          provider: 'google',
          discover: () => {
            started.push('google')
            return google.promise
          },
        },
        {
          provider: 'teskeid',
          discover: () => {
            started.push('teskeid')
            return teskeid.promise
          },
        },
      ],
      (event) => events.push(event),
    )

    expect(started).toEqual(['google', 'teskeid'])
    expect(events).toEqual([])

    teskeid.resolve(ready('teskeid-1'))
    await launch.handles[1].promise
    google.resolve(ready('google-1'))
    await launch.allSettled

    expect(events.map((event) => [event.type, event.provider])).toEqual([
      ['provider_ready', 'teskeid'],
      ['provider_ready', 'google'],
    ])
  })

  it('emits Google first when Google resolves first', async () => {
    const google = deferred<FirstReadyDiscoveryResult<Route>>()
    const teskeid = deferred<FirstReadyDiscoveryResult<Route>>()
    const events: FirstReadyCoordinatorEvent<Provider, Route>[] = []
    const launch = launchFirstReadyDiscovery<Provider, Route>(
      2,
      [
        { provider: 'google', discover: () => google.promise },
        { provider: 'teskeid', discover: () => teskeid.promise },
      ],
      (event) => events.push(event),
    )

    google.resolve(ready('google-1'))
    await launch.handles[0].promise
    teskeid.resolve(ready('teskeid-1'))
    await launch.allSettled

    expect(events.map((event) => event.provider)).toEqual(['google', 'teskeid'])
    expect(events.every((event) => event.type === 'provider_ready')).toBe(true)
  })

  it('emits an explicit provider failure while the other provider can still win', async () => {
    const google = deferred<FirstReadyDiscoveryResult<Route>>()
    const teskeid = deferred<FirstReadyDiscoveryResult<Route>>()
    const events: FirstReadyCoordinatorEvent<Provider, Route>[] = []
    const launch = launchFirstReadyDiscovery<Provider, Route>(
      'run-provider-failure',
      [
        { provider: 'google', discover: () => google.promise },
        { provider: 'teskeid', discover: () => teskeid.promise },
      ],
      (event) => events.push(event),
    )

    google.resolve({ status: 'failed', reason: 'google_unavailable' })
    await launch.handles[0].promise
    teskeid.resolve(ready('teskeid-1'))
    const settled = await launch.allSettled

    expect(events).toEqual([
      {
        type: 'provider_failed',
        runId: 'run-provider-failure',
        provider: 'google',
        reason: 'google_unavailable',
      },
      {
        type: 'provider_ready',
        runId: 'run-provider-failure',
        provider: 'teskeid',
        routes: [{ id: 'teskeid-1' }],
      },
    ])
    expect(settled.every((result) => result.status === 'fulfilled')).toBe(true)
  })

  it('turns a rejected discover promise into provider_failed', async () => {
    const google = deferred<FirstReadyDiscoveryResult<Route>>()
    const events: FirstReadyCoordinatorEvent<'google', Route>[] = []
    const launch = launchFirstReadyDiscovery<'google', Route>(
      'run-rejection',
      [{ provider: 'google', discover: () => google.promise }],
      (event) => events.push(event),
    )

    google.reject(new Error('google_timeout'))
    await launch.allSettled

    expect(events).toEqual([
      {
        type: 'provider_failed',
        runId: 'run-rejection',
        provider: 'google',
        reason: 'google_timeout',
      },
    ])
  })

  it('turns a synchronous throw into provider_failed without preventing later providers from starting', async () => {
    const started: Provider[] = []
    const events: FirstReadyCoordinatorEvent<Provider, Route>[] = []

    const launch = launchFirstReadyDiscovery<Provider, Route>(
      4,
      [
        {
          provider: 'google',
          discover: () => {
            started.push('google')
            throw new Error('google_sync_failure')
          },
        },
        {
          provider: 'teskeid',
          discover: () => {
            started.push('teskeid')
            return { status: 'no_route' }
          },
        },
      ],
      (event) => events.push(event),
    )

    expect(started).toEqual(['google', 'teskeid'])
    expect(events).toEqual([])

    await launch.allSettled

    expect(events).toEqual([
      {
        type: 'provider_failed',
        runId: 4,
        provider: 'google',
        reason: 'google_sync_failure',
      },
      {
        type: 'provider_no_route',
        runId: 4,
        provider: 'teskeid',
      },
    ])
  })
})
