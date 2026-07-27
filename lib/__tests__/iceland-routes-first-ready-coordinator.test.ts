import { describe, expect, it } from 'vitest'
import {
  createFirstReadyCoordinator,
  reduceFirstReadyCoordinator,
} from '@/lib/iceland-routes/firstReadyCoordinator'

type Provider = 'google' | 'teskeid'

type Route = {
  id: string
}

const providers = ['google', 'teskeid'] as const
const route = (id: string): Route => ({ id })

describe('first-ready route coordinator', () => {
  it('starts every provider as pending', () => {
    const state = createFirstReadyCoordinator<Provider, Route>(1, providers)

    expect(state).toMatchObject({
      runId: 1,
      status: 'pending',
      winner: null,
      selection: null,
      providers: {
        google: { status: 'pending' },
        teskeid: { status: 'pending' },
      },
    })
  })

  it('locks the first provider with a valid route as winner', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>(1, providers)
    const teskeidRoute = route('teskeid-1')

    const state = reduceFirstReadyCoordinator(initial, {
      type: 'provider_ready',
      runId: 1,
      provider: 'teskeid',
      routes: [teskeidRoute],
    })

    expect(state.status).toBe('ready')
    expect(state.winner).toBe('teskeid')
    expect(state.selection).toEqual({
      source: 'first_ready',
      provider: 'teskeid',
      route: teskeidRoute,
    })
  })

  it('can apply the provider default without changing display order', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>(1, providers)
    const fasterAlternative = route('google-fast-alternative')
    const providerDefault = route('google-default')

    const state = reduceFirstReadyCoordinator(initial, {
      type: 'provider_ready',
      runId: 1,
      provider: 'google',
      routes: [fasterAlternative, providerDefault],
      preferredRoute: providerDefault,
    })

    expect(state.providers.google).toEqual({
      status: 'ready',
      routes: [fasterAlternative, providerDefault],
    })
    expect(state.selection?.route).toBe(providerDefault)
  })

  it('merges a late ready result without changing the winner or automatic selection', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>('run-a', providers)
    const googleRoute = route('google-1')
    const teskeidRoute = route('teskeid-1')
    const afterGoogle = reduceFirstReadyCoordinator(initial, {
      type: 'provider_ready',
      runId: 'run-a',
      provider: 'google',
      routes: [googleRoute],
    })

    const state = reduceFirstReadyCoordinator(afterGoogle, {
      type: 'provider_ready',
      runId: 'run-a',
      provider: 'teskeid',
      routes: [teskeidRoute],
    })

    expect(state.providers.teskeid).toEqual({ status: 'ready', routes: [teskeidRoute] })
    expect(state.winner).toBe('google')
    expect(state.selection).toEqual({
      source: 'first_ready',
      provider: 'google',
      route: googleRoute,
    })
  })

  it('keeps waiting after one provider fails and lets the other provider win', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>(1, providers)
    const afterFailure = reduceFirstReadyCoordinator(initial, {
      type: 'provider_failed',
      runId: 1,
      provider: 'google',
      reason: 'upstream_timeout',
    })

    expect(afterFailure.status).toBe('pending')
    expect(afterFailure.winner).toBeNull()

    const teskeidRoute = route('teskeid-1')
    const state = reduceFirstReadyCoordinator(afterFailure, {
      type: 'provider_ready',
      runId: 1,
      provider: 'teskeid',
      routes: [teskeidRoute],
    })

    expect(state.status).toBe('ready')
    expect(state.winner).toBe('teskeid')
  })

  it('treats no-route as terminal but waits while another provider is pending', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>(1, providers)
    const state = reduceFirstReadyCoordinator(initial, {
      type: 'provider_no_route',
      runId: 1,
      provider: 'teskeid',
    })

    expect(state.status).toBe('pending')
    expect(state.providers.teskeid).toEqual({ status: 'no_route' })
  })

  it('fails only after all providers terminate without a route', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>(1, providers)
    const afterFailure = reduceFirstReadyCoordinator(initial, {
      type: 'provider_failed',
      runId: 1,
      provider: 'google',
    })
    const state = reduceFirstReadyCoordinator(afterFailure, {
      type: 'provider_no_route',
      runId: 1,
      provider: 'teskeid',
    })

    expect(state.status).toBe('failed')
    expect(state.winner).toBeNull()
    expect(state.selection).toBeNull()
  })

  it('rejects stale events from an older run', () => {
    const current = createFirstReadyCoordinator<Provider, Route>(2, providers)

    const state = reduceFirstReadyCoordinator(current, {
      type: 'provider_ready',
      runId: 1,
      provider: 'google',
      routes: [route('stale-google-route')],
    })

    expect(state).toBe(current)
  })

  it('never overwrites an explicit selection when a provider finishes later', () => {
    const initial = createFirstReadyCoordinator<Provider, Route>(1, providers)
    const googlePrimary = route('google-1')
    const googleAlternative = route('google-2')
    const afterGoogle = reduceFirstReadyCoordinator(initial, {
      type: 'provider_ready',
      runId: 1,
      provider: 'google',
      routes: [googlePrimary, googleAlternative],
    })
    const afterManualSelection = reduceFirstReadyCoordinator(afterGoogle, {
      type: 'manual_select',
      runId: 1,
      provider: 'google',
      route: googleAlternative,
    })

    const state = reduceFirstReadyCoordinator(afterManualSelection, {
      type: 'provider_ready',
      runId: 1,
      provider: 'teskeid',
      routes: [route('teskeid-1')],
    })

    expect(state.winner).toBe('google')
    expect(state.selection).toEqual({
      source: 'manual',
      provider: 'google',
      route: googleAlternative,
    })
  })
})
